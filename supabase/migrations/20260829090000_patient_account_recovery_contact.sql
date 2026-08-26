-- Patient Account Phase 9B Step 7 -- recovery-contract hardening.
--
-- Root cause found: patient-account-recover resolves the recovery phone
-- number exclusively through the account holder's active SELF grant ->
-- patients.contactNumber. patient_accounts itself has no contact field of
-- its own. This is correct and unchanged for a SELF account (the account
-- holder IS that patient), but it means an account-only
-- AUTHORIZED_CAREGIVER (no patient record at all) or a GUARDIAN account
-- holder who is not separately a MediSens patient (no SELF grant) has no
-- verified contact on file anywhere, and self-service recovery silently
-- cannot work for them, despite both being valid, already-supported
-- Patient Account configurations (docs/patientAccount.md §5.2.1, §4.2).
--
-- Smallest correction: one new nullable column on patient_accounts,
-- populated only from a source that is already the account holder's own
-- verified contact -- never copied from a ward/patient's record:
--   - Account-only caregiver: patient-caregiver-activation-issue already
--     collects `contactNumber` from staff (currently used only
--     transiently to send the activation SMS, then discarded). It is now
--     also persisted here, because it already IS the caregiver's own
--     number, collected at the same identity-verification step
--     (identity_verified_by/at/note) as everything else on this row.
--   - Fresh GUARDIAN activation: patient-activation-issue's GUARDIAN path
--     already accepts and stores `holder_name` (the guardian's own name,
--     never the child's -- see 20260826130000). A parallel
--     `holder_contact_number` column on patient_activation_codes lets
--     staff optionally record the guardian's own number the same way,
--     copied into patient_accounts.recovery_contact_number only when
--     patient-activation-complete creates that fresh account.
--   - SELF accounts are completely unaffected: patient-account-recover's
--     existing SELF-grant lookup remains the first and preferred source
--     for them; this column is only ever consulted as a fallback when no
--     SELF grant exists.
--
-- This does not make the Patient Account model patient-record-centric --
-- the new column lives on patient_accounts (the login), not on any
-- patient/grant row, and nothing here adds a public patient lookup.

alter table public.patient_accounts
  add column recovery_contact_number text;

comment on column public.patient_accounts.recovery_contact_number is
  'The account holder''s own verified contact number, used only as a fallback recovery-OTP destination when the account has no active SELF grant to resolve a phone through (docs/patientAccount.md Phase 9B Step 7). Populated only from patient-caregiver-activation-issue''s staff-collected contactNumber, or a fresh GUARDIAN activation''s holder_contact_number -- never copied from a patient/ward record. Null for accounts with no verified contact on file; recovery request step must remain non-disclosing regardless.';

alter table public.patient_activation_codes
  add column holder_contact_number text;

comment on column public.patient_activation_codes.holder_contact_number is
  'Optional, staff-collected contact number for the account holder of a fresh GUARDIAN activation (parallel to holder_name, added Step 7) -- copied into patient_accounts.recovery_contact_number by patient-activation-complete when the account is created. Never the patient''s own number.';
