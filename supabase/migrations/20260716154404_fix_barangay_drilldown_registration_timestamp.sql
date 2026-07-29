-- Correct analytics_barangay_drilldown registration timestamp source.
-- public.patients uses created_at as the canonical registration timestamp.

create or replace function public.analytics_barangay_drilldown(
  p_barangay text,
  p_from date,
  p_to_exclusive date
)
returns table (
  metric_key text,
  bucket_start date,
  dimension_key text,
  current_count bigint,
  previous_count bigint,
  reliability text,
  excluded_invalid_date_count bigint,
  fallback_date_count bigint,
  unknown_status_count bigint,
  blank_group_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_barangay text := pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_barangay, '')), '\s+', ' ', 'g');
  v_barangay_key text := pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_barangay, '')), '\s+', ' ', 'g'));
begin
  perform analytics_private.require_analytics_role();
  perform analytics_private.validate_period(p_from, p_to_exclusive, 366);

  if v_barangay_key = '' then
    raise exception 'Barangay is required.' using errcode = '22023';
  end if;

  return query
  with malvar_barangays(label, normalized_label) as (
    values
      ('Bagong Pook', 'bagong pook'),
      ('Bilucao', 'bilucao'),
      ('Bulihan', 'bulihan'),
      ('Luta del Norte', 'luta del norte'),
      ('Luta del Sur', 'luta del sur'),
      ('Poblacion', 'poblacion'),
      ('San Andres', 'san andres'),
      ('San Fernando', 'san fernando'),
      ('San Gregorio', 'san gregorio'),
      ('San Isidro', 'san isidro'),
      ('San Isidro East', 'san isidro east'),
      ('San Juan', 'san juan'),
      ('San Pedro I', 'san pedro i'),
      ('San Pedro II', 'san pedro ii'),
      ('San Pioquinto', 'san pioquinto'),
      ('Santiago', 'santiago')
  ),
  active_patients as (
    select
      p.patient_id,
      analytics_private.try_iso_date(src.created_at::text) as registration_date,
      p.sex_key,
      p.birthday_date,
      p.stored_age,
      p.address_key,
      nullif(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(src.address::text, '')), '\s+', ' ', 'g'), '') as address_text
    from analytics_private.v_patient_current as p
    join public.patients as src
      on src.id = p.patient_id
    where p.archive_status_key = 'active'
  ),
  classified_patients as (
    select
      a.patient_id,
      a.registration_date,
      a.sex_key,
      case
        when a.birthday_date is not null then extract(year from pg_catalog.age(current_date, a.birthday_date))::integer
        else a.stored_age
      end as calculated_age,
      case
        when a.address_text is null then 'Unspecified'
        when exact_match.label is not null then exact_match.label
        when first_segment_match.label is not null then first_segment_match.label
        when a.address_key like '%malvar%' then 'Unspecified'
        when a.address_key like '%lipa%'
          or a.address_key like '%tanauan%'
          or a.address_key like '%santo tomas%'
          or a.address_key like '%sto tomas%'
          or a.address_key like '%balete%'
          or a.address_key like '%cuenca%'
          or a.address_key like '%mataas na kahoy%'
          or a.address_key like '%ibaan%'
          or a.address_key like '%talisay%'
          or a.address_key like '%calamba%'
        then 'Outside Malvar'
        else 'Unspecified'
      end as barangay
    from active_patients as a
    left join malvar_barangays as exact_match
      on a.address_key = exact_match.normalized_label
      or a.address_key = exact_match.normalized_label || ', malvar, batangas'
    left join malvar_barangays as first_segment_match
      on pg_catalog.lower(pg_catalog.btrim(pg_catalog.split_part(a.address_text, ',', 1))) = first_segment_match.normalized_label
  ),
  selected_patients as (
    select *
    from classified_patients as cp
    where pg_catalog.lower(cp.barangay) = v_barangay_key
  ),
  selected_registered_patients as (
    select *
    from selected_patients as sp
    where sp.registration_date >= p_from
      and sp.registration_date < p_to_exclusive
  ),
  selected_patient_ids as (
    select distinct sp.patient_id from selected_patients as sp
  ),
  age_data as (
    select
      case
        when srp.calculated_age is null then 'Unknown'
        when srp.calculated_age < 5 then '0-4'
        when srp.calculated_age < 10 then '5-9'
        when srp.calculated_age < 15 then '10-14'
        when srp.calculated_age < 20 then '15-19'
        when srp.calculated_age < 30 then '20-29'
        when srp.calculated_age < 40 then '30-39'
        when srp.calculated_age < 50 then '40-49'
        when srp.calculated_age < 60 then '50-59'
        else '60+'
      end as age_group,
      pg_catalog.count(*)::bigint as total
    from selected_registered_patients as srp
    group by 1
  ),
  consultation_source as (
    select patient_id, event_date from analytics_private.v_initial_consultation
    union all
    select patient_id, event_date from analytics_private.v_doctor_consultation
  ),
  current_consultations as (
    select pg_catalog.count(*)::bigint as total
    from consultation_source as c
    join selected_patient_ids as p on p.patient_id = c.patient_id
    where c.event_date >= p_from and c.event_date < p_to_exclusive
  ),
  followup_current as (
    select
      pg_catalog.count(*)::bigint as total,
      pg_catalog.count(*) filter (where f.status_key = 'pending')::bigint as pending
    from analytics_private.v_follow_up as f
    join selected_patient_ids as p on p.patient_id = f.patient_id
    where f.event_date >= p_from and f.event_date < p_to_exclusive
  ),
  followup_pending_workload as (
    select pg_catalog.count(*)::bigint as total
    from analytics_private.v_follow_up as f
    join selected_patient_ids as p on p.patient_id = f.patient_id
    where f.patient_archive_status_key = 'active'
      and f.status_key = 'pending'
      and f.event_date >= p_from
      and f.event_date < p_to_exclusive
  ),
  lab_requests as (
    select pg_catalog.count(*)::bigint as total
    from analytics_private.v_lab_request as l
    join selected_patient_ids as p on p.patient_id = l.patient_id
    where l.event_date >= p_from and l.event_date < p_to_exclusive
  ),
  prescriptions as (
    select pg_catalog.count(*)::bigint as total
    from analytics_private.v_prescription as rx
    join selected_patient_ids as p on p.patient_id = rx.patient_id
    where rx.prescribed_date >= p_from and rx.prescribed_date < p_to_exclusive
  ),
  fhsis_selected as (
    select
      analytics_private.normalize_key(f.category::text) as category_key,
      analytics_private.try_iso_date(f.created_at::text) as activity_date,
      case
        when analytics_private.normalize_key(f.category::text) = 'vaccination'
          and pg_catalog.jsonb_typeof(f.data_fields::jsonb -> 'vaccine_records') = 'array'
        then pg_catalog.jsonb_array_length(f.data_fields::jsonb -> 'vaccine_records')
        else 1
      end as item_count
    from public.fhsis_logs as f
    join selected_patient_ids as p on p.patient_id::text = f.patient_id::text
  ),
  fhsis_counts as (
    select
      coalesce(pg_catalog.sum(fs.item_count) filter (where fs.category_key = 'vaccination' and fs.activity_date >= p_from and fs.activity_date < p_to_exclusive), 0)::bigint as vaccinations,
      coalesce(pg_catalog.sum(fs.item_count) filter (where fs.category_key = 'maternal' and fs.activity_date >= p_from and fs.activity_date < p_to_exclusive), 0)::bigint as maternal
    from fhsis_selected as fs
  ),
  clinical_source as (
    select 'diagnosis'::text as text_kind, patient_id, event_date, diagnosis_key as text_key
    from analytics_private.v_initial_consultation
    union all
    select 'complaint', patient_id, event_date, complaint_key
    from analytics_private.v_initial_consultation
    union all
    select 'diagnosis', patient_id, event_date, diagnosis_key
    from analytics_private.v_doctor_consultation
    union all
    select 'complaint', patient_id, event_date, complaint_key
    from analytics_private.v_doctor_consultation
  ),
  clinical_counts as (
    select
      c.text_kind,
      c.text_key,
      pg_catalog.count(*)::bigint as total
    from clinical_source as c
    join selected_patient_ids as p on p.patient_id = c.patient_id
    where c.event_date >= p_from
      and c.event_date < p_to_exclusive
      and c.text_key is not null
    group by c.text_kind, c.text_key
  ),
  clinical_visible as (
    select *
    from clinical_counts as cc
    where cc.total >= 3
  ),
  clinical_ranked as (
    select cv.*,
      pg_catalog.row_number() over (partition by cv.text_kind order by cv.total desc, cv.text_key asc) as rank
    from clinical_visible as cv
  )
  select 'barangay_registered_patients'::text, null::date, v_barangay::text,
    pg_catalog.count(*)::bigint, null::bigint, 'Informational'::text,
    0::bigint, 0::bigint, 0::bigint, 0::bigint
  from selected_registered_patients as srp

  union all
  select 'barangay_sex_distribution', null, coalesce(srp.sex_key, 'unknown'),
    pg_catalog.count(*)::bigint, null::bigint, 'Informational',
    0::bigint, 0::bigint, 0::bigint, pg_catalog.count(*) filter (where srp.sex_key is null)::bigint
  from selected_registered_patients as srp
  group by srp.sex_key

  union all
  select 'barangay_age_distribution', null, ad.age_group,
    ad.total, null::bigint, 'Partially Reliable',
    0::bigint, 0::bigint, 0::bigint, 0::bigint
  from age_data as ad

  union all
  select 'barangay_consultations', null, 'selected_period',
    cc.total, null::bigint, 'Partially Reliable',
    0::bigint, 0::bigint, 0::bigint, 0::bigint
  from current_consultations as cc

  union all
  select 'barangay_follow_ups', null, 'selected_period',
    fc.total, null::bigint, 'Partially Reliable',
    0::bigint, 0::bigint, 0::bigint, 0::bigint
  from followup_current as fc

  union all
  select 'barangay_pending_follow_ups', null, 'current_active_workload',
    fpw.total, null::bigint, 'Partially Reliable',
    0::bigint, 0::bigint, 0::bigint, 0::bigint
  from followup_pending_workload as fpw

  union all
  select 'barangay_vaccinations', null, 'selected_period',
    fhc.vaccinations, null::bigint, 'Partially Reliable',
    0::bigint, 0::bigint, 0::bigint, 0::bigint
  from fhsis_counts as fhc

  union all
  select 'barangay_maternal_care_records', null, 'selected_period',
    fhc.maternal, null::bigint, 'Partially Reliable',
    0::bigint, 0::bigint, 0::bigint, 0::bigint
  from fhsis_counts as fhc

  union all
  select 'barangay_lab_requests', null, 'selected_period',
    lr.total, null::bigint, 'Partially Reliable',
    0::bigint, 0::bigint, 0::bigint, 0::bigint
  from lab_requests as lr

  union all
  select 'barangay_prescriptions', null, 'selected_period',
    pr.total, null::bigint, 'Partially Reliable',
    0::bigint, 0::bigint, 0::bigint, 0::bigint
  from prescriptions as pr

  union all
  select
    case when cr.text_kind = 'diagnosis' then 'barangay_top_diagnoses' else 'barangay_top_complaints' end,
    null::date,
    cr.text_key,
    cr.total,
    null::bigint,
    'Suppressed below 3'::text,
    0::bigint,
    0::bigint,
    0::bigint,
    0::bigint
  from clinical_ranked as cr
  where cr.rank <= 5

  union all
  select
    case when cc.text_kind = 'diagnosis' then 'barangay_suppressed_diagnoses' else 'barangay_suppressed_complaints' end,
    null::date,
    'suppressed_small_count',
    pg_catalog.count(*)::bigint,
    null::bigint,
    'Privacy Suppressed'::text,
    0::bigint,
    0::bigint,
    0::bigint,
    0::bigint
  from clinical_counts as cc
  where cc.total < 3
  group by cc.text_kind;
end;
$$;

revoke all on function public.analytics_barangay_drilldown(text, date, date) from public, anon;
grant execute on function public.analytics_barangay_drilldown(text, date, date) to authenticated;
