-- Corrective G4B RPC with explicit staff and role-total aggregation scopes.
--
-- Staff rows are delegated to the original G4B implementation so their counts,
-- attribution, and reliability remain unchanged. Role turnaround statistics are
-- calculated directly from valid workflow intervals, never from staff averages
-- or medians.
--
-- Lab and prescription starts remain approximate: their date-only values are
-- interpreted as local midnight in Asia/Manila. These values must not be
-- presented as exact staff response-time measurements.

drop function if exists public.analytics_staff_operations_g4b(date,date,text);

create function public.analytics_staff_operations_g4b(
  p_from date,
  p_to_exclusive date,
  p_bucket text default 'day'
)
returns table (
  aggregation_scope text,
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
  with staff_rows as materialized (
    select *
    from public.analytics_staff_operations(p_from, p_to_exclusive, v_bucket)
  ),
  staff_rollups as (
    select
      sr.metric_group,
      sr.metric_key,
      sr.role_key,
      sr.bucket_start,
      case
        when sr.metric_group = 'completion'
          then pg_catalog.sum(sr.count_value)::bigint
        else null::bigint
      end as count_value,
      pg_catalog.sum(sr.attributed_count)::bigint as attributed_count,
      pg_catalog.sum(sr.unattributed_count)::bigint as unattributed_count,
      sr.reliability
    from staff_rows as sr
    group by
      sr.metric_group,
      sr.metric_key,
      sr.role_key,
      sr.bucket_start,
      sr.reliability
  ),
  lab_ranked as (
    select
      analytics_private.try_workflow_timestamptz(q.request_date) as started_at,
      analytics_private.try_workflow_timestamptz(r.date_performed) as completed_at,
      pg_catalog.row_number() over (
        partition by r.labrequest_id
        order by
          analytics_private.try_workflow_timestamptz(r.date_performed) asc nulls last,
          r.labresult_id asc
      ) as completion_rank
    from public.lab_result as r
    join public.lab_request as q on q.labrequest_id = r.labrequest_id
    where r.labrequest_id is not null
      and pg_catalog.lower(pg_catalog.btrim(coalesce(r.status, ''))) = 'completed'
  ),
  turnaround_events as (
    select
      'lab_turnaround_minutes'::text as metric_key,
      'laboratory'::text as role_key,
      lr.completed_at,
      extract(epoch from (lr.completed_at - lr.started_at)) / 60.0
        as duration_minutes
    from lab_ranked as lr
    where lr.completion_rank = 1
      and lr.started_at is not null
      and lr.completed_at is not null
      and lr.completed_at >= lr.started_at
      and lr.completed_at >= v_from_ts
      and lr.completed_at < v_to_ts

    union all

    select
      'prescription_turnaround_minutes'::text,
      'pharmacist'::text,
      parsed.completed_at,
      extract(epoch from (parsed.completed_at - parsed.started_at)) / 60.0
    from public.prescription as rx
    cross join lateral (
      select
        analytics_private.try_workflow_timestamptz(rx.prescription_date) as started_at,
        analytics_private.try_workflow_timestamptz(rx.dispensed_at) as completed_at
    ) as parsed
    where pg_catalog.lower(pg_catalog.btrim(coalesce(rx.status, ''))) = 'dispensed'
      and rx.dispensed_at is not null
      and parsed.started_at is not null
      and parsed.completed_at is not null
      and parsed.completed_at >= parsed.started_at
      and parsed.completed_at >= v_from_ts
      and parsed.completed_at < v_to_ts
  ),
  turnaround_bucketed as (
    select
      te.metric_key,
      te.role_key,
      te.duration_minutes,
      case v_bucket
        when 'day' then
          pg_catalog.date_trunc('day', te.completed_at at time zone 'Asia/Manila')::date
        when 'week' then
          pg_catalog.date_trunc('week', te.completed_at at time zone 'Asia/Manila')::date
        else
          pg_catalog.date_trunc('month', te.completed_at at time zone 'Asia/Manila')::date
      end as bucket_start
    from turnaround_events as te
  ),
  turnaround_rollups as (
    select
      tb.metric_key,
      tb.role_key,
      tb.bucket_start,
      pg_catalog.round(pg_catalog.avg(tb.duration_minutes), 2)
        as duration_minutes_avg,
      pg_catalog.round(
        pg_catalog.percentile_cont(0.5)
          within group (order by tb.duration_minutes)::numeric,
        2
      ) as duration_minutes_median
    from turnaround_bucketed as tb
    group by tb.metric_key, tb.role_key, tb.bucket_start
  ),
  scoped_rows as (
    select
      'staff'::text as aggregation_scope,
      sr.metric_group,
      sr.metric_key,
      sr.role_key,
      sr.staff_user_id,
      sr.staff_display_name,
      sr.bucket_start,
      sr.count_value,
      sr.duration_minutes_avg,
      sr.duration_minutes_median,
      sr.attributed_count,
      sr.unattributed_count,
      sr.reliability,
      sr.attribution_source
    from staff_rows as sr

    union all

    select
      'role_total'::text,
      sr.metric_group,
      sr.metric_key,
      sr.role_key,
      null::uuid,
      null::text,
      sr.bucket_start,
      sr.count_value,
      case
        when sr.metric_group = 'turnaround' then tr.duration_minutes_avg
        else null::numeric
      end,
      case
        when sr.metric_group = 'turnaround' then tr.duration_minutes_median
        else null::numeric
      end,
      sr.attributed_count,
      sr.unattributed_count,
      sr.reliability,
      'workflow_events_role_total'::text
    from staff_rollups as sr
    left join turnaround_rollups as tr
      on tr.metric_key = sr.metric_key
      and tr.role_key = sr.role_key
      and tr.bucket_start = sr.bucket_start
  )
  select
    scoped.aggregation_scope,
    scoped.metric_group,
    scoped.metric_key,
    scoped.role_key,
    scoped.staff_user_id,
    scoped.staff_display_name,
    scoped.bucket_start,
    scoped.count_value,
    scoped.duration_minutes_avg,
    scoped.duration_minutes_median,
    scoped.attributed_count,
    scoped.unattributed_count,
    scoped.reliability,
    scoped.attribution_source
  from scoped_rows as scoped
  order by
    scoped.bucket_start,
    scoped.metric_group,
    scoped.role_key,
    scoped.metric_key,
    scoped.aggregation_scope,
    scoped.staff_display_name nulls last,
    scoped.staff_user_id nulls last;
end;
$$;

comment on function public.analytics_staff_operations_g4b(date,date,text) is
  'Doctor-only aggregate Staff Operations metrics with explicit staff and role_total scopes. Role turnaround averages and medians are calculated directly from valid workflow intervals. Date-only starts remain approximate Asia/Manila local-midnight values.';

revoke all on function public.analytics_staff_operations_g4b(date,date,text)
from public, anon, authenticated;
grant execute on function public.analytics_staff_operations_g4b(date,date,text)
to authenticated;
