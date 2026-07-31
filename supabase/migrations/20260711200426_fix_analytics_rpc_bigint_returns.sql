-- Correct bigint metadata literals in the 11 analytics RPC return queries.
-- Replacing functions is additive and preserves signatures and grants.

create or replace function public.analytics_patient_snapshot()
returns table (
  metric_key text, bucket_start date, dimension_key text,
  current_count bigint, previous_count bigint, reliability text,
  excluded_invalid_date_count bigint, fallback_date_count bigint,
  unknown_status_count bigint, blank_group_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform analytics_private.require_analytics_role();
  return query
  with active as (
    select * from analytics_private.v_patient_current where archive_status_key = 'active'
  ), age_data as (
    select *,
      case
        when birthday_date is not null then extract(year from pg_catalog.age(current_date, birthday_date))::integer
        else stored_age
      end as calculated_age
    from active
  )
  select 'active_patient_total', null::date, 'all', pg_catalog.count(*)::bigint, null::bigint,
    'Reliable', 0::bigint, 0::bigint,
    (select pg_catalog.count(*) from analytics_private.v_patient_current where archive_status_key = 'unknown')::bigint, 0::bigint
  from active
  union all
  select 'patient_sex_distribution', null, coalesce(sex_key, 'unknown'), pg_catalog.count(*), null,
    'Reliable', 0::bigint, 0::bigint, 0::bigint, pg_catalog.count(*) filter (where sex_key is null)
  from active group by sex_key
  union all
  select 'patient_age_distribution', null,
    case when calculated_age is null then 'unknown' when calculated_age < 5 then '0-4'
      when calculated_age < 10 then '5-9' when calculated_age < 15 then '10-14'
      when calculated_age < 20 then '15-19' when calculated_age < 30 then '20-29'
      when calculated_age < 40 then '30-39' when calculated_age < 50 then '40-49'
      when calculated_age < 60 then '50-59' else '60+' end,
    pg_catalog.count(*), null, 'Partially Reliable',
    pg_catalog.count(*) filter (where birthday_date is null and stored_age is null),
    pg_catalog.count(*) filter (where birthday_date is null and stored_age is not null), 0, 0
  from age_data group by 3
  union all
  select 'patient_address_distribution', null, coalesce(address_key, 'unknown'), pg_catalog.count(*), null,
    'Partially Reliable', 0::bigint, 0::bigint, 0::bigint, pg_catalog.count(*) filter (where address_key is null)
  from active group by address_key;
end;
$$;

create or replace function public.analytics_registration_volume(p_from date, p_to_exclusive date, p_bucket text default 'day')
returns table (
  metric_key text, bucket_start date, dimension_key text,
  current_count bigint, previous_count bigint, reliability text,
  excluded_invalid_date_count bigint, fallback_date_count bigint,
  unknown_status_count bigint, blank_group_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare v_bucket text; v_span integer;
begin
  perform analytics_private.require_analytics_role();
  perform analytics_private.validate_period(p_from, p_to_exclusive, 366);
  v_bucket := analytics_private.validate_bucket(p_bucket); v_span := p_to_exclusive - p_from;
  return query
  with current_rows as (
    select pg_catalog.date_trunc(v_bucket, registration_date::timestamp)::date as b, pg_catalog.count(*)::bigint as n
    from analytics_private.v_patient_current where registration_date >= p_from and registration_date < p_to_exclusive group by 1
  ), previous_rows as (
    select (pg_catalog.date_trunc(v_bucket, registration_date::timestamp)::date + v_span) as b, pg_catalog.count(*)::bigint as n
    from analytics_private.v_patient_current where registration_date >= p_from - v_span and registration_date < p_from group by 1
  ), invalid as (
    select pg_catalog.count(*)::bigint as n from analytics_private.v_patient_current where registration_date is null
  )
  select 'new_patient_registrations', coalesce(c.b, p.b), 'all', coalesce(c.n, 0), coalesce(p.n, 0),
    'Partially Reliable', invalid.n, 0::bigint, 0::bigint, 0::bigint
  from current_rows c full join previous_rows p using (b) cross join invalid order by 2;
end; $$;

create or replace function public.analytics_consultation_volume(p_from date, p_to_exclusive date, p_bucket text default 'day')
returns table (
  metric_key text, bucket_start date, dimension_key text,
  current_count bigint, previous_count bigint, reliability text,
  excluded_invalid_date_count bigint, fallback_date_count bigint,
  unknown_status_count bigint, blank_group_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare v_bucket text; v_span integer;
begin
  perform analytics_private.require_analytics_role(); perform analytics_private.validate_period(p_from, p_to_exclusive, 366);
  v_bucket := analytics_private.validate_bucket(p_bucket); v_span := p_to_exclusive - p_from;
  return query
  with source as (
    select 'initial_consultation'::text as kind, event_date from analytics_private.v_initial_consultation
    union all select 'doctor_consultation', event_date from analytics_private.v_doctor_consultation
  ), cur as (
    select kind, pg_catalog.date_trunc(v_bucket, event_date::timestamp)::date b, pg_catalog.count(*)::bigint n
    from source where event_date >= p_from and event_date < p_to_exclusive group by 1,2
  ), prev as (
    select kind, pg_catalog.date_trunc(v_bucket, event_date::timestamp)::date + v_span b, pg_catalog.count(*)::bigint n
    from source where event_date >= p_from-v_span and event_date < p_from group by 1,2
  ), dq as (select kind, pg_catalog.count(*) filter (where event_date is null)::bigint invalid from source group by kind)
  select 'consultation_volume', coalesce(c.b,p.b), coalesce(c.kind,p.kind),
    coalesce(c.n,0), coalesce(p.n,0), 'Partially Reliable', dq.invalid, 0::bigint, 0::bigint, 0::bigint
  from cur c full join prev p using (kind,b) join dq on dq.kind=coalesce(c.kind,p.kind) order by 2,3;
end; $$;

create or replace function public.analytics_lab_activity(
  p_from date, p_to_exclusive date, p_bucket text default 'day', p_scope text default 'historical'
)
returns table (
  metric_key text, bucket_start date, dimension_key text,
  current_count bigint, previous_count bigint, reliability text,
  excluded_invalid_date_count bigint, fallback_date_count bigint,
  unknown_status_count bigint, blank_group_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare v_bucket text; v_span integer; v_scope text;
begin
  perform analytics_private.require_analytics_role(); perform analytics_private.validate_period(p_from,p_to_exclusive,366);
  v_bucket:=analytics_private.validate_bucket(p_bucket); v_span:=p_to_exclusive-p_from; v_scope:=pg_catalog.lower(pg_catalog.btrim(p_scope));
  if v_scope not in ('historical','current_active_workload') then raise exception 'Unsupported analytics scope.' using errcode='22023'; end if;
  return query
  with source as (
    select 'lab_request_status'::text kind, event_date, status_key,
      (v_scope='historical' or patient_archive_status_key='active') included
    from analytics_private.v_lab_request
    union all
    select 'completed_lab_results', event_date, status_key, true from analytics_private.v_lab_result where status_key='completed'
  ), cur as (
    select kind,status_key,pg_catalog.date_trunc(v_bucket,event_date::timestamp)::date b,pg_catalog.count(*)::bigint n
    from source where included and event_date>=p_from and event_date<p_to_exclusive group by 1,2,3
  ), prev as (
    select kind,status_key,pg_catalog.date_trunc(v_bucket,event_date::timestamp)::date+v_span b,pg_catalog.count(*)::bigint n
    from source where included and event_date>=p_from-v_span and event_date<p_from group by 1,2,3
  ), dq as (
    select kind,pg_catalog.count(*) filter(where event_date is null)::bigint invalid,
      pg_catalog.count(*) filter(where status_key='unknown')::bigint unknown from source group by kind
  )
  select coalesce(c.kind,p.kind),coalesce(c.b,p.b),coalesce(c.status_key,p.status_key),
    coalesce(c.n,0),coalesce(p.n,0),'Partially Reliable',dq.invalid,0::bigint,dq.unknown,0::bigint
  from cur c full join prev p using(kind,status_key,b) join dq on dq.kind=coalesce(c.kind,p.kind) order by 1,2,3;
end; $$;

create or replace function public.analytics_prescription_activity(
  p_from date, p_to_exclusive date, p_bucket text default 'day', p_date_mode text default 'prescribed', p_scope text default 'historical'
)
returns table (
  metric_key text, bucket_start date, dimension_key text,
  current_count bigint, previous_count bigint, reliability text,
  excluded_invalid_date_count bigint, fallback_date_count bigint,
  unknown_status_count bigint, blank_group_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare v_bucket text; v_span integer; v_mode text; v_scope text;
begin
  perform analytics_private.require_analytics_role(); perform analytics_private.validate_period(p_from,p_to_exclusive,366);
  v_bucket:=analytics_private.validate_bucket(p_bucket); v_span:=p_to_exclusive-p_from;
  v_mode:=pg_catalog.lower(pg_catalog.btrim(p_date_mode)); v_scope:=pg_catalog.lower(pg_catalog.btrim(p_scope));
  if v_mode not in ('prescribed','dispensed') then raise exception 'Unsupported prescription date mode.' using errcode='22023'; end if;
  if v_scope not in ('historical','current_active_workload') then raise exception 'Unsupported analytics scope.' using errcode='22023'; end if;
  return query
  with source as (
    select status_key,case when v_mode='prescribed' then prescribed_date else dispensed_date end event_date
    from analytics_private.v_prescription where v_scope='historical' or patient_archive_status_key='active'
  ),cur as(select status_key,pg_catalog.date_trunc(v_bucket,event_date::timestamp)::date b,pg_catalog.count(*)::bigint n from source where event_date>=p_from and event_date<p_to_exclusive group by 1,2),
  prev as(select status_key,pg_catalog.date_trunc(v_bucket,event_date::timestamp)::date+v_span b,pg_catalog.count(*)::bigint n from source where event_date>=p_from-v_span and event_date<p_from group by 1,2),
  dq as(select pg_catalog.count(*) filter(where event_date is null)::bigint invalid,pg_catalog.count(*) filter(where status_key='unknown')::bigint unknown from source)
  select 'prescription_status',coalesce(c.b,p.b),coalesce(c.status_key,p.status_key),coalesce(c.n,0),coalesce(p.n,0),
    'Partially Reliable',dq.invalid,0::bigint,dq.unknown,0::bigint from cur c full join prev p using(status_key,b) cross join dq order by 2,3;
end; $$;

create or replace function public.analytics_follow_up_activity(
  p_from date, p_to_exclusive date, p_bucket text default 'day', p_scope text default 'historical'
)
returns table (
  metric_key text, bucket_start date, dimension_key text,
  current_count bigint, previous_count bigint, reliability text,
  excluded_invalid_date_count bigint, fallback_date_count bigint,
  unknown_status_count bigint, blank_group_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare v_bucket text; v_span integer; v_scope text;
begin
  perform analytics_private.require_analytics_role(); perform analytics_private.validate_period(p_from,p_to_exclusive,366);
  v_bucket:=analytics_private.validate_bucket(p_bucket);v_span:=p_to_exclusive-p_from;v_scope:=pg_catalog.lower(pg_catalog.btrim(p_scope));
  if v_scope not in ('historical','current_active_workload') then raise exception 'Unsupported analytics scope.' using errcode='22023'; end if;
  return query
  with source as(select event_date,status_key from analytics_private.v_follow_up where v_scope='historical' or patient_archive_status_key='active'),
  cur as(select status_key,pg_catalog.date_trunc(v_bucket,event_date::timestamp)::date b,pg_catalog.count(*)::bigint n from source where event_date>=p_from and event_date<p_to_exclusive group by 1,2),
  prev as(select status_key,pg_catalog.date_trunc(v_bucket,event_date::timestamp)::date+v_span b,pg_catalog.count(*)::bigint n from source where event_date>=p_from-v_span and event_date<p_from group by 1,2),
  dq as(select pg_catalog.count(*) filter(where event_date is null)::bigint invalid,pg_catalog.count(*) filter(where status_key='unknown')::bigint unknown from source)
  select 'follow_up_status',coalesce(c.b,p.b),coalesce(c.status_key,p.status_key),coalesce(c.n,0),coalesce(p.n,0),
    'Partially Reliable',dq.invalid,0::bigint,dq.unknown,0::bigint from cur c full join prev p using(status_key,b) cross join dq order by 2,3;
end; $$;

create or replace function public.analytics_fhsis_activity(p_from_month date,p_to_month_exclusive date)
returns table (
  metric_key text, bucket_start date, dimension_key text,
  current_count bigint, previous_count bigint, reliability text,
  excluded_invalid_date_count bigint, fallback_date_count bigint,
  unknown_status_count bigint, blank_group_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare v_months integer;
begin
  perform analytics_private.require_analytics_role(); perform analytics_private.validate_period(p_from_month,p_to_month_exclusive,1863);
  if p_from_month<>pg_catalog.date_trunc('month',p_from_month::timestamp)::date or p_to_month_exclusive<>pg_catalog.date_trunc('month',p_to_month_exclusive::timestamp)::date then
    raise exception 'FHSIS bounds must start on the first day of a month.' using errcode='22023';
  end if;
  v_months:=(extract(year from pg_catalog.age(p_to_month_exclusive,p_from_month))*12+extract(month from pg_catalog.age(p_to_month_exclusive,p_from_month)))::integer;
  if v_months>60 then raise exception 'FHSIS range exceeds 60 months.' using errcode='22023'; end if;
  return query
  with cur as(select report_month b,category_key,pg_catalog.count(*)::bigint n from analytics_private.v_fhsis_activity where report_month>=p_from_month and report_month<p_to_month_exclusive and category_key is not null group by 1,2),
  prev as(select (report_month+(v_months||' months')::interval)::date b,category_key,pg_catalog.count(*)::bigint n from analytics_private.v_fhsis_activity where report_month>=p_from_month-(v_months||' months')::interval and report_month<p_from_month and category_key is not null group by 1,2),
  dq as(select pg_catalog.count(*) filter(where report_month is null)::bigint invalid,pg_catalog.count(*) filter(where category_key is null)::bigint blank from analytics_private.v_fhsis_activity)
  select 'fhsis_category',coalesce(c.b,p.b),coalesce(c.category_key,p.category_key,'unknown'),coalesce(c.n,0),coalesce(p.n,0),
    'Reliable',dq.invalid,0::bigint,0::bigint,dq.blank from cur c full join prev p using(b,category_key) cross join dq order by 2,3;
end; $$;

create or replace function public.analytics_audit_activity(
  p_from date,p_to_exclusive date,p_bucket text default 'day',p_group_by text default 'role'
)
returns table (
  metric_key text, bucket_start date, dimension_key text,
  current_count bigint, previous_count bigint, reliability text,
  excluded_invalid_date_count bigint, fallback_date_count bigint,
  unknown_status_count bigint, blank_group_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare v_bucket text;v_span integer;v_group text;
begin
  perform analytics_private.require_analytics_role();perform analytics_private.validate_period(p_from,p_to_exclusive,366);
  v_bucket:=analytics_private.validate_bucket(p_bucket);v_span:=p_to_exclusive-p_from;v_group:=pg_catalog.lower(pg_catalog.btrim(p_group_by));
  if v_group not in ('role','module','action') then raise exception 'Unsupported audit grouping.' using errcode='22023'; end if;
  return query
  with source as(select event_date,case v_group when 'role' then role_key when 'module' then module_key else action_key end dimension from analytics_private.v_audit_activity),
  cur as(select dimension,pg_catalog.date_trunc(v_bucket,event_date::timestamp)::date b,pg_catalog.count(*)::bigint n from source where event_date>=p_from and event_date<p_to_exclusive group by 1,2),
  prev as(select dimension,pg_catalog.date_trunc(v_bucket,event_date::timestamp)::date+v_span b,pg_catalog.count(*)::bigint n from source where event_date>=p_from-v_span and event_date<p_from group by 1,2),
  dq as(select pg_catalog.count(*) filter(where event_date is null)::bigint invalid,pg_catalog.count(*) filter(where dimension in ('unknown','other'))::bigint unknown from source)
  select 'audit_activity_'||v_group,coalesce(c.b,p.b),coalesce(c.dimension,p.dimension),coalesce(c.n,0),coalesce(p.n,0),
    'Partially Reliable',dq.invalid,0::bigint,dq.unknown,0::bigint from cur c full join prev p using(dimension,b) cross join dq order by 2,3;
end; $$;

create or replace function public.analytics_archive_activity(p_from date,p_to_exclusive date,p_bucket text default 'day')
returns table (
  metric_key text, bucket_start date, dimension_key text,
  current_count bigint, previous_count bigint, reliability text,
  excluded_invalid_date_count bigint, fallback_date_count bigint,
  unknown_status_count bigint, blank_group_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare v_bucket text;v_span integer;
begin
  perform analytics_private.require_analytics_role();perform analytics_private.validate_period(p_from,p_to_exclusive,366);
  v_bucket:=analytics_private.validate_bucket(p_bucket);v_span:=p_to_exclusive-p_from;
  return query
  with source as(select event_date,event_type_key from analytics_private.v_archive_activity),
  cur as(select event_type_key,pg_catalog.date_trunc(v_bucket,event_date::timestamp)::date b,pg_catalog.count(*)::bigint n from source where event_date>=p_from and event_date<p_to_exclusive and event_type_key<>'unknown' group by 1,2),
  prev as(select event_type_key,pg_catalog.date_trunc(v_bucket,event_date::timestamp)::date+v_span b,pg_catalog.count(*)::bigint n from source where event_date>=p_from-v_span and event_date<p_from and event_type_key<>'unknown' group by 1,2),
  dq as(select pg_catalog.count(*) filter(where event_date is null)::bigint invalid,pg_catalog.count(*) filter(where event_type_key='unknown')::bigint unknown from source)
  select 'archive_activity',coalesce(c.b,p.b),coalesce(c.event_type_key,p.event_type_key),coalesce(c.n,0),coalesce(p.n,0),
    'Reliable',dq.invalid,0::bigint,dq.unknown,0::bigint from cur c full join prev p using(event_type_key,b) cross join dq order by 2,3;
end; $$;

create or replace function public.analytics_clinical_text_frequency(
  p_from date,p_to_exclusive date,p_text_kind text,p_source text,p_limit integer default 10
)
returns table (
  metric_key text, bucket_start date, dimension_key text,
  current_count bigint, previous_count bigint, reliability text,
  excluded_invalid_date_count bigint, fallback_date_count bigint,
  unknown_status_count bigint, blank_group_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare v_kind text;v_source text;v_span integer;
begin
  perform analytics_private.require_analytics_role();perform analytics_private.validate_period(p_from,p_to_exclusive,366);
  v_kind:=pg_catalog.lower(pg_catalog.btrim(p_text_kind));v_source:=pg_catalog.lower(pg_catalog.btrim(p_source));v_span:=p_to_exclusive-p_from;
  if v_kind not in ('diagnosis','complaint') then raise exception 'Unsupported clinical text kind.' using errcode='22023';end if;
  if v_source not in ('initial_consultation','doctor_consultation','all') then raise exception 'Unsupported clinical text source.' using errcode='22023';end if;
  if p_limit is null or p_limit<1 or p_limit>50 then raise exception 'Clinical text limit must be between 1 and 50.' using errcode='22023';end if;
  return query
  with source as(select * from analytics_private.v_clinical_text where text_kind=v_kind and (v_source='all' or source_key=v_source)),
  cur as(select text_key,pg_catalog.count(*)::bigint n from source where event_date>=p_from and event_date<p_to_exclusive and text_key is not null group by text_key order by n desc,text_key limit p_limit),
  prev as(select text_key,pg_catalog.count(*)::bigint n from source where event_date>=p_from-v_span and event_date<p_from and text_key is not null group by text_key),
  dq as(select pg_catalog.count(*) filter(where event_date is null)::bigint invalid,pg_catalog.count(*) filter(where text_key is null)::bigint blank from source)
  select 'clinical_'||v_kind||'_frequency',null::date,c.text_key,c.n,coalesce(p.n,0),'Partially Reliable',dq.invalid,0::bigint,0::bigint,dq.blank
  from cur c left join prev p using(text_key) cross join dq order by c.n desc,c.text_key;
end; $$;

create or replace function public.analytics_data_quality(p_from date,p_to_exclusive date)
returns table (
  metric_key text, bucket_start date, dimension_key text,
  current_count bigint, previous_count bigint, reliability text,
  excluded_invalid_date_count bigint, fallback_date_count bigint,
  unknown_status_count bigint, blank_group_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform analytics_private.require_analytics_role();perform analytics_private.validate_period(p_from,p_to_exclusive,366);
  return query
  select 'data_quality',null::date,'patients',0::bigint,0::bigint,'Informational',
    pg_catalog.count(*) filter(where registration_date is null),pg_catalog.count(*) filter(where birthday_date is null and stored_age is not null),
    pg_catalog.count(*) filter(where archive_status_key='unknown'),pg_catalog.count(*) filter(where sex_key is null or address_key is null)
  from analytics_private.v_patient_current
  union all select 'data_quality',null::date,'initial_consultation',0,0,'Informational',pg_catalog.count(*) filter(where event_date is null),0,0,pg_catalog.count(*) filter(where diagnosis_key is null or complaint_key is null) from analytics_private.v_initial_consultation
  union all select 'data_quality',null::date,'doctor_consultation',0,0,'Informational',pg_catalog.count(*) filter(where event_date is null),0,0,pg_catalog.count(*) filter(where diagnosis_key is null or complaint_key is null) from analytics_private.v_doctor_consultation
  union all select 'data_quality',null::date,'lab_request',0,0,'Informational',pg_catalog.count(*) filter(where event_date is null),0,pg_catalog.count(*) filter(where status_key='unknown'),0 from analytics_private.v_lab_request
  union all select 'data_quality',null::date,'lab_result',0,0,'Informational',pg_catalog.count(*) filter(where event_date is null),0,pg_catalog.count(*) filter(where status_key='unknown'),0 from analytics_private.v_lab_result
  union all select 'data_quality',null::date,'prescription',0,0,'Informational',pg_catalog.count(*) filter(where prescribed_date is null),0,pg_catalog.count(*) filter(where status_key='unknown'),0 from analytics_private.v_prescription
  union all select 'data_quality',null::date,'follow_up',0,0,'Informational',pg_catalog.count(*) filter(where event_date is null),0,pg_catalog.count(*) filter(where status_key='unknown'),0 from analytics_private.v_follow_up
  union all select 'data_quality',null::date,'fhsis',0,0,'Informational',pg_catalog.count(*) filter(where report_month is null),0,0,pg_catalog.count(*) filter(where category_key is null) from analytics_private.v_fhsis_activity
  union all select 'data_quality',null::date,'audit',0,0,'Informational',pg_catalog.count(*) filter(where event_date is null),0,pg_catalog.count(*) filter(where role_key='unknown' or module_key='other' or action_key='other'),0 from analytics_private.v_audit_activity
  union all select 'data_quality',null::date,'archive',0,0,'Informational',pg_catalog.count(*) filter(where event_date is null),0,pg_catalog.count(*) filter(where event_type_key='unknown'),0 from analytics_private.v_archive_activity;
end; $$;

