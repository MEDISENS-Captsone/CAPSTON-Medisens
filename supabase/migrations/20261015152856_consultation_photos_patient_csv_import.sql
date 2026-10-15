-- Only the three approved revisions: consultation photos and patient CSV import.
create schema if not exists revision_private;
revoke all on schema revision_private from public, anon;
grant usage on schema revision_private to authenticated, service_role;

create function revision_private.can_use_clinical_photos() returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid())
    and p.is_active and p.role in ('BHW','nurse','midwives','doctor'));
$$;
revoke all on function revision_private.can_use_clinical_photos() from public, anon;
grant execute on function revision_private.can_use_clinical_photos() to authenticated;

create table public.consultation_photos (
  id uuid primary key default gen_random_uuid(),
  patient_id bigint not null references public.patients(id),
  consultation_id bigint not null references public.consultation(consultation_id),
  uploaded_by uuid not null default auth.uid() references auth.users(id),
  consent_confirmed boolean not null check (consent_confirmed),
  consent_confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  ready boolean not null default false,
  object_path text generated always as (patient_id::text || '/' || consultation_id::text || '/' || id::text) stored
);
create index consultation_photos_patient_consultation_idx on public.consultation_photos(patient_id, consultation_id);
alter table public.consultation_photos enable row level security;
revoke all on public.consultation_photos from anon, authenticated;
grant select, delete on public.consultation_photos to authenticated;
grant insert (id,patient_id,consultation_id,consent_confirmed,mime_type,size_bytes) on public.consultation_photos to authenticated;
grant update (ready) on public.consultation_photos to authenticated;
create policy clinical_photo_read on public.consultation_photos for select to authenticated
  using (revision_private.can_use_clinical_photos());
create policy clinical_photo_insert on public.consultation_photos for insert to authenticated
  with check (revision_private.can_use_clinical_photos() and uploaded_by = (select auth.uid())
    and exists (select 1 from public.consultation c join public.patients p on p.id=c.patient_id
      where c.consultation_id=consultation_photos.consultation_id and c.patient_id=consultation_photos.patient_id and p.archive_status='active'));
create policy clinical_photo_update on public.consultation_photos for update to authenticated
  using (revision_private.can_use_clinical_photos() and uploaded_by=(select auth.uid()) and not ready)
  with check (revision_private.can_use_clinical_photos() and uploaded_by=(select auth.uid()) and ready);
create policy clinical_photo_delete on public.consultation_photos for delete to authenticated
  using (revision_private.can_use_clinical_photos() and uploaded_by=(select auth.uid()));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('consultation-photos','consultation-photos',false,10485760,array['image/jpeg','image/png','image/webp']);
create policy consultation_photo_object_read on storage.objects for select to authenticated
  using (bucket_id='consultation-photos' and revision_private.can_use_clinical_photos()
    and exists (select 1 from public.consultation_photos p where p.object_path=name and (p.ready or p.uploaded_by=(select auth.uid()))));
create policy consultation_photo_object_insert on storage.objects for insert to authenticated
  with check (bucket_id='consultation-photos' and revision_private.can_use_clinical_photos()
    and exists (select 1 from public.consultation_photos p where p.object_path=name and p.uploaded_by=(select auth.uid()) and not p.ready and p.consent_confirmed));
create policy consultation_photo_object_delete on storage.objects for delete to authenticated
  using (bucket_id='consultation-photos' and revision_private.can_use_clinical_photos()
    and exists (select 1 from public.consultation_photos p where p.object_path=name and p.uploaded_by=(select auth.uid())));

-- Definer is restricted to trigger execution; clients cannot forge actor/timestamp
-- or write audit rows. It only validates this feature's metadata and records events.
create function revision_private.photo_lifecycle() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_row public.consultation_photos; v_role text;
begin
  select p.role into v_role from public.profiles p where p.id=auth.uid() and p.is_active;
  if auth.uid() is null or v_role is null or v_role not in ('BHW','nurse','midwives','doctor') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  if tg_op='DELETE' then
    if exists (select 1 from storage.objects o where o.bucket_id='consultation-photos' and o.name=old.object_path) then
      raise exception 'Remove the stored photo before its metadata';
    end if;
    v_row := old;
  else
    v_row := new;
    if new.ready and not exists (select 1 from storage.objects o where o.bucket_id='consultation-photos' and o.name=new.patient_id::text || '/' || new.consultation_id::text || '/' || new.id::text) then
      raise exception 'Photo upload is incomplete';
    end if;
  end if;
  if (tg_op='UPDATE' and new.ready and not old.ready) or (tg_op='DELETE' and old.ready) then
    insert into public.audit_logs(user_id,user_role,action,module,record_id,record_type,description,metadata)
    values (auth.uid(),v_role,case when tg_op='DELETE' then 'update' else 'create' end,'Consultation',v_row.consultation_id::text,'consultation',
      case when tg_op='DELETE' then 'Removed consultation photo.' else 'Uploaded consultation photo with explicit photo consent.' end,
      jsonb_build_object('patient_id',v_row.patient_id,'consultation_id',v_row.consultation_id,'photo_id',v_row.id,'consent_confirmed_at',v_row.consent_confirmed_at));
  end if;
  return v_row;
end;
$$;
revoke all on function revision_private.photo_lifecycle() from public, anon, authenticated;
create trigger consultation_photo_lifecycle before update or delete on public.consultation_photos for each row execute function revision_private.photo_lifecycle();

-- Service-only entrypoint: the Edge Function validates JWT, active clinical role,
-- row values, and encrypts using the existing service's v1 dual-write format.
-- No changes to the pre-existing patient registration policies or secure service.
create function public.import_patient_csv_rows(p_actor uuid, p_rows jsonb, p_commit boolean default false) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_role text; v_row jsonb; v_patient public.patients; v_results jsonb='[]';
  v_index integer=0; v_duplicate boolean; v_name text; v_ph text;
  v_names text[]='{}'; v_phs text[]='{}'; v_count integer=0;
begin
  select p.role into v_role from public.profiles p where p.id=p_actor and p.is_active;
  if v_role is null or v_role not in ('BHW','nurse','midwives','doctor') then raise exception 'Access denied' using errcode='42501'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 500 or p_commit is null then raise exception 'Invalid import'; end if;
  -- Serializes against imports AND ordinary inserts; duplicate checks and inserts
  -- share one transaction. Preview does not persist patients or consume identities.
  lock table public.patients in share row exclusive mode;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_index := v_index + 1;
    if v_row ? 'validation_error' then
      v_results := v_results || jsonb_build_array(jsonb_build_object('row',v_index,'status','invalid','message',v_row->>'validation_error'));
      continue;
    end if;
    if v_row->'pii_ciphertext'->>'alg' is distinct from 'A256GCM' or v_row->>'crypto_ref' is null then raise exception 'Missing encrypted patient payload'; end if;
    v_name := lower(regexp_replace(btrim(concat_ws(' ', v_row->>'firstName',v_row->>'middleName',v_row->>'lastName',v_row->>'suffix')), '\s+', ' ', 'g')) || '|' || (v_row->>'birthday');
    v_ph := regexp_replace(coalesce(v_row->>'philhealthNo',''), '[^0-9]', '', 'g');
    select (v_name=any(v_names) or (v_ph<>'' and v_ph=any(v_phs)) or exists (
      select 1 from public.patients p where
        (v_ph<>'' and (regexp_replace(coalesce(p."philhealthNo",''),'[^0-9]','','g')=v_ph or p.philhealth_bidx=v_row->>'philhealth_bidx'))
        or lower(regexp_replace(btrim(concat_ws(' ',p."firstName",p."middleName",p."lastName",p.suffix)),'\s+',' ','g')) || '|' || p.birthday = v_name
    )) into v_duplicate;
    v_names := array_append(v_names,v_name); if v_ph<>'' then v_phs:=array_append(v_phs,v_ph); end if;
    if v_duplicate then
      v_results:=v_results || jsonb_build_array(jsonb_build_object('row',v_index,'status','duplicate','message','Possible duplicate in this file or the patient registry; review manually.'));
      continue;
    end if;
    if p_commit then
      v_patient := jsonb_populate_record(null::public.patients,v_row - 'contactNumber');
      insert into public.patients("firstName","middleName","lastName",suffix,birthday,age,sex,address,"nationality","bloodType",religion,"birthPlace","contactNumber","civilStatus","educationalAttain","employmentStatus","philhealthNo","philhealthStatus",category,"categoryOthers","relativeName","relativeRelation","relativeAddress","relativeContact",consent_signed,pii_ciphertext,crypto_ref,crypto_version,encrypted_at,name_token_bidx,contact_bidx,philhealth_bidx)
      values(v_patient."firstName",v_patient."middleName",v_patient."lastName",v_patient.suffix,v_patient.birthday,v_patient.age,v_patient.sex,v_patient.address,v_patient.nationality,v_patient."bloodType",v_patient.religion,v_patient."birthPlace",nullif(v_row->>'contactNumber','')::bigint,v_patient."civilStatus",v_patient."educationalAttain",v_patient."employmentStatus",v_patient."philhealthNo",v_patient."philhealthStatus",v_patient.category,v_patient."categoryOthers",v_patient."relativeName",v_patient."relativeRelation",v_patient."relativeAddress",v_patient."relativeContact",false,v_patient.pii_ciphertext,v_patient.crypto_ref,1,now(),v_patient.name_token_bidx,v_patient.contact_bidx,v_patient.philhealth_bidx);
      v_count := v_count+1;
    end if;
    v_results := v_results || jsonb_build_array(jsonb_build_object('row',v_index,'status',case when p_commit then 'imported' else 'ready' end,'message',case when p_commit then 'Patient added; patient consent pending.' else 'Ready to import.' end));
  end loop;
  insert into public.audit_logs(user_id,user_role,action,module,record_type,description,metadata)
  values(p_actor,v_role,case when p_commit then 'create' else 'view' end,'Patient Records','patient',case when p_commit then 'Completed patient CSV import.' else 'Previewed patient CSV import.' end,
    jsonb_build_object('action_scope','patient_csv_import','count',v_count,'rows',jsonb_array_length(p_rows),'committed',p_commit));
  return v_results;
end;
$$;
revoke all on function public.import_patient_csv_rows(uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.import_patient_csv_rows(uuid,jsonb,boolean) to service_role;
