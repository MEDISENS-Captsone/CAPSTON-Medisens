-- MEDISENS Phase 4E analytics RPC smoke test.
-- Read-only against source data. Uses role/JWT GUC impersonation to exercise
-- the RPC authorization checks through real profile rows.

begin;

create temp table phase4e_results (
  role_label text,
  metric text,
  expectation text,
  ok boolean,
  sqlstate text,
  message text,
  row_count bigint
) on commit drop;

grant insert, select on phase4e_results to authenticated, anon;

do $$
declare
  r record;
  c record;
  v_count bigint;
  v_expected_success boolean;
begin
  for r in
    select * from (
      values
        ('Admin', 'fd5fd6fc-d330-4eee-8f4f-d41fa8bb4748'::uuid, 'authenticated', false),
        ('Doctor', '835f3f36-d4c0-4143-9e3d-d65b54ec1fb3'::uuid, 'authenticated', true),
        ('Nurse', '8d26b5a0-0dfc-4135-8cd6-cded674bea94'::uuid, 'authenticated', false),
        ('BHW', 'f0120ff4-9439-406e-bcc4-84e41b7b3a55'::uuid, 'authenticated', false),
        ('Midwife', '746c8f2b-a7e3-48c5-a305-de3c382e4c37'::uuid, 'authenticated', false),
        ('Pharmacist', '0f6269c4-13ae-4233-90ed-24b3007629a0'::uuid, 'authenticated', false),
        ('Laboratory', 'f4aeae5b-b61b-4413-bb2d-2531ed4f4a61'::uuid, 'authenticated', false),
        ('anon', null::uuid, 'anon', false)
    ) as roles(role_label, user_id, db_role, expected_success)
  loop
    for c in
      select * from (
        values
          ('patient_snapshot', 'select * from public.analytics_patient_snapshot()'),
          ('registration_volume', 'select * from public.analytics_registration_volume(date ''2026-01-01'', date ''2026-02-01'', ''day'')'),
          ('consultation_volume', 'select * from public.analytics_consultation_volume(date ''2026-01-01'', date ''2026-02-01'', ''day'')'),
          ('lab_activity', 'select * from public.analytics_lab_activity(date ''2026-01-01'', date ''2026-02-01'', ''day'', ''historical'')'),
          ('prescription_activity', 'select * from public.analytics_prescription_activity(date ''2026-01-01'', date ''2026-02-01'', ''day'', ''prescribed'', ''historical'')'),
          ('follow_up_activity', 'select * from public.analytics_follow_up_activity(date ''2026-01-01'', date ''2026-02-01'', ''day'', ''historical'')'),
          ('fhsis_activity', 'select * from public.analytics_fhsis_activity(date ''2026-01-01'', date ''2026-07-01'')'),
          ('audit_activity', 'select * from public.analytics_audit_activity(date ''2026-01-01'', date ''2026-02-01'', ''day'', ''role'')'),
          ('archive_activity', 'select * from public.analytics_archive_activity(date ''2026-01-01'', date ''2026-02-01'', ''day'')'),
          ('clinical_text_frequency', 'select * from public.analytics_clinical_text_frequency(date ''2026-01-01'', date ''2026-02-01'', ''diagnosis'', ''all'', 10)'),
          ('data_quality', 'select * from public.analytics_data_quality(date ''2026-01-01'', date ''2026-02-01'')')
      ) as calls(metric, sql_text)
    loop
      begin
        execute 'set local role ' || quote_ident(r.db_role);
        perform set_config('request.jwt.claim.sub', coalesce(r.user_id::text, ''), true);
        perform set_config('request.jwt.claim.role', r.db_role, true);
        execute format('select count(*) from (%s) smoke_call', c.sql_text) into v_count;
        reset role;

        insert into phase4e_results
        values (
          r.role_label,
          c.metric,
          case when r.expected_success then 'succeed' else 'fail with 42501' end,
          r.expected_success,
          '00000',
          'ok',
          v_count
        );
      exception when others then
        reset role;
        insert into phase4e_results
        values (
          r.role_label,
          c.metric,
          case when r.expected_success then 'succeed' else 'fail with 42501' end,
          (not r.expected_success and sqlstate = '42501'),
          sqlstate,
          sqlerrm,
          null
        );
      end;
    end loop;
  end loop;

  for c in
    select * from (
      values
        ('registration_zero_length', 'select * from public.analytics_registration_volume(date ''2026-01-01'', date ''2026-01-01'', ''day'')'),
        ('registration_reversed', 'select * from public.analytics_registration_volume(date ''2026-02-01'', date ''2026-01-01'', ''day'')'),
        ('registration_over_366_days', 'select * from public.analytics_registration_volume(date ''2025-01-01'', date ''2026-01-03'', ''day'')'),
        ('registration_invalid_bucket', 'select * from public.analytics_registration_volume(date ''2026-01-01'', date ''2026-02-01'', ''quarter'')'),
        ('lab_invalid_scope', 'select * from public.analytics_lab_activity(date ''2026-01-01'', date ''2026-02-01'', ''day'', ''open'')'),
        ('prescription_invalid_date_mode', 'select * from public.analytics_prescription_activity(date ''2026-01-01'', date ''2026-02-01'', ''day'', ''filled'', ''historical'')'),
        ('prescription_invalid_scope', 'select * from public.analytics_prescription_activity(date ''2026-01-01'', date ''2026-02-01'', ''day'', ''prescribed'', ''active'')'),
        ('follow_up_invalid_scope', 'select * from public.analytics_follow_up_activity(date ''2026-01-01'', date ''2026-02-01'', ''day'', ''active'')'),
        ('fhsis_non_month_bound', 'select * from public.analytics_fhsis_activity(date ''2026-01-02'', date ''2026-07-01'')'),
        ('fhsis_over_60_months', 'select * from public.analytics_fhsis_activity(date ''2020-01-01'', date ''2025-02-01'')'),
        ('audit_invalid_group', 'select * from public.analytics_audit_activity(date ''2026-01-01'', date ''2026-02-01'', ''day'', ''user'')'),
        ('clinical_invalid_kind', 'select * from public.analytics_clinical_text_frequency(date ''2026-01-01'', date ''2026-02-01'', ''medication'', ''all'', 10)'),
        ('clinical_invalid_source', 'select * from public.analytics_clinical_text_frequency(date ''2026-01-01'', date ''2026-02-01'', ''diagnosis'', ''prescription'', 10)'),
        ('clinical_invalid_low_limit', 'select * from public.analytics_clinical_text_frequency(date ''2026-01-01'', date ''2026-02-01'', ''diagnosis'', ''all'', 0)'),
        ('clinical_invalid_high_limit', 'select * from public.analytics_clinical_text_frequency(date ''2026-01-01'', date ''2026-02-01'', ''diagnosis'', ''all'', 51)')
    ) as invalid_cases(metric, sql_text)
  loop
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claim.sub', '835f3f36-d4c0-4143-9e3d-d65b54ec1fb3', true);
      perform set_config('request.jwt.claim.role', 'authenticated', true);
      execute format('select count(*) from (%s) smoke_call', c.sql_text) into v_count;
      reset role;

      insert into phase4e_results
      values ('Doctor invalid-parameter', c.metric, 'fail safely', false, '00000', 'unexpected success', v_count);
    exception when others then
      reset role;
      insert into phase4e_results
        values ('Doctor invalid-parameter', c.metric, 'fail safely', (sqlstate = '22023'), sqlstate, sqlerrm, null);
    end;
  end loop;
end $$;

select role_label, metric, expectation, ok, sqlstate, message, row_count
from phase4e_results
order by
  case role_label
    when 'Doctor' then 1 when 'Admin' then 2 when 'Nurse' then 3
    when 'BHW' then 4 when 'Midwife' then 5 when 'Pharmacist' then 6
    when 'Laboratory' then 7 when 'anon' then 8 else 9
  end,
  metric;

rollback;
