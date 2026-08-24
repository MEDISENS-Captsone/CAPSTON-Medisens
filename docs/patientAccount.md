# MediSens Patient Account — Master Blueprint

Status: **Planning only. Nothing in this document has been implemented.**
Audience: later Claude Code / Codex sessions executing one phase at a time.
Authority: this document defers to `docs/CLAUDE.md`, `docs/design/SKILL-UI.md`, and the verified repository. Where this document and the repository disagree, re-inspect the repository first.

---

## 1. Objective and scope

### 1.1 Objective

Give Malvar RHU patients a **read-mostly, mobile-first personal health view** of the records MediSens already holds about them, plus a small set of self-service account controls (PIN, notification preference, accessibility preference, correction requests).

The Patient Account is a **separate front-end shell with a separate authorization model**. It is not a seventh staff role and it must not reuse the staff role machinery.

### 1.2 In scope

- Staff-initiated account activation bound to an existing verified patient record.
- Login, PIN/password change, lockout, and staff-mediated recovery.
- Relationship-based access: `SELF`, `GUARDIAN`, `AUTHORIZED_CAREGIVER`.
- Patient-facing Home, My Health (visits / vaccinations / follow-ups), Medicines, Lab Results, More.
- Correction requests for identity fields (no direct patient writes to clinical or master data).
- Caregiver/guardian access listing and revocation, staff-mediated granting.
- Audit logging of every patient-portal read and every access-grant change.

### 1.3 Explicitly out of scope

Not built, not stubbed, not documented as "future":

- Appointment booking or scheduling.
- Messaging / chat with staff, telemedicine, video.
- Payments, PhilHealth eClaims, DOH/national registry integration.
- Any third-party messaging service beyond the **existing** iProg SMS Edge Function.
- Patient-initiated caregiver invitations (self-service sharing).
- Offline caching of clinical data (see §16.4).
- Patient uploads (photos, documents, home vitals).
- Family/household account trees beyond the explicit per-patient grant list.
- Merging duplicate patient records (staff/back-office concern; see §15).

---

## 2. Target users

| User | Design consequence |
|---|---|
| Adolescent patient (~12–17) | Own login. Simple language. Guardian may also hold access. |
| Adult patient | Primary case. `SELF` access only. |
| Senior citizen, independent | **`SELF` by default.** Never auto-assign a caregiver. Larger text mode available to everyone. |
| Elderly / low digital literacy | Few screens, big targets, plain Filipino-English wording, no jargon, no icon-only actions. |
| Parent / legal guardian | `GUARDIAN` access to an eligible minor, plus their own `SELF` record. |
| Authorized caregiver | Read-only assistance for an adult/senior who explicitly authorized them at the RHU. |

Design constants derived from these users: one primary action per screen, no horizontal scrolling, ≥44px targets, ≥16px body text in the portal, no reliance on colour alone, and an always-visible answer to "whose record am I looking at?"

---

## 3. Current MediSens architecture findings (verified)

Everything below was read from the repository during this task. File paths are real.

### 3.1 Application shape

- **Vite multi-page app, no router.** Each role is an HTML entry in `pages/*.html` registered in `vite.config.ts` → `build.rollupOptions.input`, mounting a React 19 tree from `src/app/<role>/index.tsx`. In-page navigation uses `src/hooks/useHashPage.ts`.
- Tailwind is loaded from **CDN** (`<script src="https://cdn.tailwindcss.com">`) in each page; design tokens come from `src/styles/tokens.css` (linked by every page) and `src/styles/dashboard.css`.
- Shared primitives: `src/components/ui/` (`Button`, `Card`, `Badge`, `Input`, `Modal`, `Skeleton`, `Toast`, `EmptyState`, `useDialogFocus`), `src/components/shared/` (`Icon`, `StatusBadge`, `LoadingState`, `NetworkBadge`, `LabResultDetailModal`), `src/components/layout/` (`Sidebar`, `Topbar`, `PageHeader`, `Breadcrumbs`, `SkipToContent`, `UserMenu`).
- Connectivity: `src/hooks/useOnlineStatus.ts`, `src/hooks/useNetworkSync.ts`, `src/components/feedback/OfflineBanner.tsx`. **There is no service worker registration anywhere** — `manifest.json` exists at the repo root but nothing registers a SW. MediSens is not currently a PWA.
- Supabase client: `src/lib/supabase/client.ts`, plain `createClient(url, anonKey)` with default (localStorage) session persistence.

### 3.2 Authentication and roles

- `src/types/user.ts`: `Role = 'doctor' | 'nurse' | 'BHW' | 'pharmacist' | 'labaratory' | 'admin' | 'midwives'`. The `labaratory` spelling is intentional.
- `src/lib/auth/roles.ts`: `ROLE_DASHBOARD` maps role → `/pages/*.html`; `requireRole` / `requireAnyRole` read `public.profiles` after `getSession()` and hard-redirect on mismatch. **Route guards are client-side only**; the real boundary is RLS.
- `src/app/auth/login.ts`: email + password via `supabase.auth.signInWithPassword`, then `profiles.role` lookup → redirect. Includes deliberate credential-field clearing for shared RHU workstations.
- `supabase/migrations/20260714071152_trusted_user_role_assignment.sql` defines `public.handle_new_user()` on `auth.users` insert. **It inserts a `profiles` row with a hard-coded role of `'nurse'` for every new auth user.**

> ⚠️ **Dangerous assumption / hard blocker.** Any auth user created by any path today becomes a `nurse` profile, and every clinical `SELECT` policy in §3.4 grants full read to `nurse`. Creating patient auth users without first fixing this trigger would hand every patient a complete staff-level view of the RHU database. This must be Phase 1, before any patient user exists. It also means Supabase **email signups must be confirmed disabled** in project settings (unverifiable from the repo — see D-1).

### 3.3 Data model (inferred from queries; base tables predate the migration history)

Only FHSIS tables have `create table` migrations. Everything else was created in the Supabase dashboard, so column knowledge comes from `src/features/patients/history.ts`, which is the single most complete inventory in the repo.

| Table | Key | Patient-relevant columns |
|---|---|---|
| `patients` | `id` **bigint** | `firstName`, `middleName`, `lastName`, `suffix`, `age`, `sex`, `birthday`, `civilStatus`, `address`, `contactNumber`, `philhealthNo`, `philhealthStatus`, `bloodType`, `category`, relative/emergency fields, `created_at`, plus archive fields `archive_status`, `archived_at/by`, `archive_reason`, `archive_reviewed_at/by`, `archive_protected` |
| `patient_consent` | `consent_id` | `patient_id`, `consent_status`, `consent_signer`, `consent_signature`, `consent_personnel`, `personnel_name`, `consent_date` |
| `initial_consultation` | `initialconsultation_id` | `patient_id`, `consultation_date`, `consultation_time`, `mode_of_transaction`, `referred_by`, `mode_of_transfer`, `chief_complaint`, `diagnosis`, visit status |
| `vital_sign` | — | linked to initial consultation; **doctor-only SELECT today** |
| `consultation` | `consultation_id` | `patient_id`, `initial_consultation_id`, `consultation_date`, `created_at`, `chief_complaints`, `hpi`, `diagnosis`, `assessment`, `plan`, `management_treatment`, `medication_treatment`, `remarks`, `attending_provider`, `doctor_name`, `family_history`, `past_med_surge_history`, `immunization_history`, `smoking_status`, `drinking_status`, `follow_up_status` |
| `lab_request` | `labrequest_id` | `patient_id`, `consultation_id`, `request_date`, `chief_complaint`, `status` (`Pending` → `Completed`), boolean test flags `is_cbc`…`is_sputum`, `others` |
| `lab_result` | `labresult_id` | `labrequest_id`, `patient_id`, `consultation_id`, `date_performed`, `findings` (**JSON string**), `performed_by`, `status` (always `'Completed'`) |
| `prescription` | `prescription_id` | `patient_id`, `prescription_date`, `rx_content` (**JSON array of `{name,dosage,frequency,duration,quantity}`**), `doctor_name`, `status` (`Pending` → `Dispensed`), `dispensed_at` |
| `follow_up` | `followup_id` | `patient_id`, `consultation_id`, `visit_date`, `visit_time`, `chief_complaint`, `diagnosis`, `medication_treatment`, vitals columns, `follow_up_status` (`'done'` terminal) |
| `fhsis_logs` | `id` | `patient_id`, `category` (`'vaccination'`, …), `report_month`, `encoded_by`, `data_fields` **jsonb** containing `vaccine_records[]` |
| `fhsis_reports` / `_values` / `_reviews` | — | monthly reporting workflow; **not patient data** |
| `profiles` | `id` = `auth.users.id` | `email`, `full_name`, `role` |
| `audit_logs` | `id` | `user_id`, `user_name`, `user_role`, `action`, `module`, `record_id`, `record_type`, `description`, `metadata`, `created_at` |

Shape notes that matter for the portal:

- `lab_result.findings` is a JSON **string** parsed client-side in `src/components/shared/LabResultDetailModal.tsx` into groups `clinicalMicroscopy`, `bloodChemistry`, `pregnancyTest`, `hbsagScreening`, `hivScreening`, `parasitology`, `dengueRdt`, plus a free-text `generalNotes` fallback. There is **no reference-range column** in the database; ranges, where shown in that staff viewer, are clinician-facing presentation constants, not validated for patient release — the portal needs its own RHU-approved lookup table (§9.4, §11, D-11) and must not read the staff constants.
- `prescription.rx_content` is parsed by `src/features/pharmacy/prescriptionParser.ts`; malformed content is surfaced as a warning string.
- Vaccination records live **inside `fhsis_logs.data_fields.vaccine_records`** (see `src/features/patients/itemization.ts` → `normalizeVaccineRecords`, and `src/features/patients/vaccineService.ts`). Each record has `vaccine_name`, `vaccine_category`, `dose_label`, `date_given`, `next_due_date`, `administered_by`, `facility`, `lot_number`, `remarks`.
- `follow_up.visit_date` is a **recommended return date recorded by the doctor**, not a booked appointment.

### 3.4 RLS / authorization posture

Read from `supabase/migrations/20260810115857_restore_clinical_restrictive_rls_policies.sql`, `..._harden_patient_consent_rls.sql`, `..._harden_laboratory_prescription_rls.sql`, `..._protect_patient_archive_fields.sql`.

- Every current clinical policy is of the form `exists (select 1 from profiles p where p.id = auth.uid() and p.role in (…staff roles…))`. They are **permissive** policies (name notwithstanding), so additional policies OR in — but see §12 for why the portal should not add policies to these tables at all.
- No client `DELETE` policies on clinical tables; the migration asserts this.
- State transitions are enforced by triggers, not the client: `guard_lab_request_status_update`, `guard_lab_result_completion` (a result may only exist as `Completed`, with findings, performer, and date), `guard_prescription_create` / `guard_prescription_dispensing_update`, `prevent_patient_archive_field_client_update`.
- Analytics uses `SECURITY DEFINER` RPCs with fixed `search_path` and restricted `execute` grants (`analytics_*`, `record_initial_intake`, `submit_fhsis_report`, …). **This is the established pattern the portal should follow.**
- Edge Functions (`supabase/functions/`): `create-user`, `delete-user`, `update-user-role`, `archive-patient-record`, `create-audit-log`, `send-followup-reminders`.
- `create-audit-log` validates against fixed allow-lists: `ALLOWED_ACTIONS`, `ALLOWED_MODULES`, `ALLOWED_RECORD_TYPES`, `ALLOWED_METADATA_KEYS`. The portal will need additions here — a code change, not a schema change.
- `send-followup-reminders` already sends SMS via **iProg** using a service-role client, guarded by an `x-followup-reminder-secret` header, triggered by pg_cron. **This is the only outbound channel MediSens has, and it is the right one to reuse for activation codes and OTP.**

### 3.5 What is missing for a patient portal

No patient↔auth link, no patient-facing role, no OTP/activation infrastructure, no correction-request workflow, no notification table, no bottom navigation shell, no service worker, no generated database types (all queries are hand-typed interfaces).

---

## 4. Patient account / access model

### 4.1 Core decision

> A login is **not** a patient. A login holds **grants** over patient records.

Do **not** add `patients.user_id`. Model access as rows.

```
auth.users ──1:1── patient_accounts ──1:N── patient_access_grants ──N:1── patients
                     (the person logging in)      (relationship + scope + lifecycle)
```

`patient_accounts` describes the human who logs in (who may or may not themselves be a patient). `patient_access_grants` is the authorization edge. A patient who manages their own record has exactly one grant with `relationship = 'SELF'`.

This yields all required cases without special-casing:

- Ana Santos: grant(SELF → Ana's `patients.id`), grant(AUTHORIZED_CAREGIVER → her mother's `patients.id`).
- A minor's guardian: grant(GUARDIAN → child's `patients.id`), plus grant(SELF → the guardian's own record if they are also an RHU patient.
- A patient with two duplicate records: two grants, or (preferred) staff resolve the duplicate first (§15).

### 4.2 Relationship semantics

| Relationship | Who holds it | Established by | Permissions (MVP) |
|---|---|---|---|
| `SELF` | The patient | Activation flow | Read the full patient-visible data set (§7, `scope = 'FULL'`); change own PIN, notification and accessibility preferences; submit correction requests; view every grant on their record; **revoke `AUTHORIZED_CAREGIVER` grants only** — never a `GUARDIAN` grant, regardless of the patient's age (§6.3) |
| `GUARDIAN` | Parent / legal guardian of a patient under 18 | RHU staff, at the counter, against the existing relative/guardian details on the patient record | Read the conservative `STANDARD` patient-visible data set by default (§7.3); submit correction requests on behalf; **cannot** revoke the patient's own `SELF` access; **the grant itself can only be removed or changed by RHU staff**, never by the patient (§6.3) |
| `AUTHORIZED_CAREGIVER` | Anyone the adult/senior patient explicitly authorizes | RHU staff, with the patient present and consenting | **Read-only**, `STANDARD` scope by default (§7.3); receive permitted reminders; nothing else. The patient (`SELF`) may revoke this grant at any time |

Universal prohibitions, enforced in the database, not the UI:

- No grant holder of any kind may write to `patients`, `consultation`, `initial_consultation`, `prescription`, `lab_request`, `lab_result`, `follow_up`, `fhsis_logs`, or `patient_consent`.
- No grant holder may create, modify, or extend a grant. Only staff-invoked, service-role Edge Functions create grants. Revocation is the single exception (§10.3).
- A caregiver session is **never** presented as the patient. The account's own name is always in the header alongside the record being viewed.

### 4.3 Adolescents (~12–17)

MVP position, deliberately simple and reversible:

- A patient aged ≥12 may hold `SELF` and see everything a patient can see.
- A guardian may hold `GUARDIAN` over the same record and sees the same patient-visible data. Both may hold access simultaneously; neither is hidden from the other (the "People who can access this record" screen shows the guardian to the youth and the youth's `SELF` access to the guardian).
- `GUARDIAN` grants carry an `expires_at` defaulted to the patient's 18th birthday. Expiry is evaluated in the authorization function, so no cron job is needed.
- `GUARDIAN` grants default to `scope = 'STANDARD'` (§7.3), the same conservative default every non-`SELF` grant gets. A guardian is not automatically shown specially-protected results (§7.5).
- The visibility mechanism is a per-grant `scope` value, resolved by one authorization function (§12.1). It already carries two values (`FULL`, `STANDARD`) rather than one. If the RHU later needs a third, narrower or wider tier, that is a new `scope` value plus a filter in the same function — **not** a rewrite. Do not build a policy engine now, and do not build partial-visibility UI now.
- Patient-facing wording never says "restricted" or "sensitive" — it says, plainly: *"Your parent or guardian, Maria Santos, can also see this health record."*

### 4.4 Seniors

A senior gets `SELF`. Full stop. Caregiver assistance is opt-in, granted at the RHU with the patient present, listed on their own device, and revocable by them in two taps. Age never influences the access model — only the accessibility preference (which is available to every age).

### 4.5 Session isolation from the staff Supabase client

The Patient Portal and the seven staff shells run on the same origin and must never share a browser session.

- `src/lib/supabase/client.ts` (the staff client) is **untouched** — same `createClient(url, anonKey)` call, same default `localStorage` key (`sb-<project-ref>-auth-token`), same behaviour for all seven role shells.
- A new, separate client, `src/lib/supabase/patientClient.ts`, is created for the portal only. It calls `createClient(url, anonKey, { auth: { storageKey: 'medisens-patient-auth', persistSession: <per D-8>, autoRefreshToken: true, storage: <per D-8> } })` — a **distinct `storageKey`**, so the two clients never read or overwrite each other's session entry on the same origin.
- Signing in on `/pages/patient.html` writes only to the `medisens-patient-auth` key. Signing in on `/pages/login.html` writes only to the default staff key. A staff member and a patient can be signed in simultaneously, in different tabs of the same browser, on the same device, without either session clobbering the other.
- The portal session guard (`src/lib/auth/patientPortal.ts`, Phase 4) calls the **patient** client's `auth.getSession()` — never the staff client's — and never calls `signOut()` on the staff client or vice versa. Signing out of the portal clears only `medisens-patient-auth`; it must not touch or invalidate a concurrent staff session in another tab.
- Because both clients share one `anon` key and one Postgres instance, the real security boundary remains server-side (§12), not the storage key. This isolation exists for **usability and accidental cross-contamination on shared devices**, not authorization — it must not be presented or relied on as a security control.

---

## 5. Account activation, login, and recovery

### 5.1 Why not public sign-up

Name + birthdate is a guessable identifier for a whole barangay. There is no public registration in this design. Activation always starts from a staff member looking at a verified patient record.

### 5.2 Activation (happy path)

```
1. RHU staff (BHW / nurse / midwife / admin) opens a verified, non-archived patient record.
2. Staff taps "Activate Patient Account".
3. Staff confirms who is activating: the patient (SELF) or a guardian for a minor (GUARDIAN).
4. Edge Function `patient-activation-issue`:
     - verifies caller role via JWT,
     - refuses if the record is archived or already has an active grant of that
       relationship for that person,
     - generates an 8-character activation code, stores only its hash + expiry
       (48 h) + single-use flag,
     - if patients.contactNumber exists, sends the code by SMS (iProg),
     - returns the plaintext code to the staff screen **once**, for printing or
       reading aloud when the patient has no phone.
5. Patient opens /pages/patient.html → "Activate my account", enters the code.
6. Edge Function `patient-activation-verify`:
     - hash-compares, checks expiry/use, rate-limits by IP and by code,
     - if a contact number is on file, sends a 6-digit OTP and requires it,
     - if no contact number is on file, the code alone stands (it was handed over
       in person, which is the stronger factor).
7. Patient sets a PIN/password. Rules in §5.4.
8. Edge Function `patient-activation-complete` (service role):
     - creates the auth user with app_metadata.account_type = 'patient',
     - inserts patient_accounts,
     - inserts patient_access_grants (SELF → scope FULL, or GUARDIAN → scope
       STANDARD, per §7.3, §4.3; granted_by = the staff profile id, granted_at = now),
     - burns the activation code,
     - writes audit rows for issuance and completion.
9. Patient is signed in and lands on Home.
```

Every step above is server-side. The client never chooses which `patient_id` it is linking to — the activation code determines it.

### 5.2.1 Account-only caregiver activation (caregiver has no patient record of their own)

A caregiver does not need to be an RHU patient to receive a Patient Portal login. This is a distinct activation path, not a variant of §5.2, because there is no `patients` row to bind to:

```
1. The patient and the prospective caregiver are both present at the RHU counter,
   for the same visit that will grant caregiver access (§6.1).
2. Staff verify the caregiver's identity the same way the RHU already verifies
   identity for consent purposes (e.g. a government-issued ID), and record that
   verification against the new account — not against any patients row, because
   the caregiver may have none.
3. Edge Function `patient-caregiver-activation-issue` (role-checked, staff only)
   creates the caregiver's patient_accounts row directly:
     - auth user with app_metadata.account_type = 'patient',
     - identity_verified_by = the staff profile id,
       identity_verified_at = now(),
       identity_note = a short staff-entered note on how identity was confirmed,
     - no patient_id anywhere on this row — patient_accounts never references a
       patient directly; only patient_access_grants does (§11).
4. The caregiver sets their own PIN through the same verify / PIN-setup steps as
   §5.2 (steps 6–7): OTP to the caregiver's own phone number when one is on
   file, or the in-person code alone otherwise.
5. `patient-access-grant` (§6.1) then creates the AUTHORIZED_CAREGIVER grant over
   the patient's record. No SELF grant is ever created for this account, because
   the caregiver has no patient record to be SELF over.
6. The caregiver signs in with their own MediSens ID and PIN, in their own
   session (§4.5). They never sign in as, or hold the credentials of, the
   patient they assist — MediSens has no concept of "borrowing" a patient's
   login, by design.
```

Audit behaviour: `patient-caregiver-activation-issue` and `patient-access-grant` each write an audit row (module `Patient Portal`, actions `activate` and `grant`) naming the caregiver's account, the patient's record, the relationship, and the staff member who verified identity and granted access — the same audit trail a patient's own `SELF` activation produces, so a caregiver-only account is exactly as traceable as any other.

### 5.3 Activation edge cases

| Case | Handling |
|---|---|
| No smartphone | Code printed/spoken at the counter; no OTP; patient may use a relative's device or a barangay device to activate, then sign out. Access is by PIN, not device. |
| Elderly patient assisted by a caregiver | The patient still activates their own `SELF` account. The caregiver's access is a **separate grant** issued in the same visit, tied to the caregiver's own login. Never activate one account "for both". |
| Shared family device | Session is not treated as trusted. "Sign out" is a top-level item in More, an inactivity timeout applies (§13.4), and the portal never renders the patient's name in the browser tab title. |
| Changed / lost SIM | The patient cannot OTP. Recovery is in-person at the RHU (§5.5). Staff update `patients.contactNumber` through the existing staff flow first. |
| Forgotten PIN | See §5.5. No security questions, ever. |
| Patient already has an account | `patient-activation-issue` refuses and tells staff an account already exists; the path is recovery, not a second activation. |
| Duplicate patient records | Activation binds to exactly the record staff opened. The portal shows one record. Merging is out of scope; see §15 and D-6. |
| Guardian for a minor | Staff choose `GUARDIAN` at step 3; the guardian's identity is checked against the patient record's relative fields at the counter, by a human. |
| Caregiver added later | Not an activation — a grant. See §10.2. |
| Caregiver revoked | See §10.3; takes effect on the next request because authorization is evaluated per query. |

### 5.4 Credentials

- **Identifier:** a MediSens ID issued at activation (opaque, e.g. `MS-4K7Q-2H9D`), never the patient record id, never a name, never a phone number.
- **Secret:** minimum 6-digit PIN, with 8+ characters allowed for those who want a password. Reject the 20 most common PINs, sequential runs, repeated digits, and any substring of the patient's birthdate.
- **Lockout:** 5 failed attempts → 15-minute lock; 10 → locked until staff reset. Enforced server-side in the login Edge Function, keyed on the account, not the IP.
- **A 6-digit PIN is acceptable only under a proven condition, not an assumed one.** It requires Phase 3 to demonstrate that **every** authentication attempt against a patient account is forced through the portal's own server-side login/lockout Edge Function, with no path that reaches Supabase Auth (`signInWithPassword`, magic link, OTP-only sign-in, etc.) directly from the browser using the patient's own credentials. Concretely, that means either (a) the patient's Supabase Auth password/secret is never the PIN itself — the portal derives or wraps it server-side so a client cannot present the PIN straight to GoTrue — or (b) GoTrue sign-in for `account_type = 'patient'` users is disabled at the project level and only the Edge Function's service-role path can mint a session. **If Phase 3 cannot prove one of these, the minimum credential becomes an 8-character password**, because GoTrue's own client-facing rate limiting is materially weaker than the lockout in this document and a 6-digit space is brute-forceable against it. This decision is finalized only when Phase 3's gate (below) is met — it is not assumed true from this planning document alone.

### 5.5 Recovery

Two paths, both strong:

1. **SMS OTP** to the number already on the patient record, if one exists and the patient still holds the SIM. OTP → set new PIN. Rate-limited, 5-minute expiry, single use.
2. **In-person reset** at the RHU: staff verify identity the same way they verify it for a consultation, then issue a fresh single-use reset code through the same Edge Function family. This is the only path for lost SIMs and for patients with no number on file.

Explicitly rejected: security questions, mother's maiden name, "last visit date", email-only reset (most patients have no email), and any self-service reset that relies solely on knowledge of demographic facts.

---

## 6. Guardian and caregiver model

### 6.1 Granting

Grants are created by RHU staff only, through `patient-access-grant` (Edge Function, service role, role-checked). Requirements encoded in the function:

- The **patient must be present and consenting** for `AUTHORIZED_CAREGIVER` (a checkbox the staff member ticks, recorded in the audit metadata; the RHU's paper consent remains the legal artifact).
- The caregiver must already hold a MediSens patient-portal account. Either they activate their own `SELF` account first (§5.2), or — when the caregiver is not themselves an RHU patient — staff issue an **account-only caregiver activation** with no `SELF` grant (§5.2.1).
- `GUARDIAN` requires the target patient to be under 18 at grant time.
- **Scope is assigned automatically by relationship, not chosen by staff:** `SELF` grants are always `scope = 'FULL'`; `GUARDIAN` and `AUTHORIZED_CAREGIVER` grants are always `scope = 'STANDARD'` in MVP (§7.3). There is no self-service or staff control to change a grant's scope — this keeps the model to one column and one function rather than a permission matrix (see D-5).
- The function refuses duplicate active grants and refuses grants on archived records.
- Every grant writes an audit row: who granted, to whom, over which record, with which relationship and scope.

### 6.2 Viewing and switching

- If an account holds exactly one grant, there is no switcher; the record context bar simply names the record.
- If it holds more than one, a **person switcher** sits in the header — a full-width button showing the current record, opening a bottom sheet listing each record with name, relationship, and a plain-language line ("Your own health record" / "Your mother's record — you assist with her care").
- Switching is explicit, never automatic, never remembered across sign-outs, and re-renders the whole shell so no previous person's data can remain on screen.
- The record context bar is **sticky and always visible** on every portal screen: `Viewing Maria Santos's health record` with the relationship beneath it. On a caregiver session it is tinted with the secondary surface token so it is visually distinct from a `SELF` session.

### 6.3 Revocation

- A `SELF` holder can revoke an `AUTHORIZED_CAREGIVER` grant on their own record, from More → "People who can access this health record", with a confirmation step in plain language.
- **A `SELF` holder cannot revoke a `GUARDIAN` grant on their own record, at any age.** A patient's guardian was established by RHU staff against verified relative/guardian details (§4.2); removing or changing that relationship is a real-world identity/custody question, not a self-service toggle, so it stays staff-mediated for every patient, adult or minor. The "People who can access this health record" screen shows a `GUARDIAN` card with no remove control (§9.5).
- Guardian access may still **end automatically** without any revocation action, via the `expires_at` boundary at the patient's 18th birthday (§4.3) — that is an expiry, not a revocation, and needs no one's action.
- Staff can revoke or end any grant, `GUARDIAN` included, at any time.
- The revocation RPC (`patient_portal_access_revoke`, §11.1) enforces this server-side: it checks the caller holds `SELF` on the grant's `patient_id` **and** that the target grant's `relationship = 'AUTHORIZED_CAREGIVER'`, and raises otherwise. This is a database-level rule, not a UI omission — a modified or scripted client cannot reach a `GUARDIAN` revocation through the patient-facing path.
- Revocation sets `revoked_at` and `revoked_by`; rows are never deleted, so the history stays auditable.
- Revocation takes effect on the very next request; the authorization function checks `revoked_at is null` on every call.

---

## 7. Patient-visible vs staff-only data policy

This section is normative. If a field is not listed as patient-visible, it is staff-only.

### 7.1 Patient-visible

| Source | Fields | Rendering |
|---|---|---|
| `patients` | `firstName`, `middleName`, `lastName`, `suffix`, `birthday`, `age`, `sex`, `civilStatus`, `address`, `contactNumber`, `bloodType`, `philhealthNo`, `philhealthStatus` | Profile screen, read-only or correction-request |
| `consultation` | `consultation_date`/`created_at`, `chief_complaints`, `diagnosis`, `plan`, `management_treatment`, `attending_provider` or `doctor_name` | Visit summary |
| `initial_consultation` | `consultation_date`, `chief_complaint`, `diagnosis` | Visit summary (when no doctor consultation exists for the visit) |
| `prescription` | `prescription_date`, `doctor_name`, parsed `rx_content` medications, claimed/not-claimed derived from `status` + `dispensed_at` | Medicines |
| `lab_request` | `request_date`, derived test names from the `is_*` flags | Lab Results (pending state only, see 7.2) |
| `lab_result` | `date_performed`, structured groups from `findings`, `performed_by`, RHU-approved reference range when one exists (§9.4, §11) | Lab Results — **only when `status = 'Completed'`**, sensitive groups filtered by scope (§7.3) |
| `follow_up` | `visit_date`, `chief_complaint`, `diagnosis`, linked visit, whether `follow_up_status = 'done'` | Follow-ups |
| `fhsis_logs` (vaccination) | per record: `vaccine_name`, `vaccine_category`, `dose_label`, `date_given`, `next_due_date`, `facility` | Vaccinations |

### 7.2 Visible only after completion/release

- **Laboratory results:** `lab_result` rows with `status = 'Completed'`. The `guard_lab_result_completion` trigger already guarantees a result cannot exist in any other state with findings, so this is a single, reliable gate. A `lab_request` with `status = 'Pending'` may be surfaced to the patient as *"Test requested — result not yet available"* with **no values at all**; this is genuinely useful and leaks nothing.
- **Prescriptions:** visible from `prescription_date`. Status maps to `Not yet claimed` / `Claimed on <date>` — patient-meaningful, and never the raw `Pending`/`Dispensed` strings.

### 7.3 Guardian/caregiver-visible (`STANDARD` scope, conservative default)

`GUARDIAN` and `AUTHORIZED_CAREGIVER` grants default to `scope = 'STANDARD'` — a **privacy-minimizing default**, not the same set `SELF` (`scope = 'FULL'`) receives:

- `STANDARD` includes everything in §7.1 **except** the specially-protected laboratory groups listed in §7.5 (currently `hivScreening`, `hbsagScreening`).
- `FULL` includes everything in §7.1 with no exclusions. Only `SELF` grants receive `FULL` in MVP.
- Excluded groups are simply **absent** from a `STANDARD` session's lab result — no placeholder, no "1 result withheld" notice, and no count that would disclose a sensitive test was even performed. This mirrors the token non-disclosure rule in §13 R4: a `STANDARD` session must not be able to infer that a sensitive test exists, let alone its result.
- There is no self-service or staff UI to upgrade a specific grant's scope in MVP (§6.1). One authorization function, `patient_portal_scope` (§12.1), is the single place scope is resolved — RPCs branch on its return value, and there is no second copy of this logic and no per-category permission matrix.

### 7.4 Staff-only — never returned to the portal

| Field | Reason |
|---|---|
| `consultation.assessment`, `remarks`, `hpi` | Clinician working notes; freeform; frequently contain internal shorthand |
| `consultation.family_history`, `past_med_surge_history`, `smoking_status`, `drinking_status`, `immunization_history` | Third-party and behavioural data recorded for clinical use; misreads badly without a clinician |
| `vital_sign.*` | Currently doctor-only by policy; do not widen in MVP (D-4) |
| `lab_result.findings.generalNotes` | Unstructured; may contain internal remarks or provisional interpretation (D-3) |
| `patient_consent.*`, including signatures | Legal artifact and biometric-adjacent image data |
| `patients.archive_*` | Internal record lifecycle |
| `patients.relativeName/Relation/Address/Contact` | Third-party personal data; shown to `SELF` only, never to a caregiver |
| `fhsis_logs` non-vaccination categories, `fhsis_reports*`, `lot_number`, `administered_by` | Statutory reporting and inventory internals |
| `profiles.*`, `audit_logs.*`, all `analytics_*` RPCs | Staff and system domain |
| Any raw id (`patients.id`, `consultation_id`, `labresult_id`, `prescription_id`, …) | See §13.2 — the portal addresses records by opaque token |
| Any raw status string, table name, column name, or role name | Developer terminology |

### 7.5 Restricted / specially protected

HIV and hepatitis B screening appear as the `hivScreening` / `hbsagScreening` groups inside `lab_result.findings`. Under the conservative default in §7.3:

- `SELF` (`scope = 'FULL'`) always sees these groups, released under the same completion gate as any other result (§7.2).
- `GUARDIAN` and `AUTHORIZED_CAREGIVER` (`scope = 'STANDARD'`) **never** see these groups in MVP, and never see evidence that they exist.
- This default is deliberately conservative, not the RHU's final policy answer (D-5). If the RHU later decides a specific relationship or case should see these results, that becomes a new `scope` value (e.g. a `FULL`-equivalent tier applied to specific grants), still resolved through the single `patient_portal_scope` function. **Do not build a per-category permission matrix now** — one column, one function, two values today, is the whole mechanism.

---

## 8. Information architecture

```
/pages/patient.html
├── (unauthenticated) Activate account · Sign in · Forgot PIN
└── (authenticated) Portal shell
    ├── Record context bar  [Viewing <Name>'s health record ▾]
    ├── Home
    ├── My Health ── Visits ── Visit detail
    │              ├─ Vaccinations
    │              └─ Follow-ups
    ├── Medicines ── Medicine detail
    ├── Lab Results ── Result detail
    └── More
        ├── My Profile ── Request a correction
        ├── People who can access this health record
        ├── Privacy & Security ── Change PIN · Recent access
        ├── Notifications
        ├── Text size & display
        ├── Help & Support
        └── Sign out
```

Bottom tab bar: **Home · My Health · Medicines · Lab Results · More** — five items, icon + always-visible label, ≥56px tall plus safe-area inset.

> **Documented exception to `docs/design/SKILL-UI.md` §5.2.** That section mandates the drawer and forbids replacing it with bottom navigation — for the **seven staff shells**. The Patient Account is a new, explicitly-scoped shell for a different audience. Bottom tabs are correct here (thumb reach, permanent visibility, no hidden navigation for low-literacy users). The staff drawer must not be touched. Phase 4 should add a one-line note to SKILL-UI §5.1/§5.2 recording this exception.

Navigation state uses the existing `useHashPage` pattern (`#home`, `#health`, `#medicines`, `#labs`, `#more`), so back/forward and refresh work without adding a router.

---

## 9. Screen-by-screen UX specification

Shared rules: one card per idea; a card is a `Card` from `src/components/ui/`; dates always render as `August 23, 2026` (never ISO, never relative-only); every empty state uses `EmptyState` with a plain sentence; first load uses `Skeleton`, refresh keeps content (SKILL-UI P8).

### 9.1 Home — "What needs my attention?"

Stacked, in priority order, showing only what exists:

1. **Greeting + record context.** "Good morning, Ana." / context bar.
2. **Next follow-up** — `You are advised to return on September 5, 2026` + reason + facility. Only when a `follow_up` has `visit_date >= today` and `follow_up_status <> 'done'`.
3. **New lab result** — up to 2 results released in the last 30 days. Tap → result detail.
4. **New medicine** — prescriptions from the last 30 days, "2 medicines from your August 23 visit".
5. **Recent vaccination** — records with `date_given` in the last 60 days, or a `next_due_date` coming up.
6. **Account notice** — e.g. "Maria Santos can now see this health record" after a grant change.
7. **Your last visit** — one-line summary, tap → visit detail.

No KPI strip, no charts, no counters, no analytics. If nothing is pending: a calm card — *"Nothing needs your attention right now."* plus a link to My Health.

### 9.2 My Health

Three segmented sections (`Visits` / `Vaccinations` / `Follow-ups`) as a 3-item tab row, full width, ≥44px, wrapping rather than scrolling horizontally.

**Visits** — reverse-chronological cards, each showing date, reason for visit, diagnosis, and small count chips ("2 medicines", "1 lab result"). Paginated 10 at a time with a "Show more visits" button (no infinite scroll — it defeats screen readers and slow connections).

**Visit detail** — the specified layout, and nothing beyond it:

```
August 23, 2026
Malvar Rural Health Unit · Dr. J. Reyes

Reason for visit
Fever and cough

Diagnosis
Upper respiratory tract infection

What your healthcare provider recommended
Rest, drink enough fluids, take your medicines as instructed,
and return if symptoms worsen.

Medicines prescribed          2   →
Laboratory                    CBC result available   →
Follow-up                     September 5, 2026
```

Field mapping (from §7.1): *Reason for visit* ← `consultation.chief_complaints` (fallback `initial_consultation.chief_complaint`); *Diagnosis* ← `consultation.diagnosis` (fallback `initial_consultation.diagnosis`); *What your healthcare provider recommended* ← `consultation.plan`, else `management_treatment`. Text is passed through `itemizeText`-style splitting for readability but is **never paraphrased or clinically reinterpreted** by MediSens. When `plan` and `management_treatment` are both empty, omit the section rather than inventing advice.

A visit is keyed on the doctor `consultation` when one exists, otherwise on the `initial_consultation`; the two must never render as two separate visits for the same day.

**Vaccinations** — cards: vaccine name, dose label, date given, facility, and "Next dose: <date>" when `next_due_date` is set. Grouped by `vaccine_category` with plain headings. Read-only. Reads through the portal RPC only — `fhsis_logs` writes, the FHSIS workspaces, and `vaccineService.ts` are untouched.

**Follow-ups** — upcoming first, then past. Every card carries the disambiguating line:

> *This is a recommended return date from your doctor. It is not a booked appointment — you may visit the RHU on or near this date.*

Shows `visit_date`, the related visit's reason, the facility, and instructions where present. Past follow-ups marked `done` show "Completed".

### 9.3 Medicines

Two groups: **Recent** (prescribed within the last 90 days, or not yet claimed) and **Previous** (everything else). The grouping uses only `prescription_date` recency and the claimed/not-claimed status derived from `status` + `dispensed_at` — **never** by parsing the free-text `duration` field to infer whether a course is "still active". `duration` values in the existing data include `7 days`, `1 week`, `until finished`, `PRN`, and `as directed`; none of these are reliably machine-interpretable into a current/expired state, and a wrong inference here is a medication-safety risk, not a cosmetic one. Each medicine is its own card — never a table:

```
Amoxicillin 500 mg

Take:        1 capsule
Frequency:   3 times a day
Duration:    7 days
             Take after meals

Prescribed by Dr. J. Reyes · August 23, 2026
Not yet claimed at the RHU pharmacy
```

`name`/`dosage` split into the title's drug + strength where the parsed `dosage` clearly contains a strength; otherwise render `dosage` as the *Take* line. `frequency` and `duration` are shown **exactly as recorded**, verbatim, with no reformatting or interpretation — the *Duration* line may read `7 days`, `1 week`, `Until finished`, `PRN`, or `As directed` depending on what the doctor wrote, and the portal must render whatever text is there rather than normalize or paraphrase it. If `parsePrescriptionContent` reports `malformed`, show *"This prescription could not be displayed. Please ask the RHU pharmacy for a printed copy."* — never a parser error string.

Official prescription viewing/downloading: **not in MVP.** The repository's prescription output today is a staff-side print path (`src/lib/utils/print.ts`), and re-hosting it patient-side needs a document-integrity decision that is out of scope. Medicines are shown as readable information only.

### 9.4 Lab Results

List of released results: test group name, result date, and a "View result" action. Above the list, if any `lab_request` is still `Pending`, a single quiet card: *"1 test requested on August 23, 2026 — your result is not yet available."*

**Result detail** — a stacked, patient-readable rendering of the whitelisted `findings` groups:

```
Complete Blood Count
Performed on August 23, 2026 at Malvar RHU

Hemoglobin        13.2 g/dL      Normal range 12.0–15.0
White blood cells  9.1 x10⁹/L    Normal range 4.5–11.0
```

Rules:
- Only the known group keys are rendered. Unknown keys are dropped silently — never dumped as raw JSON.
- **Reference ranges are shown only when the specific test/method has an RHU-laboratory-approved, patient-facing range recorded in `patient_portal_reference_ranges` (§11).** The presentation constants already used by `LabResultDetailModal` are clinician-facing defaults built for staff, not pre-validated for patient release, and must **not** be reused directly as a source of patient-facing ranges. Where no approved range exists for that test/method, show the recorded value with **no range** — never fall back to the staff constant, never guess, never interpolate from a similar test.
- **Never label a value `High`, `Low`, `Abnormal`, `Normal`, or any equivalent.** MediSens does not have the clinical governance for automated interpretation, approved range or not; the portal states the recorded number (and, when approved, the range) and nothing more.
- **No interpretation, no colour-coded "abnormal" verdicts, no arrows.** Every result page ends with: *"Your healthcare provider will explain what this result means during your visit."*
- Download: reuse the existing read-only formatted view rendered to PDF with the already-bundled `jspdf`/`html2canvas`, or defer entirely to Phase 8. It must not become a second, divergent lab renderer.
- `generalNotes` is excluded pending D-3.

### 9.5 More / Profile / Privacy / Accessibility

**More** — a single-column list of ≥56px rows, each with an icon, a label, and a chevron. Sign out is last, separated, and styled with the `danger` text treatment (not a red fill — it isn't destructive, just distinct).

**My Profile** — three explicitly labelled zones:

| Zone | Contents | Control |
|---|---|---|
| You can change these | PIN, notification preference, text-size preference, preferred language | Edit in place |
| Ask the RHU to correct these | Name, birthdate, sex, civil status, address, contact number, PhilHealth number | "Request a correction" → short form → staff queue |
| Recorded by the RHU | Blood type, patient category, everything clinical | Read-only, with the line *"This information is kept by the Rural Health Unit."* |

Correction requests write to `patient_correction_requests` (patient-authored text only — no direct writes to `patients`), appear in a staff queue, and are resolved by staff using the existing patient-edit flow. The patient sees `Submitted` → `Resolved` and nothing else.

**People who can access this health record** — one card per grant: person's name, relationship in plain words, what they can do ("Can view this health record"), the date access was granted, and a "Remove access" button — shown **only on `AUTHORIZED_CAREGIVER` cards**. A `GUARDIAN` card carries the same information with no remove control and the line *"Guardian access is set up and changed by the Rural Health Unit. Ask at the RHU counter to update this."* Above the list: *"Only the Rural Health Unit can add someone here. Ask at the RHU counter."*

**Privacy & Security** — Change PIN; "Recent access to this record" (a plain-language, paginated feed derived from `audit_logs` portal entries: *"You viewed your lab results — August 24, 2026, 9:14 AM"*, *"Maria Santos viewed your medicines — August 22, 2026"*; **staff access is not listed** — that is an internal audit trail, D-7); Sign out of this device; and a short plain-language privacy summary linking to the existing `pages/privacy-policy.html`.

**Notifications** — SMS follow-up reminders on/off (a preference honoured by the existing `send-followup-reminders` function), and which of the account's records those reminders cover. No new channels.

**Text size & display** — "Comfortable" (default) and "Larger text". Never labelled "Senior Mode". Implemented as a `data-text-size` attribute on the portal root scaling only the portal's own type tokens; persisted per account. Optionally a "Higher contrast" toggle that raises border and muted-text tokens to ≥4.5:1. Nothing here changes staff styling.

**Help & Support** — RHU address, opening hours, phone number, and three or four plain how-do-I answers. Static content, no ticketing.

---

## 10. Mobile / tablet / desktop behaviour

| Range | Behaviour |
|---|---|
| <360px | Single column, 16px gutters, tab labels may drop to 11px but never disappear |
| 360–767px | **Primary target.** Bottom tabs, sticky context bar, single column, full-width primary buttons |
| 768–1023px | Same IA. Two-column card grid on Home/Visits/Medicines where cards stay ≥320px. Bottom tabs remain — do not switch to a drawer |
| ≥1024px | Content column capped at ~720px, centred, with the five sections as a horizontal top tab row instead of bottom tabs. Same components, same data, no extra features |

Non-negotiables: no horizontal page scroll at any width or at 200% zoom; no data tables anywhere in the portal (stacked label/value pairs only); no fixed heights on content regions; sticky chrome (context bar + tabs) capped at ~25% of viewport height.

---

## 11. Proposed database / domain architecture

New tables only. **No existing table gains a column, a policy change, or a trigger change**, with the single exception of `handle_new_user()` in Phase 1.

```sql
-- Names are proposals; keep the public schema and snake_case convention.

public.patient_accounts
  id                  uuid primary key default gen_random_uuid()
  auth_user_id        uuid not null unique references auth.users(id) on delete cascade
  medisens_id         text not null unique          -- MS-XXXX-XXXX, shown to the user
  display_name        text not null                 -- who is logging in
  status              text not null default 'active'  -- active | locked | disabled
  pin_updated_at      timestamptz
  failed_attempts     int not null default 0
  locked_until        timestamptz
  identity_verified_by  uuid references public.profiles(id)   -- staff who verified this login's identity
  identity_verified_at  timestamptz
  identity_note         text                        -- short staff note, e.g. "Verified via ID at RHU counter"
  created_at          timestamptz not null default now()
  created_by          uuid references public.profiles(id)   -- activating staff
  -- No patient_id column here, by design (§4.1). This row identifies a LOGIN,
  -- which may or may not itself be an RHU patient (see §5.2.1 for the
  -- account-only caregiver case, where identity_verified_* is populated and
  -- the account never gains a SELF grant).

public.patient_access_grants
  id                uuid primary key default gen_random_uuid()
  account_id        uuid not null references public.patient_accounts(id) on delete cascade
  patient_id        bigint not null references public.patients(id)   -- bigint, matches patients.id
  relationship      text not null check (relationship in ('SELF','GUARDIAN','AUTHORIZED_CAREGIVER'))
  scope             text not null check (scope in ('FULL','STANDARD'))
                     -- assigned by the granting Edge Function, not a DB default:
                     -- SELF -> 'FULL'; GUARDIAN / AUTHORIZED_CAREGIVER -> 'STANDARD' (§7.3, D-5)
  granted_at        timestamptz not null default now()
  granted_by        uuid not null references public.profiles(id)
  expires_at        timestamptz                    -- guardians: the patient's 18th birthday
  revoked_at        timestamptz
  revoked_by        uuid
  unique (account_id, patient_id, relationship) where revoked_at is null
  -- at most one active SELF grant per patient_id

public.patient_activation_codes
  id                uuid primary key default gen_random_uuid()
  patient_id        bigint not null references public.patients(id)
  relationship      text not null
  target_account_id uuid references public.patient_accounts(id)   -- set for recovery/caregiver codes
  code_hash         text not null                  -- sha-256 of code + per-row salt
  purpose           text not null check (purpose in ('ACTIVATION','RECOVERY'))
  expires_at        timestamptz not null
  consumed_at       timestamptz
  attempts          int not null default 0
  issued_by         uuid not null references public.profiles(id)
  created_at        timestamptz not null default now()

public.patient_otp_challenges
  id, account_or_code_ref, code_hash, expires_at (5 min), attempts, consumed_at

public.patient_account_preferences
  account_id        uuid primary key references public.patient_accounts(id) on delete cascade
  text_size         text not null default 'comfortable'
  high_contrast     boolean not null default false
  language          text not null default 'en'
  sms_reminders     boolean not null default true

public.patient_correction_requests
  id                uuid primary key default gen_random_uuid()
  account_id        uuid not null references public.patient_accounts(id)
  patient_id        bigint not null references public.patients(id)
  field_group       text not null                  -- 'name' | 'birthdate' | 'address' | 'contact' | 'philhealth' | 'other'
  requested_value   text not null
  patient_note      text
  status            text not null default 'submitted'  -- submitted | resolved | declined
  submitted_at      timestamptz not null default now()
  resolved_at       timestamptz
  resolved_by       uuid references public.profiles(id)

public.patient_portal_reference_ranges
  id                uuid primary key default gen_random_uuid()
  group_key         text not null              -- e.g. 'bloodChemistry' (matches a findings group)
  test_key          text not null              -- e.g. 'hemoglobin' (matches a key within that group)
  method_label      text                       -- optional analyzer/method qualifier, nullable
  unit              text not null
  range_low         numeric
  range_high        numeric
  range_text        text                       -- for non-numeric ranges, e.g. "Non-reactive"
  approved_by       uuid not null references public.profiles(id)   -- RHU laboratory sign-off
  approved_at       timestamptz not null default now()
  active            boolean not null default true
  unique (group_key, test_key, method_label)
  -- Staff-curated only (§9.4, D-11). No client write path. Read by the lab
  -- result RPC as a lookup; a missing or inactive row means "no range shown",
  -- never a fallback to the staff-side LabResultDetailModal constants.
```

Notes:
- `patient_id` is **bigint** because `patients.id` is bigint (confirmed in `src/features/audit/services.ts`). Do not model it as uuid or text.
- No `patients.user_id` column. No changes to `patients` at all.
- No notifications table in MVP — Home derives its attention items from the data it already reads.
- `patient_portal_reference_ranges` is a lookup table maintained by the RHU laboratory (D-11), not a patient- or portal-authored table.

### 11.1 Read API — SECURITY DEFINER RPCs, not table RLS

**Recommendation (opinionated).** Do **not** add patient-facing policies to `consultation`, `lab_result`, `prescription`, `follow_up`, `fhsis_logs`, or `patients`. RLS is row-level; those rows contain staff-only *columns* (§7.4), so a row-level grant would leak `assessment`, `remarks`, `family_history`, `lot_number`, archive fields, and consent signatures the moment anyone writes `select *`.

Instead, follow the pattern the repository already uses for analytics: a thin set of `SECURITY DEFINER` functions with `set search_path = public, pg_catalog`, `revoke execute from public, anon`, `grant execute to authenticated`, each of which:

1. resolves the caller's account via `auth.uid()`,
2. calls `patient_portal_can_access(p_patient_id)` and raises if false,
3. selects **only whitelisted columns**,
4. applies the release gates (`lab_result.status = 'Completed'`, etc.),
5. writes an audit row for the read,
6. returns patient-safe rows with **opaque record tokens instead of raw ids**.

Proposed surface (final names during Phase 2):

```
patient_portal_my_records()                    -- grants for the current account
patient_portal_home(p_patient_id)              -- attention items
patient_portal_visits(p_patient_id, limit, offset)
patient_portal_visit_detail(p_patient_id, p_visit_token)
patient_portal_medicines(p_patient_id)
patient_portal_lab_results(p_patient_id)
patient_portal_lab_result_detail(p_patient_id, p_result_token)
patient_portal_vaccinations(p_patient_id)
patient_portal_follow_ups(p_patient_id)
patient_portal_profile(p_patient_id)
patient_portal_access_list(p_patient_id)
patient_portal_access_revoke(p_grant_id)       -- the one patient-initiated write;
                                                -- refuses unless caller holds SELF on the
                                                -- grant's patient_id AND the grant's
                                                -- relationship = 'AUTHORIZED_CAREGIVER' (§6.3)
patient_portal_submit_correction(p_patient_id, p_field_group, p_value, p_note)
patient_portal_recent_access(p_patient_id, limit, offset)
patient_portal_set_preferences(...)
```

The base tables keep their current deny-by-default posture toward non-staff. A patient auth user with no `profiles` row satisfies **none** of the existing policies, so even a raw PostgREST call to `/rest/v1/consultation` returns zero rows. That is the property to preserve.

---

## 12. RLS and authorization design

### 12.1 The authorization function

```sql
create or replace function public.patient_portal_can_access(p_patient_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.patient_access_grants g
    join public.patient_accounts a on a.id = g.account_id
    where a.auth_user_id = (select auth.uid())
      and a.status = 'active'
      and g.patient_id = p_patient_id
      and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
  );
$$;
```

Every portal RPC begins with this check. Every new table's RLS policies are written against the same predicate. There is exactly **one** place where "may this login see this patient?" is answered.

A second, equally narrow function answers "how much may this login see?":

```sql
create or replace function public.patient_portal_scope(p_patient_id bigint)
returns text
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select g.scope
  from public.patient_access_grants g
  join public.patient_accounts a on a.id = g.account_id
  where a.auth_user_id = (select auth.uid())
    and a.status = 'active'
    and g.patient_id = p_patient_id
    and g.revoked_at is null
    and (g.expires_at is null or g.expires_at > now())
  limit 1;
$$;
```

Any RPC that reads a specially-protected category (currently only the `hivScreening`/`hbsagScreening` lab groups, §7.5) calls `patient_portal_scope` after `patient_portal_can_access` and includes those groups only when the result is `'FULL'`. This is the only place scope-based filtering happens — no duplicate per-screen permission checks.

### 12.2 RLS on the new tables

- RLS enabled on all seven new tables.
- `patient_accounts`: `SELECT` where `auth_user_id = auth.uid()`; staff `SELECT` for admin/nurse/BHW/midwives support screens; **no client `INSERT`/`UPDATE`/`DELETE` at all** — service-role Edge Functions only.
- `patient_access_grants`: `SELECT` where the row belongs to the caller's account **or** the caller holds a `SELF` grant on that `patient_id` (so a patient can see who else has access) **or** the caller is staff. No client writes; revocation goes through the RPC, which additionally restricts self-service revocation to `relationship = 'AUTHORIZED_CAREGIVER'` (§6.3) — a `GUARDIAN` row is never client-writable, by any caller other than staff.
- `patient_activation_codes`, `patient_otp_challenges`: **no policies for `authenticated` whatsoever.** Service role only.
- `patient_account_preferences`: `SELECT`/`UPDATE` own row only.
- `patient_correction_requests`: patient `SELECT`/`INSERT` own; staff `SELECT`/`UPDATE`.
- `patient_portal_reference_ranges`: **no policies for `authenticated` whatsoever** — read only through the lab-result RPC (`security definer` bypasses RLS); staff maintenance is a reviewed migration/seed script (D-11), not a client write path in MVP.
- `revoke all on ... from public, anon` for every new table.

### 12.3 Staff-side guarantees (regression surface)

- Existing policies must be byte-identical after every phase. Phase gates include a policy diff.
- `handle_new_user()` changes in Phase 1 must still create the `nurse`-defaulted `profiles` row for **staff-created** users (the `create-user` Edge Function's service-role upsert then sets the real role). Only users carrying `app_metadata.account_type = 'patient'` skip it. `app_metadata` is not user-writable, which is why it is the right discriminator — never `user_metadata`.
- Staff `isRole()` / `requireRole()` behaviour is unchanged. A patient account has no `profiles` row, so `getAuthProfile()` signs it out of any staff page automatically — a useful accidental safeguard, but not the security boundary.

---

## 13. Security and privacy risks and safeguards

| # | Risk | Safeguard |
|---|---|---|
| R1 | **New auth users default to role `nurse`** → full clinical read | Phase 1 blocks `profiles` creation for patient accounts; verify public sign-up is disabled in Supabase Auth settings (D-1) |
| R2 | IDOR via a manipulated `patient_id` in an RPC argument | `patient_portal_can_access` on every call; never trust a client-supplied id; audit denials |
| R3 | Column leakage through row-level grants | No patient RLS on clinical tables; RPC column whitelists (§11.1) |
| R4 | Enumeration of record ids | Opaque per-record tokens (HMAC over `(type, id, patient_id)` with a server-side secret, or a stored random token column) — raw ids never reach the client |
| R5 | Caregiver privilege escalation | Grants are creatable only by service-role Edge Functions with a staff-role JWT check; no client write path exists |
| R6 | Caregiver impersonating the patient | Session identity (`display_name`) always rendered beside the record context; caregiver sessions visually distinct; the patient sees the caregiver's reads in "Recent access" |
| R7 | Revoked caregiver retains access | Authorization is evaluated per request; no cached grant list on the server; the client refetches grants on every shell mount |
| R8 | Shared device / walk-away | 15-minute inactivity sign-out, sign-out in More, no patient name in the document title, no autofill of the MediSens ID, `sessionStorage`-scoped session if D-8 resolves that way |
| R9 | Lost phone | PIN required on every cold start; staff can set `patient_accounts.status = 'disabled'`; revoking the account kills every grant |
| R10 | Brute-forced PIN | Server-side lockout (§5.4); D-2 determines where it is enforced |
| R11 | Activation code interception | Short expiry, single use, hashed at rest, attempt counter, plaintext returned exactly once, second factor by OTP when a number is on file |
| R12 | SMS to a stale number | Staff confirm `contactNumber` at the counter before issuing; number changes go through staff, not the portal |
| R13 | Duplicate records → partial view | Activation binds to one record; staff-side duplicate resolution is a prerequisite, not a portal feature (D-6) |
| R14 | Sensitive results reaching a guardian or caregiver | `GUARDIAN`/`AUTHORIZED_CAREGIVER` grants default to `scope = 'STANDARD'`, which silently excludes `hivScreening`/`hbsagScreening` (§7.3, §7.5); only `SELF` (`FULL`) sees them; resolved by the single `patient_portal_scope` function (§12.1), never a per-screen check (D-5) |
| R15 | Frontend-only checks | Every guard in this design lives in a SQL function or an Edge Function. The React shell hides things for usability, never for security |
| R16 | Audit gaps | Reads are audited **inside** the RPC, so an audit row cannot be skipped by a hand-crafted client call |
| R17 | Offline cache exfiltration | No clinical data cached offline in MVP (§16.4) |

Audit logging additions (Phase 2/3, in `supabase/functions/create-audit-log/index.ts` **and** in the RPCs that write directly): module `Patient Portal`; actions `view`, `activate`, `grant`, `revoke`, `recover`; record types `patient_account`, `patient_access_grant`, `patient_correction_request`; metadata keys `account_id`, `grant_id`, `relationship`. The existing allow-lists reject anything not added — a silent-failure trap worth remembering.

---

## 14. Accessibility requirements

Core, not optional. Every phase gate includes these.

- ≥44×44px touch targets; ≥48px form controls; bottom tabs ≥56px + `env(safe-area-inset-bottom)`.
- Portal body text ≥16px (larger than the staff `--type-body-size` of 0.875rem) via portal-scoped token overrides — **do not change `tokens.css` global values**.
- Contrast ≥4.5:1 for text, ≥3:1 for borders and icons, in both display modes.
- No icon-only actions anywhere in the portal. Every icon has a text label beside it.
- Visible focus ring on every interactive element, using the existing `--focus-color` / `--focus-ring` tokens.
- Semantic landmarks (`header`/`nav`/`main`), one `h1` per screen, ordered headings, `aria-current="page"` on the active tab, live regions for toasts, and the existing `SkipToContent` component.
- Dialogs and bottom sheets reuse `src/components/ui/useDialogFocus.ts` — focus trap, Escape to close, focus restored to the trigger.
- Content reflows at 200% zoom with no loss of information and no horizontal scroll.
- Respect `prefers-reduced-motion` (the `Button` spinner already does).
- Labels in plain language; no clinical abbreviations without expansion; a Filipino translation layer is structured for (`language` preference, all strings centralised) but English-only ships in MVP unless D-9 says otherwise.

---

## 15. Edge cases

| Case | Behaviour |
|---|---|
| Patient record archived after activation | RPCs return "This health record is not available. Please visit the RHU." Grants are not auto-revoked. |
| Consultation exists with no diagnosis recorded | Omit the Diagnosis block; never render "—" or "null". |
| `rx_content` malformed | Friendly message (§9.3); the malformed flag is logged server-side, not shown. |
| `findings` is plain text, not JSON | `LabResultDetailModal` falls back to `generalNotes`. Since generalNotes is excluded (D-3), such a result shows as *"Result available — please ask the RHU for a copy."* Do not dump the text. |
| Vaccination log with legacy `bcg_date` only | `normalizeVaccineRecords` already synthesises a BCG record; reuse that logic server-side or mirror it exactly. |
| Follow-up date in the past, not `done` | Show under "Past" with *"This return date has passed. Please visit the RHU."* Never nag repeatedly on Home. |
| Duplicate patient records | Portal shows the linked record only. Home carries no hint that another record exists. Staff resolve duplicates outside the portal. |
| Guardian's child turns 18 | Grant expires automatically via `expires_at`; the guardian sees "Access to this record has ended." The youth's `SELF` access is untouched. |
| Patient (any age) attempts to remove their guardian's access | The UI never offers a remove control on a `GUARDIAN` card (§9.5); the revocation RPC additionally refuses server-side on `relationship = 'GUARDIAN'` even if bypassed via a modified client. |
| Account holds zero grants (caregiver-only account whose grant was revoked) | Sign-in succeeds, then an empty state: *"You do not currently have access to any health record."* No error, no crash. |
| Patient and caregiver both online | No locking needed; everything is read-only. |
| Patient has no records at all yet | Every section shows a calm empty state; Home shows the "nothing needs attention" card. |
| Staff member also a patient | They use a separate patient account with a separate login. Never bridge `profiles` and `patient_accounts` on the same auth user. |
| Session expired mid-navigation | Redirect to the portal sign-in with *"Please sign in again."* — never a raw Supabase error. |

---

## 16. Strict MVP scope

### 16.1 Ships

Activation (including account-only caregiver activation, §5.2.1), login, recovery, `SELF`/`GUARDIAN`/`AUTHORIZED_CAREGIVER` grants with the `FULL`/`STANDARD` scope default (§7.3), person switcher, Home, Visits + Visit detail, Vaccinations, Follow-ups, Medicines (Recent/Previous grouping, §9.3), Lab Results (released only, RHU-approved reference ranges only, §9.4), Profile + correction requests, access list + revocation (`AUTHORIZED_CAREGIVER` only, §6.3), Change PIN, Recent access, Notification preference, Text size & display, Help, Sign out, audit logging, isolated patient-portal session storage (§4.5).

### 16.2 Does not ship

Everything in §1.3, plus: patient-initiated sharing, granular per-category visibility UI, in-app notification inbox, PDF prescription download (deferred inside Phase 8 only if the download decision lands there), Filipino translation, biometric login, "trusted device" remembering, and any patient write to clinical data.

### 16.3 Not a "future enhancement" section

Anything not listed in 16.1 is simply absent from this design. Do not add speculative hooks, unused columns, or dead code paths for it. `patient_access_grants.scope` is the single deliberate extension point, and it exists because §4.3 and D-5 require it.

### 16.4 Offline

MediSens has no service worker today. The portal ships without one. The app shell may be cached by ordinary HTTP caching; **no clinical response is cached, stored in IndexedDB, or persisted beyond the session.** Introducing offline clinical data would require a privacy assessment covering shared devices and lost phones, which is out of scope.

---

## 17. Implementation phases

Nine phases. Each is independently reviewable, and each ends at a gate that a later session can verify without re-reading this whole document. **Do not start a phase whose prerequisites are unmet. Do not merge two phases.**

---

### Phase 1 — Auth isolation (security prerequisite)

**Objective.** Make it impossible for a non-staff auth user to obtain a staff `profiles` row, before any patient user exists.

**Scope.** `public.handle_new_user()` only.

**Files/tables.** New migration `supabase/migrations/<ts>_isolate_patient_auth_users.sql`; touches `auth.users` trigger function and `public.profiles` behaviour.

**Prerequisites.** D-1 answered (public sign-up disabled). Codex-assigned per `docs/CLAUDE.md` (backend security).

**Tasks.**
1. New corrective migration (never edit an applied one) redefining `handle_new_user()` to `return new` without inserting into `profiles` when `new.raw_app_meta_data->>'account_type' = 'patient'`.
2. Keep the existing staff path byte-identical otherwise.
3. Add a `do $$ ... $$` assertion that the trigger still exists and that `profiles` still has its current policies.

**Security.** `app_metadata` only — never `user_metadata`, which users can set. Re-confirm sign-up is disabled in the Supabase Auth dashboard.

**Do not change.** `profiles` policies, the `create-user` Edge Function, `ROLE_DASHBOARD`, `Role`, any clinical policy.

**Tests.** Insert an auth user with `account_type='patient'` (service role, staging) → no `profiles` row, and PostgREST reads of `consultation`/`patients` as that user return zero rows. Insert a staff user via `create-user` → unchanged behaviour. Existing staff logins for all seven roles still land on the right dashboard.

**Gate.** Both cases verified in staging; `pg_policies` diff for all clinical tables is empty.

---

### Phase 2 — Access model schema and authorization core

**Objective.** Land the seven new tables, `patient_portal_can_access`, `patient_portal_scope`, and their RLS — with no application consuming them yet.

**Scope.** New tables, indexes, constraints, RLS policies, the two authorization functions, grants/revokes.

**Files/tables.** New migration(s) under `supabase/migrations/`; the tables in §11 (including `patient_portal_reference_ranges`); the functions in §12.1.

**Prerequisites.** Phase 1 gate passed. `patients.id` type re-confirmed as bigint against the live schema before writing the FK. D-11 answered (who curates reference ranges) before the reference-ranges table is seeded — the table itself can still be created empty.

**Tasks.**
1. Create tables per §11 with the partial unique indexes (one active grant per account/patient/relationship; one active `SELF` per patient), the `scope` check constraint accepting exactly `('FULL','STANDARD')`, and the `patient_accounts` identity-verification columns (`identity_verified_by/at/note`) used by account-only caregiver activation (§5.2.1).
2. Enable RLS and create exactly the policies in §12.2. `revoke all ... from public, anon`.
3. Create `patient_portal_can_access` and `patient_portal_scope` — both `security definer`, `stable`, fixed `search_path`, execute granted to `authenticated` only.
4. Index `patient_access_grants (account_id) where revoked_at is null` and `(patient_id) where revoked_at is null`.
5. Create `patient_portal_reference_ranges` with no `authenticated` policies at all (§12.2).
6. Assertion block verifying RLS is on and no `anon`/`authenticated` grants exist where forbidden.

**Security.** Activation/OTP/reference-range tables must have **zero** `authenticated` policies. Verify by querying `pg_policies` in the migration's own assertion block. The `scope` check constraint must reject any value outside `('FULL','STANDARD')` — confirm no wider or looser constraint slips in.

**Do not change.** Any existing table, policy, trigger, or function.

**Tests.** As a fabricated patient JWT: reading `patient_activation_codes` returns zero rows; reading own `patient_accounts` works; reading another account's row returns zero; reading `patient_portal_reference_ranges` directly returns zero rows. `patient_portal_can_access` returns true/false correctly for active, revoked, and expired grants. `patient_portal_scope` returns `'FULL'` for a `SELF` grant and `'STANDARD'` for `GUARDIAN`/`AUTHORIZED_CAREGIVER` grants, and `null` for no grant.

**Gate.** All policy and function assertions pass; a written truth table for `patient_portal_can_access` and `patient_portal_scope` matches observed results for every relationship and lifecycle state.

---

### Phase 3 — Activation, login, and recovery Edge Functions

**Objective.** A patient can be activated by staff and can sign in — with no portal UI yet (verified by curl/tests) — and the 6-digit PIN decision (D-2) is proven, not assumed.

**Scope.** `patient-activation-issue`, `patient-activation-verify`, `patient-activation-complete`, `patient-caregiver-activation-issue`, `patient-account-recover`, `patient-access-grant`, `patient-login` (the server-side login/lockout path D-2 depends on); the token-secret configuration; audit allow-list additions.

**Files.** `supabase/functions/patient-*/index.ts` (new), `supabase/functions/create-audit-log/index.ts` (allow-list additions only), possibly a shared helper module. Reuse the iProg SMS pattern from `send-followup-reminders/index.ts`.

**Prerequisites.** Phase 2. D-1 answered. iProg quota confirmed for OTP volume (D-10).

**Tasks.**
1. Issue: role-check the JWT (`BHW`/`nurse`/`midwives`/`admin`), refuse archived records and existing active grants, generate + hash + store the code, SMS it when a number exists, return plaintext once.
2. Verify: constant-time hash compare, expiry, single use, attempt counter, OTP branch.
3. Complete: service-role user creation with `app_metadata.account_type='patient'`, `patient_accounts` + `patient_access_grants` (`scope = 'FULL'` for `SELF`, `'STANDARD'` for `GUARDIAN`) + preferences insert, code burn, audit.
4. Caregiver activation (§5.2.1): `patient-caregiver-activation-issue` creates a `patient_accounts` row with no `patient_id` anywhere and populates `identity_verified_by/at/note` from the staff caller; no `SELF` grant is created; the subsequent `AUTHORIZED_CAREGIVER` grant (task 5) is `scope = 'STANDARD'`.
5. Grant: staff-issued caregiver/guardian grants with the checks in §6.1, assigning scope automatically by relationship (`SELF` never created here; `GUARDIAN`/`AUTHORIZED_CAREGIVER` → `'STANDARD'`).
6. Recover: OTP path and staff-issued reset-code path; lockout counters; PIN policy validation server-side.
7. `patient-login`: the **single** server-side entry point for patient authentication — resolves the MediSens ID, checks `patient_accounts.status`/`locked_until`, verifies the PIN/password against a value it controls (not a value handed straight to GoTrue), increments/reset `failed_attempts`, and only then mints a Supabase session (e.g. by minting a session for the linked `auth.users` row via the admin API, or another mechanism that keeps GoTrue itself unreachable with the raw PIN). This function is what D-2's proof depends on.
8. Extend the audit allow-lists (§13) — **additive only**.

**Security.** Every function validates the caller JWT and its role; secrets in Supabase env, never in source; rate limit per code and per account; never return whether a MediSens ID exists; log failures without logging codes or PINs. **D-2 gate:** confirm, and document in the PR description, that no code path allows a client to call `supabase.auth.signInWithPassword` (or any other direct GoTrue sign-in) using a patient's PIN as the password — either the PIN is never the GoTrue password at all, or GoTrue password sign-in is disabled for `account_type = 'patient'` users at the project level. If neither can be shown, the credential minimum becomes an 8-character password before Phase 4 begins (§5.4).

**Do not change.** `create-user`, `delete-user`, `update-user-role`, `archive-patient-record`, or the reminder function's behaviour.

**Tests.** Activation happy path; expired code; reused code; wrong code ×6 → lockout; archived patient refused; non-staff caller refused; duplicate activation refused; recovery both paths; grant creation and refusal cases; account-only caregiver activation produces a `patient_accounts` row with `identity_verified_by` set, no `patient_id`, and no `SELF` grant. **D-2 negative test:** attempt `supabase.auth.signInWithPassword({ email: <patient's synthetic identity>, password: <the patient's actual PIN> })` directly from a test client against staging — this must fail (wrong password / disabled sign-in), proving the PIN cannot reach GoTrue outside `patient-login`'s lockout. All against staging.

**Gate.** A patient auth user exists in staging with exactly one `SELF` grant, holds **no** `profiles` row, and can obtain a session only via `patient-login`; every negative test refuses; the D-2 negative test above passes, and the PR notes which of the two D-2 guarantees (PIN never equals the GoTrue password, or GoTrue sign-in disabled for patient accounts) was used. If the D-2 negative test cannot be made to pass, the gate is not met until the credential minimum is raised to an 8-character password and re-tested.

---

### Phase 4 — Portal shell, navigation, and design foundation

**Objective.** The signed-in shell renders: context bar, bottom tabs, five empty sections, sign-out, inactivity timeout. No clinical data.

**Scope.** New page entry, portal shell components, portal-scoped token layer, session guard.

**Files.** `pages/patient.html` (new); `vite.config.ts` (add the input — one line); `src/app/patient/index.tsx` (new); `src/lib/supabase/patientClient.ts` (new, isolated Supabase client — §4.5); `src/components/patient-portal/` (new: `PortalShell`, `RecordContextBar`, `PersonSwitcher`, `BottomTabs`, `PortalSection`); `src/lib/auth/patientPortal.ts` (new session/grant guard, uses `patientClient.ts` exclusively); `src/styles/patient-portal.css` (new, portal-scoped token overrides only). Reuse `src/components/ui/*` and `src/components/shared/Icon`.

**Prerequisites.** Phase 3. D-8 answered (session persistence). Read `docs/design/SKILL-UI.md` and `docs/design/UI-CLINICAL-PATTERNS.md` first, and look at `docs/design/medisens-ui-reference.png`.

**Tasks.**
1. `pages/patient.html` mirroring the existing page scaffold (tokens.css, Tailwind CDN, `#root`, `viewport-fit=cover`).
2. `src/lib/supabase/patientClient.ts`: a second `createClient` call with `auth.storageKey = 'medisens-patient-auth'` and persistence per D-8 (§4.5). `src/lib/supabase/client.ts` (staff) is not modified.
3. Session guard (`patientPortal.ts`), built on `patientClient.ts` only: `getSession()` → `patient_portal_my_records()`; no grants → the empty state in §15; sign-out here clears only the `medisens-patient-auth` key and never calls the staff client's `signOut()`.
4. Shell with sticky context bar, `useHashPage`-driven sections, bottom tabs with labels, ≥1024px top-tab variant.
5. Person switcher bottom sheet using `useDialogFocus`.
6. Portal token layer: `[data-portal] { --type-body-size: 1rem; ... }` plus `[data-text-size="large"]` overrides. **`src/styles/tokens.css` is not edited.**
7. 15-minute inactivity sign-out; sign-out in More.
8. Add the SKILL-UI §5.2 exception note (§8).

**Security.** The guard is UX, not authorization — no clinical data is fetched here at all. Session isolation (§4.5) is a usability/cross-contamination safeguard, not the authorization boundary — do not treat it as one.

**Do not change.** Staff pages, `Sidebar`, `Topbar`, `dashboard.css`, `tokens.css` global values, `ROLE_DASHBOARD`, `src/lib/supabase/client.ts`.

**Tests.** Manual at 360/390/768/1024/1440 and 200% zoom: no horizontal scroll, tabs reachable, focus visible, Escape closes the sheet and restores focus. Screen-reader pass over the shell. All seven staff shells re-checked for visual regression (shared components were reused, not modified). **Session-isolation test:** open a staff dashboard in tab A and sign in; open the portal in tab B and sign in as a patient; confirm both sessions remain valid and independent — refreshing tab A does not sign out the patient in tab B and vice versa; signing out of the portal does not sign out the staff session, and signing out of staff does not sign out the portal.

**Gate.** Shell renders for a Phase-3 test account; staff shells unchanged; accessibility checklist (§14) passes on the shell; the session-isolation test above passes with both sessions concurrently valid.

---

### Phase 5 — Read API RPCs

**Objective.** Every patient-visible read exists as an audited, column-whitelisted RPC.

**Scope.** The RPCs in §11.1, plus the record-token scheme.

**Files/tables.** New migration(s). Reads from `patients`, `consultation`, `initial_consultation`, `prescription`, `lab_request`, `lab_result`, `follow_up`, `fhsis_logs`, `audit_logs`, and the Phase-2 tables. **Read-only against all of them.**

**Prerequisites.** Phases 2–3. §7 re-read line by line. Confirm the live column list against `src/features/patients/history.ts` before writing selects.

**Tasks.**
1. Record tokens (R4): HMAC over `(type, id, patient_id)` with a server-side secret, or a stored random token. Detail RPCs accept only tokens.
2. One RPC per §11.1, each: `security definer`, `set search_path = public, pg_catalog`, `patient_portal_can_access` first, whitelisted columns only, release gates applied, audit row written, opaque tokens returned.
3. `patient_portal_visits` collapses `initial_consultation` + `consultation` for the same visit into one row.
4. `patient_portal_vaccinations` mirrors `normalizeVaccineRecords`, including the legacy `bcg_date` synthesis, and returns only the §7.1 vaccination fields.
5. `patient_portal_lab_results` / `patient_portal_lab_result_detail`: filter `status = 'Completed'`; strip `generalNotes` (D-3); call `patient_portal_scope` and include the `hivScreening`/`hbsagScreening` groups **only** when it returns `'FULL'` — omit them entirely (not redacted, not a placeholder) when it returns `'STANDARD'` (§7.3, §7.5); for every remaining group/test, look up `patient_portal_reference_ranges` by `(group_key, test_key, method_label)` and attach a range only when an `active` approved row exists — never fall back to a hardcoded constant (§9.4, D-11).
6. `revoke execute from public, anon`; `grant execute to authenticated`.

**Security.** No `select *` anywhere. No dynamic SQL. Reject unknown tokens without disclosing whether the record exists. Audit denials too. Scope filtering happens once, inside the RPC — never trust a client-supplied scope or category flag.

**Do not change.** Any existing table, policy, trigger, RPC, or FHSIS/vaccination consumer. `saveVaccineRecord` and the FHSIS workspaces must be provably untouched. `LabResultDetailModal`'s existing reference-range constants are not read by any portal RPC.

**Tests.** For each RPC: authorized account returns expected rows; unauthorized `patient_id` raises; revoked grant raises; expired grant raises; a pending lab result never appears; staff-only columns absent from every returned row (assert on the returned column list); an audit row is written per call. **Scope tests:** a `STANDARD`-scope caller's lab result response contains no `hivScreening`/`hbsagScreening` key at all (not an empty or redacted one) even when that data exists; a `FULL`-scope (`SELF`) caller receives it when released. **Reference-range tests:** a test/method with an active approved row returns a range; one without returns the value with no range key present; an `active = false` row is treated as absent. Regression: FHSIS monthly report generation and the staff vaccination screens produce identical output before and after.

**Gate.** Column-whitelist assertions pass for all RPCs; the FHSIS regression is clean; the authorization truth table holds for every RPC; the scope and reference-range tests above pass.

---

### Phase 6 — Home, My Health, Visit detail

**Objective.** The clinical reading experience.

**Scope.** §9.1 and §9.2.

**Files.** `src/app/patient/index.tsx`; `src/components/patient-portal/` (`HomeSection`, `VisitList`, `VisitDetail`, `VaccinationList`, `FollowUpList`, `AttentionCard`); `src/features/patient-portal/api.ts` (new, RPC wrappers + types); `src/features/patient-portal/format.ts` (dates, plain-language mapping).

**Prerequisites.** Phases 4–5.

**Tasks.** Implement the specified layouts exactly. Skeletons on first load, content retained on refresh, `EmptyState` everywhere, "Show more" pagination, the follow-up disambiguation line on every follow-up card, and the omit-when-empty rule for visit-detail sections.

**Security.** No client-side filtering of clinical data — whatever the RPC returns is already the patient-visible set. Never log responses to the console.

**Do not change.** Staff patient-history code (`src/features/patients/history.ts`), `PatientTransactionHistory`, `PatientChart`.

**Tests.** Component/manual: a visit with no diagnosis; a visit with no plan; a patient with zero visits; 50+ visits paginate; legacy BCG-only vaccination record renders; past-due follow-up wording. Responsive and a11y pass per §10 and §14.

**Gate.** All §9.1–9.2 layouts match; no horizontal scroll at any breakpoint; a11y checklist passes.

---

### Phase 7 — Medicines and Lab Results

**Objective.** The two highest-value sections after Home.

**Scope.** §9.3 and §9.4.

**Files.** `src/components/patient-portal/` (`MedicineList`, `MedicineCard`, `LabResultList`, `LabResultView`); `src/features/patient-portal/medicines.ts`, `.../labResults.ts`. Reuse `parsePrescriptionContent` for shape reference only — parsing happens server-side in the RPC.

**Prerequisites.** Phases 5–6. D-3 and D-11 answered.

**Tasks.** **Recent/Previous grouping by `prescription_date` recency and claim status only — no `duration` parsing, no "currently active" inference (§9.3)**; the medicine card layout with `duration`/`frequency` rendered verbatim; friendly claim status; malformed-prescription message; released-only lab list; the pending-test notice with no values; whitelisted findings groups, scope-filtered per Phase 5; reference ranges rendered only when the RPC returned one (never computed or looked up client-side); the "your provider will explain this" footer; no interpretation, no High/Low/Abnormal labels.

**Security.** Never render an unrecognised findings key. Never render `generalNotes` while D-3 is open. Never surface raw `Pending`/`Dispensed`/`Completed`. Never render a client-side-guessed reference range or a value/status label the RPC did not supply.

**Do not change.** `LabResultDetailModal` (staff-side) or `prescriptionParser.ts`. If the portal needs a variant renderer, create a new component rather than adding branches to the staff one.

**Tests.** Malformed `rx_content`; plain-text `findings`; a result with an unknown group; a pending request; a patient with no prescriptions; long medicine names at 360px (wrap, not scroll); a prescription with `duration = 'PRN'` / `'until finished'` / `'as directed'` renders the text verbatim and does not crash or miscategorize the grouping; a lab value with no approved reference range renders with no range shown; a `STANDARD`-scope session's result view shows no trace of the sensitive groups (no empty section, no count).

**Gate.** Zero raw statuses, ids, or JSON reach the DOM (verified by inspecting the rendered output); no medicine is labelled "current" or "active" based on parsed duration text; no reference range appears that the RPC did not explicitly return; §9.3–9.4 layouts match.

---

### Phase 8 — More, Profile, Privacy, Access management, Accessibility

**Objective.** Close the loop on self-service and transparency.

**Scope.** §9.5, plus the correction-request and revocation write paths and the display-preference persistence.

**Files.** `src/components/patient-portal/` (`MoreMenu`, `ProfileView`, `CorrectionRequestForm`, `AccessList`, `PrivacySecurity`, `RecentAccess`, `NotificationPrefs`, `DisplayPrefs`, `HelpSupport`); `src/features/patient-portal/account.ts`; a staff-side correction-request queue (smallest possible addition to an existing admin/nurse screen — **confirm placement with the user before building it**).

**Prerequisites.** Phases 4–7. D-7 answered.

**Tasks.** Three-zone profile; correction form → `patient_portal_submit_correction`; access list with revocation confirmation **restricted to `AUTHORIZED_CAREGIVER` grants only** — a `GUARDIAN` card renders with no remove control and the staff-mediated-change message (§9.5, §6.3); change PIN; "Recent access" feed from the portal's own audit rows; SMS reminder preference honoured by `send-followup-reminders`; text size and contrast persisted to `patient_account_preferences`; static help content.

**Security.** Revocation goes through the RPC and re-checks that the caller holds `SELF` on that record **and** that the target grant's `relationship = 'AUTHORIZED_CAREGIVER'` — a `GUARDIAN` grant is refused server-side even if the UI's missing remove control were bypassed. The correction request never writes to `patients`. The recent-access feed exposes only portal-origin rows, never staff activity (D-7).

**Do not change.** `audit_logs` schema; the staff audit page; the reminder function's sending logic beyond reading the new preference.

**Tests.** Revoke a caregiver → the caregiver's next request fails; **attempting to revoke a `GUARDIAN` grant (via a modified/scripted client, not the UI) is refused by the RPC**; correction request appears in the staff queue and never mutates `patients`; larger text persists across sessions and does not affect staff pages; SMS preference off actually suppresses the reminder.

**Gate.** Every §9.5 screen present; the caregiver-revocation and correction paths verified end to end; the guardian-revocation refusal is verified end to end.

---

### Phase 9 — Hardening, performance, and UAT

**Objective.** Prove it before it touches a real patient.

**Scope.** Security review, performance, error/connectivity states, UAT with real users.

**Files.** Test artifacts, `docs/UAT-Revision.md` (append a patient-portal section), possibly small fixes in portal files only.

**Prerequisites.** Phases 1–8.

**Tasks.**
1. Full IDOR sweep: every RPC called with another patient's id, a revoked grant, an expired grant, a disabled account, a forged token, and — separately — a `STANDARD`-scope grant requesting the sensitive lab groups directly (must come back absent, not denied-with-a-reason that confirms existence).
2. Verify no staff-only field appears in any portal network response (capture and inspect every response body), and that a `GUARDIAN` grant can never be revoked through any captured request replayed with parameters changed.
3. Payload budget: Home ≤ ~40 KB of JSON; every list paginated; no N+1 RPC calls.
4. Bundle: the portal entry must not import staff modules, `chart.js`, `jspdf`, or the FHSIS features. Check the built chunk.
5. Connectivity states: offline banner, retry affordance, slow-3G loading, and a friendly message for every failure (no Supabase error text ever reaches the screen).
6. Device testing on a low-end Android and on a small screen.
7. UAT per §18.

**Security.** Run `/security-review` on the accumulated diff. Re-diff `pg_policies` against the pre-Phase-1 baseline.

**Do not change.** Anything outside the portal, absent a confirmed defect.

**Tests.** All of §18.

**Gate.** No open high or medium security finding; UAT sign-off from the RHU; staff regression suite clean.

---

## 18. Testing and UAT plan

### 18.1 Authorization matrix (must be executed as written, per phase)

| Actor | Target | Expected |
|---|---|---|
| Patient A (`SELF` on 101) | 101 | Allow |
| Patient A | 102 | Deny |
| Caregiver C (grant on 102) | 102 | Allow, read-only |
| Caregiver C, revoked | 102 | Deny on the next request |
| Guardian G, `expires_at` past | child record | Deny |
| Disabled account | any | Deny |
| Patient A | any staff table via PostgREST | Zero rows |
| Patient A | any `analytics_*` RPC | Deny |
| Staff (each of 7 roles) | all existing staff flows | Unchanged |
| `anon` | every new table and RPC | Deny |
| Patient A (`SELF`, `FULL` scope) | own `hivScreening`/`hbsagScreening` results, when released | Present |
| Guardian/Caregiver (`STANDARD` scope) on their patient | that same patient's `hivScreening`/`hbsagScreening` results | Absent entirely — no key, no placeholder |
| Patient A (`SELF`, any age) | revoke own `GUARDIAN` grant | Deny, server-side, regardless of the patient's age |
| Patient A (`SELF`) | revoke own `AUTHORIZED_CAREGIVER` grant | Allow |
| Staff | revoke a `GUARDIAN` grant | Allow |
| Caregiver-only account (no `patients` record) | own `patient_portal_my_records()` | Returns only the grants it holds; no error from having no `SELF` grant |

### 18.2 Data-visibility tests

For every RPC, assert the returned column set **equals** the §7.1 whitelist — not "contains". Assert `lab_result` rows with any status other than `Completed` never appear. Assert no raw id, table name, or status string appears in any response.

### 18.3 Regression tests (staff side)

Login for all seven roles; patient registration; consent; initial consultation + vitals (`record_initial_intake`); doctor consultation + follow-up; lab request → result → status sync trigger; prescription create → dispense; vaccination save; FHSIS monthly report submit/verify/return; analytics pages; archive review; audit log page.

### 18.4 Accessibility tests

44px target audit; 200% zoom on every screen; keyboard-only traversal of the whole portal; screen-reader pass (TalkBack on Android, NVDA on desktop); contrast measurement in both display modes; `prefers-reduced-motion`.

### 18.5 Performance / connectivity

Throttled Fast-3G first load; airplane-mode behaviour; mid-request disconnection; portal bundle size recorded and compared against the staff bundles.

### 18.6 UAT participants

At least: two adults, two senior citizens (one independent, one with a caregiver), one adolescent with a guardian, one caregiver (including one account-only caregiver with no `patients` record of their own, §5.2.1), and two RHU staff running activation. Tasks, timed, unassisted: activate an account; find your last visit; find what medicine you were given and how to take it (confirm the duration text reads exactly as written, e.g. `PRN` or `until finished`); find your latest lab result; find when to return; find who else can see your record and remove a caregiver if one is present (the guardian participant should confirm there is **no** remove control on their guardian's card, and that this reads as expected rather than as a bug); make the text larger; sign out.

**Pass criteria:** every task completed unassisted by at least 6 of 8 participants; zero participants report seeing another person's data; zero participants ask staff what a screen means.

---

## 19. Open decisions and blockers

Answers are needed from the project owner. Several block specific phases.

| # | Decision | Recommendation | Blocks |
|---|---|---|---|
| **D-1** | Is public sign-up disabled in Supabase Auth? Not verifiable from the repository, and §13 R1 makes it critical. | **Disable it.** All account creation goes through Edge Functions. | Phase 1 |
| **D-2** | Login mechanism: MediSens ID + PIN through a custom Edge Function (server-enforced lockout, PIN never reaches GoTrue directly) vs. direct `signInWithPassword` from the browser. **The 6-digit PIN is conditional, not settled** — it is acceptable only if Phase 3 proves every authentication attempt is forced through the server-side `patient-login` path with no bypass to direct Supabase Auth sign-in using the PIN (§5.4). | **Edge Function**, and Phase 3's gate must demonstrate the no-bypass property before shipping a 6-digit PIN. If that cannot be proven, the minimum becomes an 8-character password. | Phase 3 |
| **D-3** | Is `lab_result.findings.generalNotes` patient-safe? Depends on what the RHU laboratory actually writes there. | **Exclude in MVP** until the lab confirms it contains no internal remarks. | Phase 5, 7 |
| **D-4** | Show vital signs (BP, weight, temperature) to patients? They are doctor-only today. | **Exclude in MVP.** Genuinely useful, but widening `vital_sign` visibility deserves its own decision. | Phase 5 |
| **D-5** | Should any `GUARDIAN`/`AUTHORIZED_CAREGIVER` grant ever be upgraded to see HIV/HBsAg and other specially-protected results (the `FULL` set)? MVP default is now **no** — those grants get `scope = 'STANDARD'` and the sensitive groups are excluded entirely and silently (§7.3, §7.5). | **Keep the conservative `STANDARD` default.** If the RHU later needs an exception process, add one new `scope` value and a staff-only, audited upgrade path — do not build self-service scope changes or a per-category permission matrix. | Phase 2 (schema), Phase 5 (RPC filtering); confirm before any caregiver grant touches a sensitive result in production |
| **D-6** | How are duplicate patient records handled before activation? | Staff pick the canonical record; no portal feature. Confirm the RHU has a workable manual process. | Phase 3 |
| **D-7** | Does "Recent access" show staff reads as well as portal reads? | **Portal reads only** in MVP. Exposing internal staff activity to patients has consequences the RHU should choose deliberately. | Phase 8 |
| **D-8** | Session persistence: `localStorage` (survives browser restart) vs. `sessionStorage` (dies with the tab). | **`sessionStorage` for the portal**, given shared family devices, plus the 15-minute inactivity timeout. Slightly more sign-ins; materially safer. | Phase 4 |
| **D-9** | Filipino/Tagalog UI at launch? | **English-only in MVP**, with all strings centralised so a translation is a data change. Confirm this is acceptable for the target users. | Phase 4 |
| **D-10** | iProg SMS volume and cost for activation codes + OTP + existing reminders. | Confirm quota before Phase 3; the fallback (counter-issued codes, no OTP) is already designed. | Phase 3 |
| **D-11** | Who at the RHU laboratory curates `patient_portal_reference_ranges`, and by what process, before any range is shown to a patient? | A named lab in-charge (or the RHU's laboratory lead) signs off on a seed list per test/method before Phase 5 ships; no self-service management UI in MVP — entries are added via a reviewed migration or seed script. | Phase 2 (table), Phase 5/7 (any range actually shown) |

Two further items to flag as risks rather than decisions:

- **The base schema has no migrations.** Only FHSIS tables have `create table` statements; everything else lives only in the hosted database. Every phase must re-verify column names against the live schema, not against this document.
- **There is no automated test suite in the repository.** Every "test" above is a manual or SQL-script procedure. If the capstone timeline allows, adding a minimal SQL assertion harness for the authorization matrix (§18.1) would pay for itself in Phase 5 alone.
