-- Admin-only patient record transfer API. REVIEW ONLY: do not apply to the
-- connected production-labeled project. Existing clinical RLS policies remain
-- unchanged; these narrow SECURITY DEFINER functions provide the approved
-- cross-domain transfer path and verify the caller on every operation.

-- The core schema is dashboard-managed in this repository. Refuse to apply
-- unless the authoritative database has the secure-records contract used by
-- the downloaded medisens-secure-records Edge Function.
do $$
declare v_missing text;
begin
  select string_agg(required.table_name||'.'||required.column_name, ', ' order by required.table_name, required.column_name)
    into v_missing
  from (values
    ('patients','pii_ciphertext'),('patients','crypto_ref'),('patients','crypto_version'),('patients','encrypted_at'),('patients','name_token_bidx'),('patients','contact_bidx'),('patients','philhealth_bidx'),
    ('initial_consultation','clinical_ciphertext'),('initial_consultation','crypto_ref'),('initial_consultation','crypto_version'),('initial_consultation','encrypted_at'),
    ('vital_sign','clinical_ciphertext'),('vital_sign','crypto_ref'),('vital_sign','crypto_version'),('vital_sign','encrypted_at'),
    ('consultation','clinical_ciphertext'),('consultation','crypto_ref'),('consultation','crypto_version'),('consultation','encrypted_at'),
    ('lab_request','sensitive_ciphertext'),('lab_request','crypto_ref'),('lab_request','crypto_version'),('lab_request','encrypted_at'),
    ('lab_result','findings_ciphertext'),('lab_result','crypto_ref'),('lab_result','crypto_version'),('lab_result','encrypted_at'),
    ('prescription','rx_ciphertext'),('prescription','crypto_ref'),('prescription','crypto_version'),('prescription','encrypted_at'),
    ('follow_up','clinical_ciphertext'),('follow_up','crypto_ref'),('follow_up','crypto_version'),('follow_up','encrypted_at')
  ) as required(table_name,column_name)
  where not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=required.table_name and c.column_name=required.column_name);
  if v_missing is not null then raise exception 'Admin patient transfer requires secure-records schema columns: %',v_missing using errcode='55000'; end if;
end $$;

create table if not exists public.patient_transfer_patients (
  source_system text not null,
  source_patient_ref text not null,
  patient_id bigint not null references public.patients(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (source_system, source_patient_ref),
  unique (source_system, patient_id)
);

create table if not exists public.patient_transfer_records (
  source_system text not null,
  source_record_ref text not null,
  source_patient_ref text not null,
  table_name text not null check (table_name in ('initial_consultation','vital_sign','consultation','lab_request','lab_result','prescription','follow_up')),
  record_id bigint not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (source_system, source_record_ref),
  foreign key (source_system, source_patient_ref) references public.patient_transfer_patients(source_system, source_patient_ref) on delete cascade
);

create table if not exists public.patient_transfer_operations (
  id uuid primary key default gen_random_uuid(),
  operation_type text not null check (operation_type in ('IMPORT','EXPORT')),
  status text not null check (status in ('REQUESTED','GENERATED','PROCESSING','COMPLETED','PARTIAL','FAILED')),
  export_format text check (export_format in ('xlsx','csv')),
  performed_by uuid not null references public.profiles(id),
  patient_count integer not null default 0 check (patient_count >= 0),
  record_count integer not null default 0 check (record_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  failure_count integer not null default 0 check (failure_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.patient_transfer_export_items (
  operation_id uuid not null references public.patient_transfer_operations(id) on delete cascade,
  patient_id bigint not null references public.patients(id) on delete cascade,
  primary key(operation_id, patient_id)
);

alter table public.patient_transfer_patients enable row level security;
alter table public.patient_transfer_records enable row level security;
alter table public.patient_transfer_operations enable row level security;
alter table public.patient_transfer_export_items enable row level security;
revoke all on public.patient_transfer_patients, public.patient_transfer_records, public.patient_transfer_operations, public.patient_transfer_export_items from public, anon, authenticated;

create or replace function public.admin_patient_transfer_search(p_query text, p_archive_status text, p_limit integer, p_offset integer, p_actor_id uuid)
returns table(id bigint,"firstName" text,"middleName" text,"lastName" text,suffix text,birthday text,archive_status text)
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=p_actor_id; v_role text; v_active boolean; v_query text:=left(btrim(coalesce(p_query,'')),120);
begin
  select p.role,p.is_active into v_role,v_active from public.profiles p where p.id=v_actor;
  if v_actor is null or v_role<>'admin' or v_active is distinct from true then raise exception 'Administrator authorization required' using errcode='42501'; end if;
  if p_archive_status not in ('all','active','archived') then raise exception 'Invalid archive filter' using errcode='22023'; end if;
  return query select p.id,p."firstName",p."middleName",p."lastName",p.suffix,p.birthday,p.archive_status
    from public.patients p
    where (p_archive_status='all' or p.archive_status=p_archive_status) and (v_query='' or p.id::text=v_query or concat_ws(' ',p."firstName",p."middleName",p."lastName",p.suffix) ilike '%'||replace(replace(replace(v_query,'\','\\'),'%','\%'),'_','\_')||'%')
    order by p.id desc limit least(greatest(coalesce(p_limit,50),1),100) offset greatest(coalesce(p_offset,0),0);
end; $$;

create or replace function public.admin_patient_transfer_import(p_source_system text, p_patients jsonb, p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := p_actor_id;
  v_role text;
  v_active boolean;
  v_operation uuid := gen_random_uuid();
  v_patient jsonb;
  v_record jsonb;
  v_patient_id bigint;
  v_ref text;
  v_record_ref text;
  v_table text;
  v_target_id bigint;
  v_inserted integer := 0;
  v_patient_count integer := 0;
  v_patient_records integer := 0;
  v_duplicates integer := 0;
  v_record_duplicates integer := 0;
  v_patient_updates integer := 0;
  v_rejected integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_domain jsonb;
  v_allowed text[];
  v_row jsonb;
  v_crypto jsonb;
  v_update_fields text[];
  v_status text;
  v_message text;
  v_date_field text;
  v_patient_is_new boolean;
  v_patient_is_update boolean;
begin
  select p.role, p.is_active into v_role, v_active from public.profiles p where p.id = v_actor;
  if v_actor is null or v_role <> 'admin' or v_active is distinct from true then
    raise exception 'Administrator authorization required' using errcode = '42501';
  end if;
  if p_source_system is null or length(p_source_system) not between 1 and 80 then
    raise exception 'Invalid source system' using errcode = '22023';
  end if;
  if p_patients is null or jsonb_typeof(p_patients) <> 'array' or jsonb_array_length(p_patients) not between 1 and 100 then
    raise exception 'Import requires 1 to 100 patients' using errcode = '22023';
  end if;
  if octet_length(p_patients::text)>10485760 or exists(select 1 from jsonb_array_elements(p_patients) x where jsonb_typeof(x->'records') not in ('array','null') or case when jsonb_typeof(x->'records')='array' then jsonb_array_length(x->'records') else 0 end>1000) then
    raise exception 'Import workbook exceeds supported size or per-patient record limits' using errcode = '22023';
  end if;

  insert into public.patient_transfer_operations(id, operation_type, status, performed_by)
  values (v_operation, 'IMPORT', 'PROCESSING', v_actor);

  for v_patient in select value from jsonb_array_elements(p_patients) loop
    begin
      v_patient_records := 0;
      v_patient_is_new := false;
      v_patient_is_update := false;
      v_ref := nullif(btrim(v_patient->>'source_patient_ref'), '');
      if v_ref is null or length(v_ref) > 120 then raise exception 'Missing or invalid source patient reference'; end if;
      if jsonb_typeof(v_patient->'patient') <> 'object' then raise exception 'Patient profile is required'; end if;
      select m.patient_id into v_patient_id from public.patient_transfer_patients m where m.source_system=p_source_system and m.source_patient_ref=v_ref;

      v_row := v_patient->'patient';
      v_crypto := v_patient->'crypto';
      if jsonb_typeof(v_crypto)<>'object' or nullif(v_crypto->>'crypto_ref','') is null or v_crypto->>'crypto_version'<>'1' or jsonb_typeof(v_crypto->'pii_ciphertext')<>'object' then raise exception 'Encrypted patient payload is required'; end if;
      if nullif(btrim(v_row->>'firstName'),'') is null or nullif(btrim(v_row->>'lastName'),'') is null or nullif(btrim(v_row->>'birthday'),'') is null then
        raise exception 'Patient firstName, lastName, and birthday are required';
      end if;
      if (v_row - array['firstName','middleName','lastName','suffix','age','sex','civilStatus','birthday','nationality','bloodType','religion','birthPlace','address','contactNumber','educationalAttain','employmentStatus','philhealthNo','philhealthStatus','category','categoryOthers','relativeName','relativeRelation','relativeAddress','relativeContact','source_created_at']) <> '{}'::jsonb then
        raise exception 'Patient profile contains unsupported fields';
      end if;
      if v_row->>'birthday' !~ '^\d{4}-\d{2}-\d{2}$' or pg_catalog.to_char(pg_catalog.to_date(v_row->>'birthday','YYYY-MM-DD'),'YYYY-MM-DD')<>v_row->>'birthday' then raise exception 'Patient birthday must be a valid ISO date'; end if;

      if v_patient_id is not null then
        if coalesce(v_patient->>'import_action','CREATE')<>'UPDATE' then
          v_duplicates:=v_duplicates+1;
          v_record_duplicates:=v_record_duplicates+jsonb_array_length(coalesce(v_patient->'records','[]'::jsonb));
          v_results:=v_results||jsonb_build_array(jsonb_build_object('source_patient_ref',v_ref,'status','DUPLICATE','message','Source patient reference was already imported.'));
          continue;
        end if;
        if jsonb_typeof(v_patient->'update_fields') <> 'array' then raise exception 'UPDATE requires an explicit field list'; end if;
        if jsonb_typeof(v_crypto->'pii_ciphertext')<>'object' or v_crypto->>'crypto_ref' is distinct from (select p.crypto_ref::text from public.patients p where p.id=v_patient_id) then raise exception 'Encrypted profile update must preserve the existing crypto reference'; end if;
        select array_agg(value) into v_update_fields from jsonb_array_elements_text(v_patient->'update_fields');
        if coalesce(cardinality(v_update_fields),0)=0 or exists(select 1 from unnest(v_update_fields) f where f not in ('firstName','middleName','lastName','suffix','age','sex','civilStatus','birthday','nationality','bloodType','religion','birthPlace','address','contactNumber','educationalAttain','employmentStatus','philhealthNo','philhealthStatus','category','categoryOthers','relativeName','relativeRelation','relativeAddress','relativeContact')) then raise exception 'UPDATE fields are invalid'; end if;
        if exists(select 1 from unnest(v_update_fields) f where not (v_row ? f) or nullif(v_row->>f,'') is null) then raise exception 'UPDATE values must be present and non-empty'; end if;
        update public.patients p set
          "firstName"=case when 'firstName'=any(v_update_fields) then v_row->>'firstName' else p."firstName" end,
          "middleName"=case when 'middleName'=any(v_update_fields) then v_row->>'middleName' else p."middleName" end,
          "lastName"=case when 'lastName'=any(v_update_fields) then v_row->>'lastName' else p."lastName" end,
          suffix=case when 'suffix'=any(v_update_fields) then v_row->>'suffix' else p.suffix end,
          age=case when 'age'=any(v_update_fields) then (v_row->>'age')::bigint else p.age end,
          sex=case when 'sex'=any(v_update_fields) then v_row->>'sex' else p.sex end,
          "civilStatus"=case when 'civilStatus'=any(v_update_fields) then v_row->>'civilStatus' else p."civilStatus" end,
          birthday=case when 'birthday'=any(v_update_fields) then v_row->>'birthday' else p.birthday end,
          nationality=case when 'nationality'=any(v_update_fields) then v_row->>'nationality' else p.nationality end,
          "bloodType"=case when 'bloodType'=any(v_update_fields) then v_row->>'bloodType' else p."bloodType" end,
          religion=case when 'religion'=any(v_update_fields) then v_row->>'religion' else p.religion end,
          "birthPlace"=case when 'birthPlace'=any(v_update_fields) then v_row->>'birthPlace' else p."birthPlace" end,
          address=case when 'address'=any(v_update_fields) then v_row->>'address' else p.address end,
          "contactNumber"=case when 'contactNumber'=any(v_update_fields) then (v_row->>'contactNumber')::bigint else p."contactNumber" end,
          "educationalAttain"=case when 'educationalAttain'=any(v_update_fields) then v_row->>'educationalAttain' else p."educationalAttain" end,
          "employmentStatus"=case when 'employmentStatus'=any(v_update_fields) then v_row->>'employmentStatus' else p."employmentStatus" end,
          "philhealthNo"=case when 'philhealthNo'=any(v_update_fields) then v_row->>'philhealthNo' else p."philhealthNo" end,
          "philhealthStatus"=case when 'philhealthStatus'=any(v_update_fields) then v_row->>'philhealthStatus' else p."philhealthStatus" end,
          category=case when 'category'=any(v_update_fields) then v_row->>'category' else p.category end,
          "categoryOthers"=case when 'categoryOthers'=any(v_update_fields) then v_row->>'categoryOthers' else p."categoryOthers" end,
          "relativeName"=case when 'relativeName'=any(v_update_fields) then v_row->>'relativeName' else p."relativeName" end,
          "relativeRelation"=case when 'relativeRelation'=any(v_update_fields) then v_row->>'relativeRelation' else p."relativeRelation" end,
          "relativeAddress"=case when 'relativeAddress'=any(v_update_fields) then v_row->>'relativeAddress' else p."relativeAddress" end,
          "relativeContact"=case when 'relativeContact'=any(v_update_fields) then v_row->>'relativeContact' else p."relativeContact" end,
          pii_ciphertext=v_crypto->'pii_ciphertext',crypto_version=1,encrypted_at=coalesce(nullif(v_crypto->>'encrypted_at','')::timestamptz,now()),
          name_token_bidx=array(select jsonb_array_elements_text(v_crypto->'name_token_bidx')),contact_bidx=v_crypto->>'contact_bidx',philhealth_bidx=v_crypto->>'philhealth_bidx'
        where p.id=v_patient_id;
        v_patient_is_update:=true;
      else
        if coalesce(v_patient->>'import_action','CREATE')<>'CREATE' then raise exception 'UPDATE action requires a previously mapped source patient'; end if;
        insert into public.patients("firstName","middleName","lastName",suffix,age,sex,"civilStatus",birthday,nationality,"bloodType",religion,"birthPlace",address,"contactNumber","educationalAttain","employmentStatus","philhealthNo","philhealthStatus",category,"categoryOthers","relativeName","relativeRelation","relativeAddress","relativeContact",consent_signed,created_at,pii_ciphertext,crypto_ref,crypto_version,encrypted_at,name_token_bidx,contact_bidx,philhealth_bidx)
        values (v_row->>'firstName',v_row->>'middleName',v_row->>'lastName',v_row->>'suffix',nullif(v_row->>'age','')::bigint,v_row->>'sex',v_row->>'civilStatus',v_row->>'birthday',v_row->>'nationality',v_row->>'bloodType',v_row->>'religion',v_row->>'birthPlace',v_row->>'address',nullif(v_row->>'contactNumber','')::bigint,v_row->>'educationalAttain',v_row->>'employmentStatus',v_row->>'philhealthNo',v_row->>'philhealthStatus',v_row->>'category',v_row->>'categoryOthers',v_row->>'relativeName',v_row->>'relativeRelation',v_row->>'relativeAddress',v_row->>'relativeContact',false,coalesce(nullif(v_row->>'source_created_at','')::timestamptz,now()),v_crypto->'pii_ciphertext',v_crypto->>'crypto_ref',1,coalesce(nullif(v_crypto->>'encrypted_at','')::timestamptz,now()),array(select jsonb_array_elements_text(v_crypto->'name_token_bidx')),v_crypto->>'contact_bidx',v_crypto->>'philhealth_bidx') returning id into v_patient_id;
        insert into public.patient_transfer_patients(source_system,source_patient_ref,patient_id,created_by) values(p_source_system,v_ref,v_patient_id,v_actor);
        v_patient_is_new:=true;
      end if;

      for v_domain in select value from jsonb_array_elements(coalesce(v_patient->'records','[]'::jsonb)) loop
        v_table := v_domain->>'table';
        v_record_ref := nullif(btrim(v_domain->>'source_record_ref'),'');
        v_row := v_domain->'data';
        v_crypto := v_domain->'crypto';
        if jsonb_typeof(v_crypto)<>'object' or nullif(v_crypto->>'crypto_ref','') is null or v_crypto->>'crypto_version'<>'1' then raise exception 'Encrypted clinical payload is required'; end if;
        if v_record_ref is null or length(v_record_ref) > 120 or jsonb_typeof(v_row) <> 'object' then raise exception 'Invalid clinical record source reference or data'; end if;
        if exists(select 1 from public.patient_transfer_records r where r.source_system=p_source_system and r.source_record_ref=v_record_ref) then
          if not exists(select 1 from public.patient_transfer_records r where r.source_system=p_source_system and r.source_record_ref=v_record_ref and r.source_patient_ref=v_ref and r.table_name=v_table) then raise exception 'Clinical source reference is already mapped to another patient or record type'; end if;
          v_record_duplicates:=v_record_duplicates+1; continue;
        end if;
        v_status := 'INSERT'; v_message := null;

        if v_table = 'initial_consultation' then
          v_allowed := array['consultation_date','consultation_time','mode_of_transaction','referred_by','mode_of_transfer','chief_complaint','diagnosis','visit_disposition']; v_id_field := 'initialconsultation_id';
          if nullif(v_row->>'consultation_date','') is null or nullif(v_row->>'chief_complaint','') is null then raise exception 'Initial consultation date and chief complaint are required'; end if;
          if jsonb_typeof(v_crypto->'clinical_ciphertext')<>'object' then raise exception 'Encrypted initial-intake payload is required'; end if;
          insert into public.initial_consultation(patient_id,consultation_date,consultation_time,mode_of_transaction,referred_by,mode_of_transfer,chief_complaint,diagnosis,visit_disposition,clinical_ciphertext,crypto_ref,crypto_version,encrypted_at) values(v_patient_id,v_row->>'consultation_date',v_row->>'consultation_time',v_row->>'mode_of_transaction',v_row->>'referred_by',v_row->>'mode_of_transfer',v_row->>'chief_complaint',v_row->>'diagnosis',coalesce(v_row->>'visit_disposition','pending'),v_crypto->'clinical_ciphertext',v_crypto->>'crypto_ref',1,coalesce(nullif(v_crypto->>'encrypted_at','')::timestamptz,now())) returning initialconsultation_id into v_target_id;
        elsif v_table = 'vital_sign' then
          v_allowed := array['initial_consultation_ref','bp','heart_rate','respiratory_rate','temperature','o2_saturation','weight','height','muac','nutritional_status','bmi','visual_acuity_left','visual_acuity_right','general_survey']; v_id_field := 'vitals_id';
          select r.record_id into v_target_id from public.patient_transfer_records r where r.source_system=p_source_system and r.source_record_ref=v_row->>'initial_consultation_ref' and r.source_patient_ref=v_ref and r.table_name='initial_consultation';
          if v_target_id is null or not exists(select 1 from public.initial_consultation i where i.initialconsultation_id=v_target_id and i.patient_id=v_patient_id) then raise exception 'Vital sign initial consultation reference is invalid for this patient'; end if;
          if jsonb_typeof(v_crypto->'clinical_ciphertext')<>'object' then raise exception 'Encrypted vital-sign payload is required'; end if;
          insert into public.vital_sign(patient_id,initial_consultation_id,bp,heart_rate,respiratory_rate,temperature,o2_saturation,weight,height,muac,nutritional_status,bmi,visual_acuity_left,visual_acuity_right,general_survey,clinical_ciphertext,crypto_ref,crypto_version,encrypted_at) values(v_patient_id,v_target_id,v_row->>'bp',nullif(v_row->>'heart_rate','')::bigint,nullif(v_row->>'respiratory_rate','')::bigint,nullif(v_row->>'temperature','')::double precision,nullif(v_row->>'o2_saturation','')::bigint,nullif(v_row->>'weight','')::double precision,nullif(v_row->>'height','')::bigint,nullif(v_row->>'muac','')::double precision,v_row->>'nutritional_status',nullif(v_row->>'bmi','')::double precision,v_row->>'visual_acuity_left',v_row->>'visual_acuity_right',v_row->>'general_survey',v_crypto->'clinical_ciphertext',v_crypto->>'crypto_ref',1,coalesce(nullif(v_crypto->>'encrypted_at','')::timestamptz,now())) returning vitals_id into v_target_id;
        elsif v_table = 'consultation' then
          v_allowed := array['initial_consultation_ref','source_authority','family_history','smoking_status','smoking_sticks_per_day','smoking_years','drinking_status','drinking_frequency','drinking_years','immunization_history','menarche_age','sexual_onset_age','is_menopause','menopause_age','lmp','interval_cycle','period_duration','pads_per_day','birth_control_method','gravidity','parity','delivery_type','full_term_count','premature_count','abortion_count','living_children_count','pre_eclampsia','medication_treatment','past_med_surge_history','chief_complaints','diagnosis','hpi','assessment','plan','follow_up_date','follow_up_time','management_treatment','attending_provider','past_med_surg_history','history_present_illness','follow_up_status','status','completed_at']; v_id_field := 'consultation_id';
          select r.record_id into v_target_id from public.patient_transfer_records r where r.source_system=p_source_system and r.source_record_ref=v_row->>'initial_consultation_ref' and r.source_patient_ref=v_ref and r.table_name='initial_consultation';
          if v_target_id is null or not exists(select 1 from public.initial_consultation i where i.initialconsultation_id=v_target_id and i.patient_id=v_patient_id) then raise exception 'Consultation initial consultation reference is invalid for this patient'; end if;
          if nullif(v_row->>'attending_provider','') is null or nullif(v_row->>'source_authority','') is null then raise exception 'Consultation author provenance is required'; end if;
          if coalesce(v_row->>'status','Draft') not in ('Draft','Completed') or (v_row->>'status'='Completed' and nullif(v_row->>'completed_at','') is null) then raise exception 'Consultation historical status or completion date is invalid'; end if;
          if jsonb_typeof(v_crypto->'clinical_ciphertext')<>'object' then raise exception 'Encrypted consultation payload is required'; end if;
          insert into public.consultation(patient_id,initial_consultation_id,family_history,smoking_status,smoking_sticks_per_day,smoking_years,drinking_status,drinking_frequency,drinking_years,immunization_history,menarche_age,sexual_onset_age,is_menopause,menopause_age,lmp,interval_cycle,period_duration,pads_per_day,birth_control_method,gravidity,parity,delivery_type,full_term_count,premature_count,abortion_count,living_children_count,pre_eclampsia,medication_treatment,past_med_surge_history,chief_complaints,diagnosis,hpi,assessment,plan,follow_up_date,follow_up_time,management_treatment,attending_provider,past_med_surg_history,history_present_illness,follow_up_status,status,completed_at,clinical_ciphertext,crypto_ref,crypto_version,encrypted_at)
          values(v_patient_id,v_target_id,v_row->>'family_history',v_row->>'smoking_status',nullif(v_row->>'smoking_sticks_per_day','')::bigint,nullif(v_row->>'smoking_years','')::bigint,v_row->>'drinking_status',v_row->>'drinking_frequency',nullif(v_row->>'drinking_years','')::bigint,v_row->>'immunization_history',nullif(v_row->>'menarche_age','')::bigint,nullif(v_row->>'sexual_onset_age','')::bigint,v_row->>'is_menopause',nullif(v_row->>'menopause_age','')::bigint,v_row->>'lmp',v_row->>'interval_cycle',v_row->>'period_duration',nullif(v_row->>'pads_per_day','')::bigint,v_row->>'birth_control_method',nullif(v_row->>'gravidity','')::bigint,nullif(v_row->>'parity','')::bigint,v_row->>'delivery_type',nullif(v_row->>'full_term_count','')::bigint,nullif(v_row->>'premature_count','')::bigint,nullif(v_row->>'abortion_count','')::bigint,nullif(v_row->>'living_children_count','')::bigint,v_row->>'pre_eclampsia',v_row->>'medication_treatment',v_row->>'past_med_surge_history',v_row->>'chief_complaints',v_row->>'diagnosis',v_row->>'hpi',v_row->>'assessment',v_row->>'plan',v_row->>'follow_up_date',v_row->>'follow_up_time',v_row->>'management_treatment',v_row->>'attending_provider',v_row->>'past_med_surg_history',v_row->>'history_present_illness',coalesce(v_row->>'follow_up_status','pending'),coalesce(v_row->>'status','Draft'),nullif(v_row->>'completed_at','')::timestamptz,v_crypto->'clinical_ciphertext',v_crypto->>'crypto_ref',1,coalesce(nullif(v_crypto->>'encrypted_at','')::timestamptz,now())) returning consultation_id into v_target_id;
        elsif v_table = 'lab_request' then
          v_allowed := array['consultation_ref','source_authority','request_date','lab_no','chief_complaint','is_cbc','is_cbc_platelet','is_hgb_hct','is_xray','is_ultrasound','is_rbs','is_fbs','is_uric_acid','is_cholesterol','is_urinalysis','is_fecalysis','is_sputum','others','requested_by','status','is_clinical_microscopy','is_blood_chemistry','is_pregnancy_test','is_hbsag_screening','is_hiv_screening','is_parasitology','is_dengue_rdt']; v_id_field := 'labrequest_id';
          select r.record_id into v_target_id from public.patient_transfer_records r where r.source_system=p_source_system and r.source_record_ref=v_row->>'consultation_ref' and r.source_patient_ref=v_ref and r.table_name='consultation';
          if v_target_id is null or not exists(select 1 from public.consultation c where c.consultation_id=v_target_id and c.patient_id=v_patient_id) or nullif(v_row->>'requested_by','') is null or nullif(v_row->>'source_authority','') is null then raise exception 'Lab request consultation or author provenance is invalid'; end if;
          if coalesce(v_row->>'status','') not in ('Pending','Completed') then raise exception 'Laboratory request historical status is invalid'; end if;
          if jsonb_typeof(v_crypto->'sensitive_ciphertext')<>'object' then raise exception 'Encrypted laboratory-request payload is required'; end if;
          insert into public.lab_request(consultation_id,patient_id,request_date,lab_no,chief_complaint,is_cbc,is_cbc_platelet,is_hgb_hct,is_xray,is_ultrasound,is_rbs,is_fbs,is_uric_acid,is_cholesterol,is_urinalysis,is_fecalysis,is_sputum,others,requested_by,status,is_clinical_microscopy,is_blood_chemistry,is_pregnancy_test,is_hbsag_screening,is_hiv_screening,is_parasitology,is_dengue_rdt,sensitive_ciphertext,crypto_ref,crypto_version,encrypted_at) values(v_target_id,v_patient_id,v_row->>'request_date',v_row->>'lab_no',v_row->>'chief_complaint',(v_row->>'is_cbc')::boolean,(v_row->>'is_cbc_platelet')::boolean,(v_row->>'is_hgb_hct')::boolean,(v_row->>'is_xray')::boolean,(v_row->>'is_ultrasound')::boolean,(v_row->>'is_rbs')::boolean,(v_row->>'is_fbs')::boolean,(v_row->>'is_uric_acid')::boolean,(v_row->>'is_cholesterol')::boolean,(v_row->>'is_urinalysis')::boolean,(v_row->>'is_fecalysis')::boolean,(v_row->>'is_sputum')::boolean,v_row->>'others',v_row->>'requested_by','Pending',(v_row->>'is_clinical_microscopy')::boolean,(v_row->>'is_blood_chemistry')::boolean,(v_row->>'is_pregnancy_test')::boolean,(v_row->>'is_hbsag_screening')::boolean,(v_row->>'is_hiv_screening')::boolean,(v_row->>'is_parasitology')::boolean,(v_row->>'is_dengue_rdt')::boolean,v_crypto->'sensitive_ciphertext',v_crypto->>'crypto_ref',1,coalesce(nullif(v_crypto->>'encrypted_at','')::timestamptz,now())) returning labrequest_id into v_target_id;
        elsif v_table = 'lab_result' then
          v_allowed := array['lab_request_ref','consultation_ref','source_authority','date_performed','findings','performed_by','status']; v_id_field := 'labresult_id';
          select r.record_id into v_target_id from public.patient_transfer_records r where r.source_system=p_source_system and r.source_record_ref=v_row->>'lab_request_ref' and r.source_patient_ref=v_ref and r.table_name='lab_request';
          if v_target_id is null or not exists(select 1 from public.lab_request l join public.patient_transfer_records cm on cm.source_system=p_source_system and cm.source_record_ref=v_row->>'consultation_ref' and cm.source_patient_ref=v_ref and cm.table_name='consultation' and cm.record_id=l.consultation_id where l.labrequest_id=v_target_id and l.patient_id=v_patient_id) or nullif(v_row->>'performed_by','') is null or nullif(v_row->>'source_authority','') is null then raise exception 'Lab result request, consultation, patient, or author provenance is invalid'; end if;
          if jsonb_typeof(v_crypto->'findings_ciphertext')<>'object' or v_row->>'status' is distinct from 'Completed' then raise exception 'Encrypted completed laboratory result payload is required'; end if;
          insert into public.lab_result(labrequest_id,patient_id,consultation_id,date_performed,findings,performed_by,status,findings_ciphertext,crypto_ref,crypto_version,encrypted_at) values(v_target_id,v_patient_id,(select r.record_id from public.patient_transfer_records r where r.source_system=p_source_system and r.source_record_ref=v_row->>'consultation_ref' and r.source_patient_ref=v_ref and r.table_name='consultation'),v_row->>'date_performed',v_row->>'findings',v_row->>'performed_by','Completed',v_crypto->'findings_ciphertext',v_crypto->>'crypto_ref',1,coalesce(nullif(v_crypto->>'encrypted_at','')::timestamptz,now())) returning labresult_id into v_target_id;
        elsif v_table = 'prescription' then
          v_allowed := array['consultation_ref','source_authority','prescription_date','rx_content','doctor_name','license_no','ptr_no','status','dispensed_at']; v_id_field := 'prescription_id';
          select r.record_id into v_target_id from public.patient_transfer_records r where r.source_system=p_source_system and r.source_record_ref=v_row->>'consultation_ref' and r.source_patient_ref=v_ref and r.table_name='consultation';
          if v_target_id is null or not exists(select 1 from public.consultation c where c.consultation_id=v_target_id and c.patient_id=v_patient_id) or nullif(v_row->>'doctor_name','') is null or nullif(v_row->>'source_authority','') is null then raise exception 'Prescription consultation or author provenance is invalid'; end if;
          if jsonb_typeof(v_crypto->'rx_ciphertext')<>'object' or coalesce(v_row->>'status','') not in ('Pending','Dispensed') then raise exception 'Encrypted prescription payload or valid historical status is required'; end if;
          insert into public.prescription(consultation_id,patient_id,prescription_date,rx_content,doctor_name,license_no,ptr_no,status,dispensed_at,rx_ciphertext,crypto_ref,crypto_version,encrypted_at) values(v_target_id,v_patient_id,v_row->>'prescription_date',v_row->>'rx_content',v_row->>'doctor_name',nullif(v_row->>'license_no','')::bigint,v_row->>'ptr_no','Pending',null,v_crypto->'rx_ciphertext',v_crypto->>'crypto_ref',1,coalesce(nullif(v_crypto->>'encrypted_at','')::timestamptz,now())) returning prescription_id into v_target_id;
          if v_row->>'status'='Dispensed' then
            if nullif(v_row->>'dispensed_at','') is null then raise exception 'Dispensed prescription requires its historical timestamp'; end if;
            update public.prescription set status='Dispensed',dispensed_at=v_row->>'dispensed_at' where prescription_id=v_target_id;
          elsif nullif(v_row->>'dispensed_at','') is not null then raise exception 'Pending prescription cannot include a dispensed timestamp'; end if;
        elsif v_table = 'follow_up' then
          v_allowed := array['consultation_ref','source_authority','visit_date','visit_time','mode_of_transaction','mode_of_transfer','chief_complaint','diagnosis','history_of_present_illness','bp','heart_rate','respiratory_rate','temperature','o2_saturation','weight','height','muac','nutritional_status','bmi','visual_acuity_left','visual_acuity_right','blood_type','general_survey','medication_treatment','lab_results','follow_up_status']; v_id_field := 'followup_id';
          select r.record_id into v_target_id from public.patient_transfer_records r where r.source_system=p_source_system and r.source_record_ref=v_row->>'consultation_ref' and r.source_patient_ref=v_ref and r.table_name='consultation';
          if v_target_id is null or not exists(select 1 from public.consultation c where c.consultation_id=v_target_id and c.patient_id=v_patient_id) or nullif(v_row->>'source_authority','') is null then raise exception 'Follow-up consultation or author provenance is invalid'; end if;
          if jsonb_typeof(v_crypto->'clinical_ciphertext')<>'object' then raise exception 'Encrypted follow-up payload is required'; end if;
          insert into public.follow_up(patient_id,consultation_id,visit_date,visit_time,mode_of_transaction,mode_of_transfer,chief_complaint,diagnosis,history_of_present_illness,bp,heart_rate,respiratory_rate,temperature,o2_saturation,weight,height,muac,nutritional_status,bmi,visual_acuity_left,visual_acuity_right,blood_type,general_survey,medication_treatment,lab_results,follow_up_status,clinical_ciphertext,crypto_ref,crypto_version,encrypted_at) values(v_patient_id,v_target_id,v_row->>'visit_date',v_row->>'visit_time',v_row->>'mode_of_transaction',v_row->>'mode_of_transfer',v_row->>'chief_complaint',v_row->>'diagnosis',v_row->>'history_of_present_illness',v_row->>'bp',nullif(v_row->>'heart_rate','')::bigint,nullif(v_row->>'respiratory_rate','')::bigint,nullif(v_row->>'temperature','')::double precision,nullif(v_row->>'o2_saturation','')::bigint,nullif(v_row->>'weight','')::double precision,nullif(v_row->>'height','')::double precision,nullif(v_row->>'muac','')::double precision,v_row->>'nutritional_status',nullif(v_row->>'bmi','')::double precision,v_row->>'visual_acuity_left',v_row->>'visual_acuity_right',v_row->>'blood_type',v_row->>'general_survey',v_row->>'medication_treatment',v_row->>'lab_results',coalesce(v_row->>'follow_up_status','pending'),v_crypto->'clinical_ciphertext',v_crypto->>'crypto_ref',1,coalesce(nullif(v_crypto->>'encrypted_at','')::timestamptz,now())) returning followup_id into v_target_id;
        else raise exception 'Unsupported clinical record table'; end if;

        v_date_field := case v_table when 'initial_consultation' then 'consultation_date' when 'lab_request' then 'request_date' when 'lab_result' then 'date_performed' when 'prescription' then 'prescription_date' when 'follow_up' then 'visit_date' else null end;
        if v_date_field is not null and nullif(v_row->>v_date_field,'') is not null and ((v_row->>v_date_field) !~ '^\d{4}-\d{2}-\d{2}$' or pg_catalog.to_char(pg_catalog.to_date(v_row->>v_date_field,'YYYY-MM-DD'),'YYYY-MM-DD')<>v_row->>v_date_field) then raise exception 'Clinical service dates must be valid ISO dates'; end if;
        if v_row - v_allowed <> '{}'::jsonb then raise exception 'Clinical record contains unsupported fields'; end if;
        insert into public.patient_transfer_records(source_system,source_record_ref,source_patient_ref,table_name,record_id,created_by) values(p_source_system,v_record_ref,v_ref,v_table,v_target_id,v_actor);
        v_patient_records := v_patient_records + 1;
      end loop;
      for v_domain in select value from jsonb_array_elements(coalesce(v_patient->'records','[]'::jsonb)) where value->>'table'='lab_request' and value->'data'->>'status'='Completed' loop
        select r.record_id into v_target_id from public.patient_transfer_records r where r.source_system=p_source_system and r.source_record_ref=v_domain->>'source_record_ref' and r.source_patient_ref=v_ref and r.table_name='lab_request';
        if v_target_id is null or not exists(select 1 from public.lab_result lr where lr.labrequest_id=v_target_id and lr.patient_id=v_patient_id and lr.status='Completed') then raise exception 'Completed laboratory request requires its completed historical result'; end if;
        update public.lab_request set status='Completed' where labrequest_id=v_target_id and status='Pending';
      end loop;
      v_inserted := v_inserted + v_patient_records;
      if v_patient_is_new then v_patient_count:=v_patient_count+1; end if;
      if v_patient_is_update then v_patient_updates:=v_patient_updates+1; end if;
      v_results := v_results || jsonb_build_array(jsonb_build_object('source_patient_ref',v_ref,'status','IMPORTED','patient_id',v_patient_id));
    exception when others then
      v_rejected := v_rejected + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object('source_patient_ref',v_ref,'status','REJECTED','message','Patient and related records were not imported because validation or relationship checks failed.'));
    end;
  end loop;

  update public.patient_transfer_operations set status=case when v_rejected>0 and (v_patient_count>0 or v_patient_updates>0 or v_duplicates>0) then 'PARTIAL' when v_rejected>0 then 'FAILED' else 'COMPLETED' end,
    patient_count=v_patient_count+v_patient_updates+v_duplicates,record_count=v_inserted+v_patient_count+v_patient_updates,duplicate_count=v_duplicates+v_record_duplicates,updated_count=v_patient_updates,rejected_count=v_rejected,failure_count=v_rejected,finished_at=now() where id=v_operation;
  insert into public.audit_logs(user_id,user_role,action,module,record_id,record_type,description,metadata)
  values(v_actor,'admin','bulk_import','Patient Records',v_operation::text,'patient_transfer','Completed Admin patient record import.',jsonb_build_object('operation_id',v_operation,'patient_count',v_patient_count+v_patient_updates+v_duplicates,'record_count',v_inserted+v_patient_count+v_patient_updates,'duplicate_count',v_duplicates+v_record_duplicates,'updated_count',v_patient_updates,'rejected_count',v_rejected));
  return jsonb_build_object('operation_id',v_operation,'status',case when v_rejected>0 and (v_patient_count>0 or v_patient_updates>0 or v_duplicates>0) then 'PARTIAL' when v_rejected>0 then 'FAILED' else 'COMPLETED' end,'patient_count',v_patient_count+v_patient_updates+v_duplicates,'record_count',v_inserted+v_patient_count+v_patient_updates,'duplicate_count',v_duplicates+v_record_duplicates,'updated_count',v_patient_updates,'rejected_count',v_rejected,'results',v_results);
end;
$$;

-- Export function is paged, field allow-listed, and refuses records outside
-- the requested patient scope. The caller records a completion receipt only
-- after serialization succeeds.
create or replace function public.admin_patient_transfer_export(p_patient_ids bigint[],p_export_format text,p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := p_actor_id; v_role text; v_active boolean; v_operation uuid := gen_random_uuid(); v_patient_refs jsonb;
begin
  select p.role,p.is_active into v_role,v_active from public.profiles p where p.id=v_actor;
  if v_actor is null or v_role <> 'admin' or v_active is distinct from true then raise exception 'Administrator authorization required' using errcode='42501'; end if;
  if p_patient_ids is null or cardinality(p_patient_ids) not between 1 and 100 then raise exception 'Export requires 1 to 100 patients' using errcode='22023'; end if;
  if p_export_format not in ('xlsx','csv') then raise exception 'Invalid export format' using errcode='22023'; end if;
  if exists(select 1 from unnest(p_patient_ids) x where x is null) or cardinality(p_patient_ids)<>(select count(distinct x) from unnest(p_patient_ids) x) then raise exception 'Invalid or repeated patient selection' using errcode='22023'; end if;
  if exists(select 1 from unnest(p_patient_ids) x left join public.patients p on p.id=x where p.id is null) then raise exception 'One or more patients are unavailable' using errcode='42501'; end if;
  insert into public.patient_transfer_patients(source_system,source_patient_ref,patient_id,created_by)
    select 'MEDISENS','MEDISENS-PATIENT-'||p.id::text,p.id,v_actor from public.patients p where p.id=any(p_patient_ids)
    on conflict do nothing;
  if exists(select 1 from public.patients p left join public.patient_transfer_patients m on m.source_system='MEDISENS' and m.patient_id=p.id where p.id=any(p_patient_ids) and m.patient_id is null) then raise exception 'Patient source mapping is unavailable' using errcode='23505'; end if;
  if p_export_format='xlsx' then
  insert into public.patient_transfer_records(source_system,source_record_ref,source_patient_ref,table_name,record_id,created_by)
    select 'MEDISENS',source.table_name||':'||source.record_id::text,pm.source_patient_ref,source.table_name,source.record_id,v_actor
    from (
      select 'initial_consultation'::text table_name,i.initialconsultation_id::bigint record_id,i.patient_id::bigint patient_id from public.initial_consultation i where i.patient_id=any(p_patient_ids)
      union all select 'vital_sign',v.vitals_id::bigint,v.patient_id::bigint from public.vital_sign v where v.patient_id=any(p_patient_ids)
      union all select 'consultation',c.consultation_id::bigint,c.patient_id::bigint from public.consultation c where c.patient_id=any(p_patient_ids)
      union all select 'lab_request',l.labrequest_id::bigint,l.patient_id::bigint from public.lab_request l where l.patient_id=any(p_patient_ids)
      union all select 'lab_result',r.labresult_id::bigint,r.patient_id::bigint from public.lab_result r where r.patient_id=any(p_patient_ids)
      union all select 'prescription',r.prescription_id::bigint,r.patient_id::bigint from public.prescription r where r.patient_id=any(p_patient_ids)
      union all select 'follow_up',f.followup_id::bigint,f.patient_id::bigint from public.follow_up f where f.patient_id=any(p_patient_ids)
    ) source join public.patient_transfer_patients pm on pm.source_system='MEDISENS' and pm.patient_id=source.patient_id
    on conflict(source_system,source_record_ref) do nothing;
  if exists(
    select 1 from (
      select 'initial_consultation'::text table_name,i.initialconsultation_id::bigint record_id,i.patient_id::bigint patient_id from public.initial_consultation i where i.patient_id=any(p_patient_ids)
      union all select 'vital_sign',v.vitals_id::bigint,v.patient_id::bigint from public.vital_sign v where v.patient_id=any(p_patient_ids)
      union all select 'consultation',c.consultation_id::bigint,c.patient_id::bigint from public.consultation c where c.patient_id=any(p_patient_ids)
      union all select 'lab_request',l.labrequest_id::bigint,l.patient_id::bigint from public.lab_request l where l.patient_id=any(p_patient_ids)
      union all select 'lab_result',r.labresult_id::bigint,r.patient_id::bigint from public.lab_result r where r.patient_id=any(p_patient_ids)
      union all select 'prescription',r.prescription_id::bigint,r.patient_id::bigint from public.prescription r where r.patient_id=any(p_patient_ids)
      union all select 'follow_up',f.followup_id::bigint,f.patient_id::bigint from public.follow_up f where f.patient_id=any(p_patient_ids)
    ) source join public.patient_transfer_patients pm on pm.source_system='MEDISENS' and pm.patient_id=source.patient_id
    left join public.patient_transfer_records mapping on mapping.source_system='MEDISENS' and mapping.source_record_ref=source.table_name||':'||source.record_id::text
    where mapping.record_id is distinct from source.record_id or mapping.table_name is distinct from source.table_name or mapping.source_patient_ref is distinct from pm.source_patient_ref
  ) then raise exception 'Clinical source mapping is already bound to another patient or record' using errcode='23505'; end if;
  end if;
  select jsonb_agg(jsonb_build_object('patient_id',p.id,'source_patient_ref',m.source_patient_ref) order by p.id)
    into v_patient_refs from public.patients p join public.patient_transfer_patients m on m.source_system='MEDISENS' and m.patient_id=p.id where p.id=any(p_patient_ids);
  insert into public.patient_transfer_operations(id,operation_type,status,performed_by,patient_count,export_format) values(v_operation,'EXPORT','REQUESTED',v_actor,cardinality(p_patient_ids),p_export_format);
  insert into public.patient_transfer_export_items(operation_id,patient_id) select v_operation,x from unnest(p_patient_ids) x;
  insert into public.audit_logs(user_id,user_role,action,module,record_id,record_type,description,metadata)
  values(v_actor,'admin','bulk_export_requested','Patient Records',v_operation::text,'patient_transfer','Admin patient export requested.',jsonb_build_object('operation_id',v_operation,'patient_count',cardinality(p_patient_ids)));
  return jsonb_build_object('operation_id',v_operation,'status','REQUESTED','source_system','MEDISENS','patients',coalesce(v_patient_refs,'[]'::jsonb));
end; $$;

create or replace function public.admin_patient_transfer_export_generated(p_operation_id uuid,p_record_count integer,p_actor_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=p_actor_id; v_role text; v_active boolean;
begin
  select p.role,p.is_active into v_role,v_active from public.profiles p where p.id=v_actor;
  if v_actor is null or v_role<>'admin' or v_active is distinct from true then raise exception 'Administrator authorization required' using errcode='42501'; end if;
  if p_record_count is null or p_record_count<1 or p_record_count>5100 then raise exception 'Invalid server export count' using errcode='22023'; end if;
  update public.patient_transfer_operations o set status='GENERATED',record_count=p_record_count
    where o.id=p_operation_id and o.performed_by=v_actor and o.operation_type='EXPORT' and o.status='REQUESTED'
      and exists(select 1 from public.patient_transfer_export_items i where i.operation_id=o.id);
  if not found then raise exception 'Export operation is unavailable'; end if;
  insert into public.audit_logs(user_id,user_role,action,module,record_id,record_type,description,metadata)
  values(v_actor,'admin','bulk_export_generated','Patient Records',p_operation_id::text,'patient_transfer','Admin patient record export generated.',jsonb_build_object('operation_id',p_operation_id));
end; $$;

create or replace function public.admin_patient_transfer_export_complete(p_operation_id uuid,p_actor_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=p_actor_id; v_role text; v_active boolean;
begin
  select p.role,p.is_active into v_role,v_active from public.profiles p where p.id=v_actor;
  if v_actor is null or v_role<>'admin' or v_active is distinct from true then raise exception 'Administrator authorization required' using errcode='42501'; end if;
  update public.patient_transfer_operations set status='COMPLETED',finished_at=now() where id=p_operation_id and performed_by=v_actor and operation_type='EXPORT' and status='GENERATED';
  if not found then raise exception 'Export operation is unavailable'; end if;
  insert into public.audit_logs(user_id,user_role,action,module,record_id,record_type,description,metadata)
  values(v_actor,'admin','bulk_export_complete','Patient Records',p_operation_id::text,'patient_transfer','Admin client reported that the generated patient export download was initiated.',jsonb_build_object('operation_id',p_operation_id,'completion_signal','browser_download_started'));
end; $$;

create or replace function public.admin_patient_transfer_export_failed(p_operation_id uuid,p_actor_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=p_actor_id; v_role text; v_active boolean;
begin
  select p.role,p.is_active into v_role,v_active from public.profiles p where p.id=v_actor;
  if v_actor is null or v_role<>'admin' or v_active is distinct from true then raise exception 'Administrator authorization required' using errcode='42501'; end if;
  update public.patient_transfer_operations set status='FAILED',failure_count=1,finished_at=now() where id=p_operation_id and performed_by=v_actor and operation_type='EXPORT' and status in ('REQUESTED','GENERATED');
  if not found then raise exception 'Export operation is unavailable'; end if;
  insert into public.audit_logs(user_id,user_role,action,module,record_id,record_type,description,metadata)
  values(v_actor,'admin','bulk_export_failed','Patient Records',p_operation_id::text,'patient_transfer','Admin patient export generation did not complete.',jsonb_build_object('operation_id',p_operation_id));
end; $$;
create or replace function public.admin_patient_transfer_history(p_limit integer,p_actor_id uuid)
returns table(id uuid,operation_type text,status text,performed_by uuid,performed_by_name text,patient_count integer,record_count integer,duplicate_count integer,rejected_count integer,failure_count integer,updated_count integer,created_at timestamptz,finished_at timestamptz) language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=p_actor_id; v_role text; v_active boolean;
begin
  select p.role,p.is_active into v_role,v_active from public.profiles p where p.id=v_actor;
  if v_actor is null or v_role<>'admin' or v_active is distinct from true then raise exception 'Administrator authorization required' using errcode='42501'; end if;
  return query select o.id,o.operation_type,o.status,o.performed_by,p.full_name,o.patient_count,o.record_count,o.duplicate_count,o.rejected_count,o.failure_count,o.updated_count,o.created_at,o.finished_at from public.patient_transfer_operations o join public.profiles p on p.id=o.performed_by order by o.created_at desc limit least(greatest(coalesce(p_limit,100),1),200);
end; $$;

alter function public.admin_patient_transfer_import(text,jsonb,uuid) owner to postgres;
alter function public.admin_patient_transfer_search(text,text,integer,integer,uuid) owner to postgres;
alter function public.admin_patient_transfer_export(bigint[],text,uuid) owner to postgres;
alter function public.admin_patient_transfer_export_generated(uuid,integer,uuid) owner to postgres;
alter function public.admin_patient_transfer_export_complete(uuid,uuid) owner to postgres;
alter function public.admin_patient_transfer_export_failed(uuid,uuid) owner to postgres;
alter function public.admin_patient_transfer_history(integer,uuid) owner to postgres;
revoke all on function public.admin_patient_transfer_import(text,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.admin_patient_transfer_search(text,text,integer,integer,uuid) from public,anon,authenticated;
revoke all on function public.admin_patient_transfer_export(bigint[],text,uuid) from public,anon,authenticated;
revoke all on function public.admin_patient_transfer_export_generated(uuid,integer,uuid) from public,anon,authenticated;
revoke all on function public.admin_patient_transfer_export_complete(uuid,uuid) from public,anon,authenticated;
revoke all on function public.admin_patient_transfer_export_failed(uuid,uuid) from public,anon,authenticated;
revoke all on function public.admin_patient_transfer_history(integer,uuid) from public,anon,authenticated;
grant execute on function public.admin_patient_transfer_import(text,jsonb,uuid) to service_role;
grant execute on function public.admin_patient_transfer_search(text,text,integer,integer,uuid) to service_role;
grant execute on function public.admin_patient_transfer_export(bigint[],text,uuid) to service_role;
grant execute on function public.admin_patient_transfer_export_generated(uuid,integer,uuid) to service_role;
grant execute on function public.admin_patient_transfer_export_complete(uuid,uuid) to service_role;
grant execute on function public.admin_patient_transfer_export_failed(uuid,uuid) to service_role;
grant execute on function public.admin_patient_transfer_history(integer,uuid) to service_role;
