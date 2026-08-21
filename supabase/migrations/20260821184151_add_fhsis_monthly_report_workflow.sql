-- Phase 2: dedicated, monthly FHSIS M1 BRGY reports.
-- Legacy public.fhsis_logs remains a separate patient/vaccination log.

-- Correct the live policy drift identified during Phase 0. The retained
-- verb-specific policies preserve the established legacy consumers.
drop policy if exists "Allow BHW read access to fhsis_logs" on public.fhsis_logs;
drop policy if exists "Allow read access to FHSIS logs for authenticated users" on public.fhsis_logs;

create table public.fhsis_reports (
  id uuid primary key default gen_random_uuid(),
  report_type text not null default 'm1-brgy' check (report_type = 'm1-brgy'),
  template_version text not null,
  reporting_month date not null check (reporting_month = date_trunc('month', reporting_month)::date),
  barangay_name text not null check (length(btrim(barangay_name)) > 0),
  bhs_name text not null check (length(btrim(bhs_name)) > 0),
  municipality_city_name text not null check (length(btrim(municipality_city_name)) > 0),
  province_name text not null check (length(btrim(province_name)) > 0),
  projected_population integer not null check (projected_population >= 0),
  status text not null default 'draft' check (status in ('draft', 'for_verification', 'returned', 'verified')),
  created_by uuid not null references public.profiles(id),
  submitted_at timestamptz,
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  returned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (report_type, reporting_month, barangay_name, bhs_name)
);

create table public.fhsis_report_values (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.fhsis_reports(id) on delete cascade,
  indicator_key text not null check (length(btrim(indicator_key)) > 0),
  dimension_key text not null check (length(btrim(dimension_key)) > 0),
  value integer check (value is null or value >= 0),
  remarks text,
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (report_id, indicator_key, dimension_key)
);

create table public.fhsis_report_reviews (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.fhsis_reports(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id),
  action text not null check (action in ('review_note', 'returned', 'verified')),
  reason text,
  notes text,
  created_at timestamptz not null default now(),
  check (action <> 'returned' or length(btrim(coalesce(reason, ''))) > 0)
);

create index fhsis_report_values_report_id_idx on public.fhsis_report_values(report_id);
create index fhsis_report_reviews_report_id_created_at_idx on public.fhsis_report_reviews(report_id, created_at);
create index fhsis_reports_status_reporting_month_idx on public.fhsis_reports(status, reporting_month);

alter table public.fhsis_reports enable row level security;
alter table public.fhsis_report_values enable row level security;
alter table public.fhsis_report_reviews enable row level security;

create function public.fhsis_set_updated_at()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function public.fhsis_guard_report_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (old.status, old.submitted_at, old.verified_by, old.verified_at, old.returned_at)
      is distinct from (new.status, new.submitted_at, new.verified_by, new.verified_at, new.returned_at)
     and pg_catalog.coalesce(pg_catalog.current_setting('medisens.fhsis_transition', true), '') <> 'on' then
    raise exception 'FHSIS report workflow state can only change through its controlled transition functions.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create function public.fhsis_guard_value_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (old.report_id, old.indicator_key, old.dimension_key) is distinct from (new.report_id, new.indicator_key, new.dimension_key) then
    raise exception 'FHSIS report value identity is immutable.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger fhsis_reports_set_updated_at before update on public.fhsis_reports for each row execute function public.fhsis_set_updated_at();
create trigger fhsis_reports_guard_transition before update on public.fhsis_reports for each row execute function public.fhsis_guard_report_transition();
create trigger fhsis_report_values_set_updated_at before update on public.fhsis_report_values for each row execute function public.fhsis_set_updated_at();
create trigger fhsis_report_values_guard_identity before update on public.fhsis_report_values for each row execute function public.fhsis_guard_value_identity();

create policy "fhsis_reports_nurse_select_own" on public.fhsis_reports for select to authenticated using (
  created_by = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'nurse')
);
create policy "fhsis_reports_midwife_select" on public.fhsis_reports for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'midwives')
);
create policy "fhsis_reports_nurse_insert_draft" on public.fhsis_reports for insert to authenticated with check (
  created_by = (select auth.uid()) and status = 'draft' and submitted_at is null and verified_by is null and verified_at is null and returned_at is null
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'nurse')
);
create policy "fhsis_reports_nurse_update_editable" on public.fhsis_reports for update to authenticated using (
  created_by = (select auth.uid()) and status in ('draft', 'returned') and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'nurse')
) with check (
  created_by = (select auth.uid()) and status in ('draft', 'returned') and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'nurse')
);

create policy "fhsis_values_nurse_select_editable_reports" on public.fhsis_report_values for select to authenticated using (
  exists (select 1 from public.fhsis_reports r join public.profiles p on p.id = (select auth.uid()) where r.id = report_id and r.created_by = (select auth.uid()) and p.role = 'nurse')
);
create policy "fhsis_values_midwife_select" on public.fhsis_report_values for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'midwives')
);
create policy "fhsis_values_nurse_insert_editable_reports" on public.fhsis_report_values for insert to authenticated with check (
  updated_by = (select auth.uid()) and exists (select 1 from public.fhsis_reports r join public.profiles p on p.id = (select auth.uid()) where r.id = report_id and r.created_by = (select auth.uid()) and r.status in ('draft', 'returned') and p.role = 'nurse')
);
create policy "fhsis_values_nurse_update_editable_reports" on public.fhsis_report_values for update to authenticated using (
  exists (select 1 from public.fhsis_reports r join public.profiles p on p.id = (select auth.uid()) where r.id = report_id and r.created_by = (select auth.uid()) and r.status in ('draft', 'returned') and p.role = 'nurse')
) with check (
  updated_by = (select auth.uid()) and exists (select 1 from public.fhsis_reports r join public.profiles p on p.id = (select auth.uid()) where r.id = report_id and r.created_by = (select auth.uid()) and r.status in ('draft', 'returned') and p.role = 'nurse')
);

create policy "fhsis_reviews_nurse_select_own_reports" on public.fhsis_report_reviews for select to authenticated using (
  exists (select 1 from public.fhsis_reports r join public.profiles p on p.id = (select auth.uid()) where r.id = report_id and r.created_by = (select auth.uid()) and p.role = 'nurse')
);
create policy "fhsis_reviews_midwife_select" on public.fhsis_report_reviews for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'midwives')
);
create policy "fhsis_reviews_midwife_add_notes" on public.fhsis_report_reviews for insert to authenticated with check (
  reviewer_id = (select auth.uid()) and action = 'review_note' and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'midwives')
);

create function public.submit_fhsis_report(p_report_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_role text; v_report public.fhsis_reports%rowtype;
begin
  select p.role into v_role from public.profiles p where p.id = auth.uid();
  if v_role is distinct from 'nurse' then raise exception 'Only a Nurse can submit an FHSIS report.' using errcode = '42501'; end if;
  select * into v_report from public.fhsis_reports where id = p_report_id for update;
  if not found or v_report.created_by <> auth.uid() then raise exception 'FHSIS report not found.' using errcode = '42501'; end if;
  if v_report.status not in ('draft', 'returned') then raise exception 'Only a draft or returned FHSIS report can be submitted.' using errcode = '22023'; end if;
  perform pg_catalog.set_config('medisens.fhsis_transition', 'on', true);
  update public.fhsis_reports set status = 'for_verification', submitted_at = now() where id = p_report_id;
end;
$$;

create function public.return_fhsis_report(p_report_id uuid, p_reason text, p_notes text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_role text; v_report public.fhsis_reports%rowtype; v_reason text;
begin
  select p.role into v_role from public.profiles p where p.id = auth.uid();
  if v_role is distinct from 'midwives' then raise exception 'Only a Midwife can return an FHSIS report.' using errcode = '42501'; end if;
  v_reason := btrim(coalesce(p_reason, ''));
  if v_reason = '' then raise exception 'A return reason is required.' using errcode = '22023'; end if;
  select * into v_report from public.fhsis_reports where id = p_report_id for update;
  if not found then raise exception 'FHSIS report not found.' using errcode = '42501'; end if;
  if v_report.status <> 'for_verification' then raise exception 'Only a submitted FHSIS report can be returned.' using errcode = '22023'; end if;
  perform pg_catalog.set_config('medisens.fhsis_transition', 'on', true);
  update public.fhsis_reports set status = 'returned', returned_at = now() where id = p_report_id;
  insert into public.fhsis_report_reviews (report_id, reviewer_id, action, reason, notes) values (p_report_id, auth.uid(), 'returned', v_reason, nullif(btrim(coalesce(p_notes, '')), ''));
end;
$$;

create function public.verify_fhsis_report(p_report_id uuid, p_notes text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_role text; v_report public.fhsis_reports%rowtype;
begin
  select p.role into v_role from public.profiles p where p.id = auth.uid();
  if v_role is distinct from 'midwives' then raise exception 'Only a Midwife can verify an FHSIS report.' using errcode = '42501'; end if;
  select * into v_report from public.fhsis_reports where id = p_report_id for update;
  if not found then raise exception 'FHSIS report not found.' using errcode = '42501'; end if;
  if v_report.status <> 'for_verification' then raise exception 'Only a submitted FHSIS report can be verified.' using errcode = '22023'; end if;
  if v_report.created_by = auth.uid() then raise exception 'A user cannot verify their own FHSIS report.' using errcode = '42501'; end if;
  perform pg_catalog.set_config('medisens.fhsis_transition', 'on', true);
  update public.fhsis_reports set status = 'verified', verified_by = auth.uid(), verified_at = now() where id = p_report_id;
  insert into public.fhsis_report_reviews (report_id, reviewer_id, action, notes) values (p_report_id, auth.uid(), 'verified', nullif(btrim(coalesce(p_notes, '')), ''));
end;
$$;

revoke all on table public.fhsis_reports, public.fhsis_report_values, public.fhsis_report_reviews from public, anon;
grant select, insert, update on table public.fhsis_reports, public.fhsis_report_values, public.fhsis_report_reviews to authenticated;
revoke all on function public.fhsis_set_updated_at(), public.fhsis_guard_report_transition(), public.fhsis_guard_value_identity() from public, anon, authenticated;
revoke all on function public.submit_fhsis_report(uuid), public.return_fhsis_report(uuid, text, text), public.verify_fhsis_report(uuid, text) from public, anon;
grant execute on function public.submit_fhsis_report(uuid), public.return_fhsis_report(uuid, text, text), public.verify_fhsis_report(uuid, text) to authenticated;
