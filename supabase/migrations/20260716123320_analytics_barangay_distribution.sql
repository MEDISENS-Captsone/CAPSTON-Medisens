-- Phase G1: aggregate-only barangay analytics foundation for Doctor Analytics.
-- This does not alter patient records, normalize addresses, add boundaries, or expose exact locations.

create or replace function public.analytics_barangay_distribution()
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
begin
  perform analytics_private.require_analytics_role();

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
      ('San Juan', 'san juan'),
      ('San Pedro I', 'san pedro i'),
      ('San Pedro II', 'san pedro ii'),
      ('San Pioquinto', 'san pioquinto'),
      ('Santiago', 'santiago')
  ),
  active_patients as (
    select p.address
    from public.patients as p
    where coalesce(pg_catalog.lower(pg_catalog.btrim(p.archive_status)), 'active') = 'active'
  ),
  prepared as (
    select
      nullif(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(address, '')), '\s+', ' ', 'g'), '') as address_text
    from active_patients
  ),
  normalized as (
    select
      address_text,
      pg_catalog.lower(address_text) as address_key,
      pg_catalog.lower(pg_catalog.btrim(pg_catalog.split_part(address_text, ',', 1))) as first_segment_key
    from prepared
  ),
  classified as (
    select
      case
        when n.address_text is null then 'Unspecified'
        when exact_match.label is not null then exact_match.label
        when first_segment_match.label is not null then first_segment_match.label
        when n.address_key like '%malvar%' then 'Unspecified'
        when n.address_key like '%lipa%'
          or n.address_key like '%tanauan%'
          or n.address_key like '%santo tomas%'
          or n.address_key like '%sto tomas%'
          or n.address_key like '%balete%'
          or n.address_key like '%cuenca%'
          or n.address_key like '%mataas na kahoy%'
          or n.address_key like '%ibaan%'
          or n.address_key like '%talisay%'
          or n.address_key like '%calamba%'
        then 'Outside Malvar'
        else 'Unspecified'
      end as barangay
    from normalized as n
    left join malvar_barangays as exact_match
      on n.address_key = exact_match.normalized_label
      or n.address_key = exact_match.normalized_label || ', malvar, batangas'
    left join malvar_barangays as first_segment_match
      on n.first_segment_key = first_segment_match.normalized_label
  )
  select
    'barangay_distribution'::text,
    null::date,
    classified.barangay::text,
    pg_catalog.count(*)::bigint,
    null::bigint,
    'Informational'::text,
    0::bigint,
    0::bigint,
    0::bigint,
    pg_catalog.count(*) filter (where classified.barangay = 'Unspecified')::bigint
  from classified
  group by classified.barangay
  order by pg_catalog.count(*) desc, classified.barangay asc;
end;
$$;

revoke all on function public.analytics_barangay_distribution() from public, anon;
grant execute on function public.analytics_barangay_distribution() to authenticated;
