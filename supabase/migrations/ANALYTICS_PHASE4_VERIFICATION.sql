-- MEDISENS Phase 4B verification SQL.
-- Run after deploying the analytics migration. Every active statement is
-- read-only. Authenticated RPC smoke calls are provided as comments because
-- they must run through real Admin, Doctor, and denied-role sessions.

begin transaction read only;

-- 1. Confirm server and source schema assumptions.
select current_setting('server_version') as postgres_version;

with expected(table_name, column_name) as (
  values
    ('profiles','id'),('profiles','role'),
    ('patients','id'),('patients','created_at'),('patients','archive_status'),
    ('patients','sex'),('patients','birthday'),('patients','age'),('patients','address'),
    ('initial_consultation','initialconsultation_id'),('initial_consultation','patient_id'),
    ('initial_consultation','consultation_date'),('initial_consultation','diagnosis'),
    ('initial_consultation','chief_complaint'),
    ('consultation','consultation_id'),('consultation','patient_id'),
    ('consultation','initial_consultation_id'),('consultation','diagnosis'),
    ('consultation','chief_complaints'),
    ('lab_request','labrequest_id'),('lab_request','patient_id'),
    ('lab_request','request_date'),('lab_request','status'),
    ('lab_result','labresult_id'),('lab_result','patient_id'),
    ('lab_result','date_performed'),('lab_result','status'),
    ('prescription','prescription_id'),('prescription','patient_id'),
    ('prescription','prescription_date'),('prescription','dispensed_at'),('prescription','status'),
    ('follow_up','followup_id'),('follow_up','patient_id'),
    ('follow_up','visit_date'),('follow_up','follow_up_status'),
    ('fhsis_logs','id'),('fhsis_logs','report_month'),
    ('fhsis_logs','created_at'),('fhsis_logs','category'),
    ('audit_logs','id'),('audit_logs','created_at'),('audit_logs','user_role'),
    ('audit_logs','module'),('audit_logs','action'),
    ('patient_archive_events','id'),('patient_archive_events','created_at'),
    ('patient_archive_events','event_type'),('patient_archive_events','performed_by_role')
), actual as (
  select c.table_name, c.column_name, c.data_type, c.udt_name, c.is_nullable
  from information_schema.columns as c
  where c.table_schema = 'public'
)
select e.table_name, e.column_name, a.data_type, a.udt_name, a.is_nullable,
       (a.column_name is not null) as present
from expected as e
left join actual as a using (table_name, column_name)
order by e.table_name, e.column_name;

-- These plan-only columns must remain absent from the deployed consultation
-- schema; Phase 4B intentionally does not reference them.
select column_name, true as absent_as_expected
from (values ('consultation_date'),('created_at'),('chief_complaint'),('doctor_name')) as e(column_name)
where not exists (
  select 1 from information_schema.columns c
  where c.table_schema='public' and c.table_name='consultation' and c.column_name=e.column_name
);

-- 2. Inventory actual source values. Unknown values are reported by analytics,
-- never coerced into an approved workflow state.
select 'profiles.role' as source, coalesce(nullif(btrim(role),''),'<NULL_OR_BLANK>') as value, count(*)
from public.profiles group by 2 order by 2;
select 'patients.archive_status' as source, coalesce(nullif(btrim(archive_status::text),''),'<NULL_OR_BLANK>') as value, count(*)
from public.patients group by 2 order by 2;
select 'lab_request.status' as source, coalesce(nullif(btrim(status::text),''),'<NULL_OR_BLANK>') as value, count(*)
from public.lab_request group by 2 order by 2;
select 'lab_result.status' as source, coalesce(nullif(btrim(status::text),''),'<NULL_OR_BLANK>') as value, count(*)
from public.lab_result group by 2 order by 2;
select 'prescription.status' as source, coalesce(nullif(btrim(status::text),''),'<NULL_OR_BLANK>') as value, count(*)
from public.prescription group by 2 order by 2;
select 'follow_up.follow_up_status' as source, coalesce(nullif(btrim(follow_up_status::text),''),'<NULL_OR_BLANK>') as value, count(*)
from public.follow_up group by 2 order by 2;
select 'patient_archive_events.event_type' as source, coalesce(nullif(btrim(event_type::text),''),'<NULL_OR_BLANK>') as value, count(*)
from public.patient_archive_events group by 2 order by 2;

-- 3. Confirm existing indexes and verify that this migration added none.
select schemaname, tablename, indexname, indexdef
from pg_catalog.pg_indexes
where schemaname = 'public'
  and tablename in (
    'profiles','patients','initial_consultation','consultation','lab_request',
    'lab_result','prescription','follow_up','fhsis_logs','audit_logs',
    'patient_archive_events'
  )
order by tablename, indexname;

select count(*) as analytics_named_public_indexes
from pg_catalog.pg_indexes
where schemaname='public' and indexname like '%analytics%';

-- 4. Confirm private helpers/views and exactly 11 public RPC overloads.
select n.nspname as schema_name, c.relname as view_name, c.relkind
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='analytics_private' and c.relkind in ('v','m')
order by c.relname;

select p.oid::regprocedure::text as rpc_signature,
       p.prosecdef as security_definer,
       p.provolatile as volatility,
       p.proconfig as function_config
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname like 'analytics_%'
order by p.proname;

select count(*) as public_analytics_rpc_count,
       (count(*)=11) as exactly_eleven
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname like 'analytics_%';

-- Every public RPC must be SECURITY DEFINER with search_path set to empty.
select p.oid::regprocedure::text as rpc_signature,
       p.prosecdef as is_security_definer,
       coalesce(array_to_string(p.proconfig,','),'') as config,
       (p.prosecdef and exists (
         select 1 from unnest(coalesce(p.proconfig,array[]::text[])) as setting
         where setting in ('search_path=','search_path=""')
       )) as secure_configuration
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname like 'analytics_%'
order by p.proname;

-- 5. Confirm least-privilege execution grants.
select p.oid::regprocedure::text as rpc_signature,
       exists (
         select 1
         from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
         where acl.grantee=0 and acl.privilege_type='EXECUTE'
       ) as public_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname like 'analytics_%'
order by p.proname;

select n.nspname as schema_name,
       exists (
         select 1
         from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) acl
         where acl.grantee=0 and acl.privilege_type='USAGE'
       ) as public_usage,
       has_schema_privilege('anon',n.oid,'USAGE') as anon_usage,
       has_schema_privilege('authenticated',n.oid,'USAGE') as authenticated_usage
from pg_catalog.pg_namespace n
where n.nspname='analytics_private';

-- 6. Confirm public RPC return columns are fixed and identifier-free.
select specific_name as routine_name, ordinal_position, parameter_name, data_type
from information_schema.parameters
where specific_schema='public'
  and specific_name like 'analytics_%'
  and parameter_mode='OUT'
order by routine_name, ordinal_position;

select specific_name as routine_name, parameter_name
from information_schema.parameters
where specific_schema='public'
  and specific_name like 'analytics_%'
  and parameter_mode='OUT'
  and parameter_name in (
    'patient_id','user_id','record_id','first_name','last_name','reason','metadata'
  );

-- 7. Confirm source RLS state without changing any policy.
select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r'
  and c.relname in (
    'profiles','patients','initial_consultation','consultation','lab_request',
    'lab_result','prescription','follow_up','fhsis_logs','audit_logs',
    'patient_archive_events'
  )
order by c.relname;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_catalog.pg_policies
where schemaname='public'
  and tablename in (
    'profiles','patients','initial_consultation','consultation','lab_request',
    'lab_result','prescription','follow_up','fhsis_logs','audit_logs',
    'patient_archive_events'
  )
order by tablename, policyname;

-- 8. Helper edge cases. Expected: valid dates parse; invalid/ambiguous dates
-- return null; whitespace/status normalization follows Phase 3 rules.
select input_value, analytics_private.try_iso_date(input_value) as parsed
from (values
  ('2026-02-28'),('2024-02-29'),('2026-02-30'),('01/02/2026'),
  ('2026-07-12T14:30'),(''),('not a date')
) as samples(input_value);

select source_key, raw_value,
       analytics_private.normalize_status(raw_value,source_key) as normalized
from (values
  ('patient_archive','active'),('patient_archive',null),('patient_archive','unexpected'),
  ('lab_request','Pending'),('lab_request',null),('lab_request','unexpected'),
  ('lab_result','Completed'),('lab_result',null),
  ('prescription','Dispensed'),('follow_up','done'),('follow_up',null),
  ('archive_event','restored')
) as samples(source_key,raw_value);

rollback;

-- 9. Run these smoke calls separately through real authenticated sessions.
-- Admin: all 11 calls must succeed.
-- Doctor: all 11 calls must succeed.
-- Nurse/BHW/Pharmacist/Laboratory/Midwife: each call must return SQLSTATE 42501.
-- Anonymous or expired session: each call must return SQLSTATE 42501/permission denied.
--
-- select * from public.analytics_patient_snapshot();
-- select * from public.analytics_registration_volume(date '2026-01-01',date '2026-02-01','day');
-- select * from public.analytics_consultation_volume(date '2026-01-01',date '2026-02-01','day');
-- select * from public.analytics_lab_activity(date '2026-01-01',date '2026-02-01','day','historical');
-- select * from public.analytics_prescription_activity(date '2026-01-01',date '2026-02-01','day','prescribed','historical');
-- select * from public.analytics_follow_up_activity(date '2026-01-01',date '2026-02-01','day','historical');
-- select * from public.analytics_fhsis_activity(date '2026-01-01',date '2026-07-01');
-- select * from public.analytics_audit_activity(date '2026-01-01',date '2026-02-01','day','role');
-- select * from public.analytics_archive_activity(date '2026-01-01',date '2026-02-01','day');
-- select * from public.analytics_clinical_text_frequency(date '2026-01-01',date '2026-02-01','diagnosis','all',10);
-- select * from public.analytics_data_quality(date '2026-01-01',date '2026-02-01');

-- Bound checks: zero-length, reversed, and ranges over 366 days must fail.
-- Invalid bucket/scope/group/date-mode/source/kind/limit values must fail.
