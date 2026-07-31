-- Phase G3A: aggregate-only barangay heatmap metrics for Doctor Analytics.
-- Returns one aggregate row per Malvar barangay with all supported heatmap metric counts.
-- No patient names, IDs, addresses, contact information, coordinates, or clinical notes are returned.

create or replace function public.analytics_barangay_heatmap(
  p_from date,
  p_to_exclusive date
)
returns table (
  barangay text,
  registered_patients bigint,
  consultations bigint,
  pending_follow_ups bigint,
  vaccinations bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform analytics_private.require_analytics_role();
  perform analytics_private.validate_period(p_from, p_to_exclusive, 366);

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
      p.registration_date,
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
      on pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(pg_catalog.split_part(a.address_text, ',', 1)), '\s+', ' ', 'g')) = first_segment_match.normalized_label
  ),
  barangay_patients as (
    select distinct cp.patient_id, cp.registration_date, cp.barangay
    from classified_patients as cp
    where cp.barangay in (select mb.label from malvar_barangays as mb)
  ),
  registered_counts as (
    select bp.barangay, pg_catalog.count(*)::bigint as total
    from barangay_patients as bp
    where bp.registration_date >= p_from
      and bp.registration_date < p_to_exclusive
    group by bp.barangay
  ),
  consultation_source as (
    select patient_id, event_date from analytics_private.v_initial_consultation
    union all
    select patient_id, event_date from analytics_private.v_doctor_consultation
  ),
  consultation_counts as (
    select bp.barangay, pg_catalog.count(*)::bigint as total
    from consultation_source as c
    join barangay_patients as bp on bp.patient_id = c.patient_id
    where c.event_date >= p_from
      and c.event_date < p_to_exclusive
    group by bp.barangay
  ),
  pending_followup_counts as (
    select bp.barangay, pg_catalog.count(*)::bigint as total
    from analytics_private.v_follow_up as f
    join barangay_patients as bp on bp.patient_id = f.patient_id
    where f.patient_archive_status_key = 'active'
      and f.status_key = 'pending'
      and f.event_date >= p_from
      and f.event_date < p_to_exclusive
    group by bp.barangay
  ),
  vaccination_events as (
    select
      bp.barangay,
      analytics_private.try_iso_date(f.created_at::text) as activity_date,
      case
        when pg_catalog.jsonb_typeof(f.data_fields::jsonb -> 'vaccine_records') = 'array'
        then pg_catalog.jsonb_array_length(f.data_fields::jsonb -> 'vaccine_records')
        else 1
      end as item_count
    from public.fhsis_logs as f
    join barangay_patients as bp on bp.patient_id::text = f.patient_id::text
    where analytics_private.normalize_key(f.category::text) = 'vaccination'
  ),
  vaccination_counts as (
    select ve.barangay, coalesce(pg_catalog.sum(ve.item_count), 0)::bigint as total
    from vaccination_events as ve
    where ve.activity_date >= p_from
      and ve.activity_date < p_to_exclusive
    group by ve.barangay
  )
  select
    b.label,
    coalesce(r.total, 0)::bigint,
    coalesce(c.total, 0)::bigint,
    coalesce(f.total, 0)::bigint,
    coalesce(v.total, 0)::bigint
  from malvar_barangays as b
  left join registered_counts as r on r.barangay = b.label
  left join consultation_counts as c on c.barangay = b.label
  left join pending_followup_counts as f on f.barangay = b.label
  left join vaccination_counts as v on v.barangay = b.label
  order by b.label asc;
end;
$$;

revoke all on function public.analytics_barangay_heatmap(date, date) from public, anon;
grant execute on function public.analytics_barangay_heatmap(date, date) to authenticated;
