-- Phase G4B: Doctor-only Staff Operations aggregates.
--
-- Turnaround metrics are approximate elapsed durations. Their start fields are
-- date-only values interpreted as local midnight in Asia/Manila, so they must
-- not be presented as exact staff response-time measurements.

create or replace function analytics_private.try_workflow_timestamptz(p_value text)
returns timestamptz
language plpgsql
immutable
strict
parallel safe
set search_path = ''
as $$
declare
  v_value text := pg_catalog.btrim(p_value);
  v_date date;
begin
  if v_value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    v_date := analytics_private.try_iso_date(v_value);
    if v_date is null then return null; end if;
    return v_date::timestamp without time zone at time zone 'Asia/Manila';
  end if;

  if v_value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?(Z|[+-][0-9]{2}(:[0-9]{2}|[0-9]{2})?)$' then
    return v_value::timestamptz;
  end if;

  if v_value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?$' then
    return pg_catalog.replace(v_value, 'T', ' ')::timestamp without time zone
      at time zone 'Asia/Manila';
  end if;

  return null;
exception when others then return null;
end;
$$;

create or replace function analytics_private.require_staff_operations_role()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if (select auth.uid()) is null then
    raise exception 'Staff Operations access requires authentication.' using errcode = '42501';
  end if;

  select pg_catalog.lower(pg_catalog.btrim(p.role))
  into v_role
  from public.profiles as p
  where p.id = (select auth.uid())
  limit 1;

  if v_role is distinct from 'doctor' then
    raise exception 'Staff Operations access is limited to Doctor accounts.' using errcode = '42501';
  end if;
end;
$$;

comment on function analytics_private.require_staff_operations_role() is
  'Doctor-only authorization boundary for Staff Operations RPCs. Do not replace with the Clinical and Geographic Analytics helper.';

revoke all on function analytics_private.try_workflow_timestamptz(text)
from public, anon, authenticated;
revoke all on function analytics_private.require_staff_operations_role()
from public, anon, authenticated;

create or replace function public.analytics_staff_operations(
  p_from date,
  p_to_exclusive date,
  p_bucket text default 'day'
)
returns table (
  metric_group text,
  metric_key text,
  role_key text,
  staff_user_id uuid,
  staff_display_name text,
  bucket_start date,
  count_value bigint,
  duration_minutes_avg numeric,
  duration_minutes_median numeric,
  attributed_count bigint,
  unattributed_count bigint,
  reliability text,
  attribution_source text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_bucket text;
  v_from_ts timestamptz;
  v_to_ts timestamptz;
begin
  perform analytics_private.require_staff_operations_role();
  perform analytics_private.validate_period(p_from, p_to_exclusive, 366);
  v_bucket := analytics_private.validate_bucket(p_bucket);
  v_from_ts := p_from::timestamp without time zone at time zone 'Asia/Manila';
  v_to_ts := p_to_exclusive::timestamp without time zone at time zone 'Asia/Manila';

  return query
  with audit_candidates as (
    select
      a.id,
      a.created_at,
      a.user_id,
      coalesce(
        nullif(pg_catalog.btrim(p.full_name), ''),
        nullif(pg_catalog.btrim(a.user_name), '')
      ) as staff_name,
      case
        when pg_catalog.lower(pg_catalog.btrim(coalesce(a.record_type, ''))) = 'consultation'
          and pg_catalog.lower(pg_catalog.btrim(a.action)) = 'create'
          and pg_catalog.lower(pg_catalog.btrim(coalesce(a.user_role, ''))) = 'doctor'
          then 'consultation'
        when pg_catalog.lower(pg_catalog.btrim(coalesce(a.record_type, ''))) = 'follow_up'
          and pg_catalog.lower(pg_catalog.btrim(coalesce(a.metadata ->> 'status', ''))) = 'done'
          and pg_catalog.lower(pg_catalog.btrim(coalesce(a.user_role, ''))) = 'doctor'
          then 'follow_up'
        when pg_catalog.lower(pg_catalog.btrim(coalesce(a.record_type, ''))) in ('lab_request', 'lab_result')
          and pg_catalog.lower(pg_catalog.btrim(coalesce(a.metadata ->> 'status', ''))) = 'completed'
          and pg_catalog.lower(pg_catalog.btrim(coalesce(a.user_role, ''))) = 'labaratory'
          then 'lab_request'
        when pg_catalog.lower(pg_catalog.btrim(coalesce(a.record_type, ''))) = 'prescription'
          and (
            pg_catalog.lower(pg_catalog.btrim(a.action)) = 'dispense'
            or pg_catalog.lower(pg_catalog.btrim(coalesce(a.metadata ->> 'status', ''))) = 'dispensed'
          )
          and pg_catalog.lower(pg_catalog.btrim(coalesce(a.user_role, ''))) = 'pharmacist'
          then 'prescription'
        else null
      end as workflow_kind,
      case
        when pg_catalog.lower(pg_catalog.btrim(coalesce(a.record_type, ''))) = 'consultation'
          then coalesce(nullif(a.metadata ->> 'consultation_id', ''), nullif(a.record_id, ''))
        when pg_catalog.lower(pg_catalog.btrim(coalesce(a.record_type, ''))) = 'follow_up'
          then coalesce(nullif(a.metadata ->> 'followup_id', ''), nullif(a.record_id, ''))
        when pg_catalog.lower(pg_catalog.btrim(coalesce(a.record_type, ''))) = 'lab_request'
          then coalesce(nullif(a.metadata ->> 'labrequest_id', ''), nullif(a.record_id, ''))
        when pg_catalog.lower(pg_catalog.btrim(coalesce(a.record_type, ''))) = 'lab_result'
          then nullif(a.metadata ->> 'labrequest_id', '')
        when pg_catalog.lower(pg_catalog.btrim(coalesce(a.record_type, ''))) = 'prescription'
          then coalesce(nullif(a.metadata ->> 'prescription_id', ''), nullif(a.record_id, ''))
        else null
      end as workflow_id
    from public.audit_logs as a
    left join public.profiles as p on p.id = a.user_id
    where a.user_id is not null
      and pg_catalog.lower(pg_catalog.btrim(coalesce(a.record_type, '')))
        in ('consultation', 'follow_up', 'lab_request', 'lab_result', 'prescription')
  ),
  audit_deduplicated as (
    select workflow_kind, workflow_id, user_id, staff_name
    from (
      select
        ac.*,
        pg_catalog.row_number() over (
          partition by ac.workflow_kind, ac.workflow_id
          order by ac.created_at asc, ac.id asc
        ) as event_rank
      from audit_candidates as ac
      where ac.workflow_kind is not null and ac.workflow_id is not null
    ) as ranked
    where ranked.event_rank = 1
  ),
  consultation_events as (
    select
      'doctor'::text as role_key,
      analytics_private.try_workflow_timestamptz(i.consultation_date) as completed_at,
      ad.user_id as staff_user_id,
      ad.staff_name as staff_display_name
    from public.consultation as c
    join public.initial_consultation as i
      on i.initialconsultation_id = c.initial_consultation_id
    left join audit_deduplicated as ad
      on ad.workflow_kind = 'consultation'
      and ad.workflow_id = c.consultation_id::text
  ),
  follow_up_events as (
    select
      'doctor'::text as role_key,
      analytics_private.try_workflow_timestamptz(f.visit_date) as completed_at,
      ad.user_id as staff_user_id,
      ad.staff_name as staff_display_name
    from public.follow_up as f
    left join audit_deduplicated as ad
      on ad.workflow_kind = 'follow_up'
      and ad.workflow_id = f.followup_id::text
    where pg_catalog.lower(pg_catalog.btrim(coalesce(f.follow_up_status, ''))) = 'done'
  ),
  lab_ranked as (
    select
      r.labrequest_id,
      analytics_private.try_workflow_timestamptz(q.request_date) as started_at,
      analytics_private.try_workflow_timestamptz(r.date_performed) as completed_at,
      pg_catalog.row_number() over (
        partition by r.labrequest_id
        order by analytics_private.try_workflow_timestamptz(r.date_performed) asc nulls last,
          r.labresult_id asc
      ) as completion_rank
    from public.lab_result as r
    join public.lab_request as q on q.labrequest_id = r.labrequest_id
    where r.labrequest_id is not null
      and pg_catalog.lower(pg_catalog.btrim(coalesce(r.status, ''))) = 'completed'
  ),
  lab_events as (
    select
      'laboratory'::text as role_key,
      lr.completed_at,
      ad.user_id as staff_user_id,
      ad.staff_name as staff_display_name,
      case
        when lr.started_at is not null and lr.completed_at is not null
          and lr.completed_at >= lr.started_at
          then extract(epoch from (lr.completed_at - lr.started_at)) / 60.0
        else null
      end as turnaround_minutes
    from lab_ranked as lr
    left join audit_deduplicated as ad
      on ad.workflow_kind = 'lab_request'
      and ad.workflow_id = lr.labrequest_id::text
    where lr.completion_rank = 1
  ),
  prescription_events as (
    select
      'pharmacist'::text as role_key,
      parsed.completed_at,
      ad.user_id as staff_user_id,
      ad.staff_name as staff_display_name,
      case
        when parsed.started_at is not null and parsed.completed_at is not null
          and parsed.completed_at >= parsed.started_at
          then extract(epoch from (parsed.completed_at - parsed.started_at)) / 60.0
        else null
      end as turnaround_minutes
    from public.prescription as rx
    cross join lateral (
      select
        analytics_private.try_workflow_timestamptz(rx.prescription_date) as started_at,
        analytics_private.try_workflow_timestamptz(rx.dispensed_at) as completed_at
    ) as parsed
    left join audit_deduplicated as ad
      on ad.workflow_kind = 'prescription'
      and ad.workflow_id = rx.prescription_id::text
    where pg_catalog.lower(pg_catalog.btrim(coalesce(rx.status, ''))) = 'dispensed'
      and rx.dispensed_at is not null
  ),
  metric_events as (
    select 'completion'::text metric_group, 'consultations_completed'::text metric_key,
      ce.role_key, ce.completed_at, ce.staff_user_id, ce.staff_display_name,
      null::numeric duration_minutes, 'medium'::text reliability,
      case when ce.staff_user_id is null then 'workflow_only_unattributed'
        else 'audit_logs_deduplicated' end::text attribution_source
    from consultation_events ce
    where ce.completed_at >= v_from_ts and ce.completed_at < v_to_ts

    union all
    select 'completion','follow_ups_completed',fe.role_key,fe.completed_at,
      fe.staff_user_id,fe.staff_display_name,null::numeric,'high',
      case when fe.staff_user_id is null then 'workflow_only_unattributed'
        else 'audit_logs_deduplicated' end
    from follow_up_events fe
    where fe.completed_at >= v_from_ts and fe.completed_at < v_to_ts

    union all
    select 'completion','lab_requests_completed',le.role_key,le.completed_at,
      le.staff_user_id,le.staff_display_name,null::numeric,'high',
      case when le.staff_user_id is null then 'workflow_only_unattributed'
        else 'audit_logs_deduplicated' end
    from lab_events le
    where le.completed_at >= v_from_ts and le.completed_at < v_to_ts

    union all
    select 'turnaround','lab_turnaround_minutes',le.role_key,le.completed_at,
      le.staff_user_id,le.staff_display_name,le.turnaround_minutes,'approximate',
      case when le.staff_user_id is null then 'workflow_only_unattributed'
        else 'audit_logs_deduplicated' end
    from lab_events le
    where le.completed_at >= v_from_ts and le.completed_at < v_to_ts
      and le.turnaround_minutes is not null

    union all
    select 'completion','prescriptions_dispensed',pe.role_key,pe.completed_at,
      pe.staff_user_id,pe.staff_display_name,null::numeric,'high',
      case when pe.staff_user_id is null then 'workflow_only_unattributed'
        else 'audit_logs_deduplicated' end
    from prescription_events pe
    where pe.completed_at >= v_from_ts and pe.completed_at < v_to_ts

    union all
    select 'turnaround','prescription_turnaround_minutes',pe.role_key,pe.completed_at,
      pe.staff_user_id,pe.staff_display_name,pe.turnaround_minutes,'approximate',
      case when pe.staff_user_id is null then 'workflow_only_unattributed'
        else 'audit_logs_deduplicated' end
    from prescription_events pe
    where pe.completed_at >= v_from_ts and pe.completed_at < v_to_ts
      and pe.turnaround_minutes is not null
  ),
  bucketed as (
    select me.*,
      case v_bucket
        when 'day' then pg_catalog.date_trunc('day',me.completed_at at time zone 'Asia/Manila')::date
        when 'week' then pg_catalog.date_trunc('week',me.completed_at at time zone 'Asia/Manila')::date
        else pg_catalog.date_trunc('month',me.completed_at at time zone 'Asia/Manila')::date
      end as bucket_start
    from metric_events me
  )
  select
    b.metric_group,b.metric_key,b.role_key,b.staff_user_id,b.staff_display_name,b.bucket_start,
    case when b.metric_group='completion' then pg_catalog.count(*)::bigint else null::bigint end count_value,
    case when b.metric_group='turnaround' then pg_catalog.round(pg_catalog.avg(b.duration_minutes),2) else null::numeric end duration_minutes_avg,
    case when b.metric_group='turnaround' then pg_catalog.round(pg_catalog.percentile_cont(0.5) within group (order by b.duration_minutes)::numeric,2) else null::numeric end duration_minutes_median,
    pg_catalog.count(*) filter(where b.staff_user_id is not null)::bigint attributed_count,
    pg_catalog.count(*) filter(where b.staff_user_id is null)::bigint unattributed_count,
    b.reliability,b.attribution_source
  from bucketed b
  group by b.metric_group,b.metric_key,b.role_key,b.staff_user_id,b.staff_display_name,
    b.bucket_start,b.reliability,b.attribution_source
  order by b.bucket_start,b.metric_group,b.role_key,b.metric_key,
    b.staff_display_name nulls last,b.staff_user_id nulls last;
end;
$$;

comment on function public.analytics_staff_operations(date,date,text) is
  'Doctor-only aggregate Staff Operations metrics. Turnaround values are approximate because date-only starts are interpreted as Asia/Manila local midnight.';

revoke all on function public.analytics_staff_operations(date,date,text)
from public, anon, authenticated;
grant execute on function public.analytics_staff_operations(date,date,text)
to authenticated;
