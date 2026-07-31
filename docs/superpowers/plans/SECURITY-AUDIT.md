# MediSens Production Security and Authorization Audit

Date: 2026-07-14  
Scope: current `E:\thesis-templates` MediSens application source, Supabase Edge Functions, local migrations, and read-only linked Supabase catalog inspection for project `sdtaotbklrienpvicdte`.

## Executive Summary

MediSens has meaningful security controls in place: Supabase Auth is used, all observed core public tables have RLS enabled, analytics RPCs deny `anon`, analytics internals are in a locked private schema, and the highest-risk archive and audit writes have been moved behind Edge Functions that validate sessions and roles server-side.

The production blockers are still significant. The deployed database contains broad role-only or `true` RLS policies that let any authenticated account read or write large parts of the clinical dataset, several `SECURITY DEFINER` functions in `public` are executable by `anon`, and the auth profile trigger trusts `raw_user_meta_data.role`. Admin role mutation and profile deletion are still direct browser table writes, not server-authorized workflows. These issues mean UI route checks are not a sufficient authorization boundary.

## Evidence Reviewed

- Source files under `src`, `supabase/functions`, and `supabase/migrations`.
- Linked Supabase catalog via read-only `supabase db query --linked`.
- Supabase security advisors via `supabase db advisors --linked --type security --level info --fail-on none`.
- Supabase performance/outlier inspection where available.

The linked database inspection showed:

- Core public tables have RLS enabled.
- `anon` and `authenticated` have broad table privileges on public tables, relying on RLS for actual enforcement.
- Public schema is exposed to `anon` and `authenticated`; `analytics_private` is not.
- Analytics private views are not selectable by `anon` or `authenticated`.
- Supabase advisors flagged mutable function search paths, permissive RLS policies, public executable `SECURITY DEFINER` functions, signed-in executable `SECURITY DEFINER` functions, and leaked-password protection disabled.

## Current Security Strengths

- Supabase Auth is the central authentication mechanism; the browser client uses the anon key only in [src/lib/supabase/client.ts](src/lib/supabase/client.ts:3).
- UI entry points consistently call `requireRole` / `requireAnyRole` before rendering role pages, for example [src/lib/auth/roles.ts](src/lib/auth/roles.ts:52) and [src/app/admin/index.tsx](src/app/admin/index.tsx:170).
- Archive and restore mutations use `archive-patient-record` instead of direct frontend archive writes, and the function validates the caller session and `profiles.role` before using service-role writes in [supabase/functions/archive-patient-record/index.ts](supabase/functions/archive-patient-record/index.ts:66) and [supabase/functions/archive-patient-record/index.ts](supabase/functions/archive-patient-record/index.ts:83).
- Audit writes use a dedicated `create-audit-log` Edge Function with authenticated user lookup and an allowlist for actions/modules/record types in [supabase/functions/create-audit-log/index.ts](supabase/functions/create-audit-log/index.ts:92) and [supabase/functions/create-audit-log/index.ts](supabase/functions/create-audit-log/index.ts:123).
- Analytics RPCs are parameter-limited, use `SECURITY DEFINER set search_path = ''`, revoke `anon`, and enforce `profiles.role = 'doctor'` through `analytics_private.require_analytics_role()` in [supabase/migrations/20260712104951_doctor_only_analytics_access.sql](supabase/migrations/20260712104951_doctor_only_analytics_access.sql:3), [supabase/migrations/20260712104951_doctor_only_analytics_access.sql](supabase/migrations/20260712104951_doctor_only_analytics_access.sql:22), and [supabase/migrations/20260711194311_analytics_aggregate_layer.sql](supabase/migrations/20260711194311_analytics_aggregate_layer.sql:666).
- The `analytics_private` schema has usage and object access revoked from `public`, `anon`, and `authenticated` in [supabase/migrations/20260711194311_analytics_aggregate_layer.sql](supabase/migrations/20260711194311_analytics_aggregate_layer.sql:7) and [supabase/migrations/20260711194311_analytics_aggregate_layer.sql](supabase/migrations/20260711194311_analytics_aggregate_layer.sql:336).
- Patient archive views are filtered out of most active workflows in the app, for example patient registry filtering in [src/app/patients/records.tsx](src/app/patients/records.tsx:66).
- Error helper avoids raw technical messages in much of the UI, while technical details are logged via developer logs.

## Findings

### 1. Critical - Auth profile trigger trusts user-editable metadata for role assignment

Affected:

- Database function: `public.handle_new_user()`
- Database trigger: `auth.users` trigger `on_auth_user_created`
- Function definition observed in linked catalog: `COALESCE(NEW.raw_user_meta_data->>'role', 'nurse')`

Exploitation scenario:

If public signup is enabled, or if any unaudited user-creation path can set `raw_user_meta_data.role`, a user can create an account with metadata such as `{ "role": "admin" }`. The trigger then writes that role into `public.profiles`, giving the account application and RLS privileges tied to that role.

Recommended remediation:

- Never derive authorization roles from `raw_user_meta_data`.
- Replace the trigger behavior with a fixed safe default such as `pending` or `nurse`, or remove role assignment from auth metadata entirely.
- Assign roles only through a server-side admin action that checks the caller against trusted `profiles.role` or `app_metadata`.
- Backfill and review existing profiles for unexpected role values.

Workflow impact:

May affect public/self-service signup and any account creation flow that expected metadata-driven roles. Admin-created accounts through `create-user` can be preserved if the Edge Function remains the sole role assignment path.

### 2. Critical - Public executable SECURITY DEFINER functions in exposed schema

Affected database functions:

- `public.get_my_role()`
- `public.handle_new_user()`
- `public.handle_delete_user()`
- `public.is_admin()`
- `public.rls_auto_enable()`

Linked catalog/advisor status:

- `public_execute = true`
- `anon_execute = true`
- `authenticated_execute = true`
- `SECURITY DEFINER = true`
- Advisors flagged all five under `anon_security_definer_function_executable`.

Exploitation scenario:

Any unauthenticated client with the project anon key can call exposed RPC endpoints such as `/rest/v1/rpc/is_admin` or `/rest/v1/rpc/handle_new_user`. Trigger-returning functions may error when called directly, but they should not be exposed as callable public APIs. A future body change, overload, or helper added to one of these functions could become immediately exploitable by `anon`.

Recommended remediation:

- Revoke `EXECUTE` from `public`, `anon`, and `authenticated` for trigger-only and internal helper functions.
- Move internal helpers to a private schema where possible.
- Set fixed `search_path` on every remaining `SECURITY DEFINER` function.
- Prefer `SECURITY INVOKER` unless definer privileges are required.

Workflow impact:

Should not affect normal app workflows if these functions are only used by triggers or RLS helpers. Test profile RLS after changing `get_my_role()`.

### 3. Critical - Broad authenticated RLS policies permit cross-role clinical data access and mutation

Affected policies observed in linked catalog:

- `consultation`: `Allow authenticated selects` (`USING true`), `Allow authenticated inserts` (`WITH CHECK true`)
- `initial_consultation`: `Allow authenticated selects`, `Allow authenticated inserts`
- `vital_sign`: `Allow authenticated selects`, `Allow authenticated inserts`
- `follow_up`: `Allow authenticated selects`, `Allow authenticated inserts`
- `fhsis_logs`: `Allow authenticated access` (`ALL`, `USING true`)
- `patient_consent`: `Allow authenticated users full access to patient_consent` (`ALL`, `USING true`, `WITH CHECK true`)

Source write paths relying on these policies:

- Initial consultation and vitals direct inserts in [src/features/consultation/services.ts](src/features/consultation/services.ts:11) and [src/features/consultation/services.ts](src/features/consultation/services.ts:20)
- Doctor consultation direct insert/update in [src/features/consultation/services.ts](src/features/consultation/services.ts:45) and [src/features/consultation/services.ts](src/features/consultation/services.ts:59)
- Follow-up direct insert/update in [src/features/consultation/services.ts](src/features/consultation/services.ts:88) and [src/features/consultation/services.ts](src/features/consultation/services.ts:109)
- Patient consent direct insert in [src/features/patients/services.ts](src/features/patients/services.ts:52)
- FHSIS direct insert/update in [src/features/midwife/api.ts](src/features/midwife/api.ts:101), [src/features/patients/vaccineService.ts](src/features/patients/vaccineService.ts:46), and [src/features/patients/vaccineService.ts](src/features/patients/vaccineService.ts:90)

Exploitation scenario:

A compromised low-privilege authenticated account can bypass UI navigation and call Supabase REST directly to read all consultations, insert fake clinical records, alter consent records, or modify FHSIS/vaccine data if the table policy allows it. This is a broken object-level authorization risk.

Recommended remediation:

- Replace `USING true` / `WITH CHECK true` policies with role-specific policies matching business workflows.
- Add ownership/relationship predicates where practical, or require server-side workflow functions for high-integrity clinical writes.
- Split read and write policies by role, workflow stage, and required patient state.
- Add `WITH CHECK` on all update policies that mutate role-sensitive or patient-linked data.

Workflow impact:

High. This will affect most clinical workflows unless phased carefully. Existing pages may need server actions/Edge Functions or narrower policies for nurse, doctor, midwife, BHW, lab, and pharmacist paths.

### 4. High - Admin profile role changes and profile deletion are direct browser table mutations

Affected:

- Admin profile update: [src/app/admin/index.tsx](src/app/admin/index.tsx:270)
- Admin profile delete: [src/app/admin/index.tsx](src/app/admin/index.tsx:360)
- Database policy: `profiles` policy `Admin full access` using `get_my_role() = 'admin'`
- Database trigger: `public.handle_delete_user()` deletes matching `auth.users` row after profile deletion

Exploitation scenario:

An attacker with any admin session, stolen admin JWT, or future RLS bypass can promote users, demote administrators, or delete profiles directly via the REST API. Profile deletion cascades into `auth.users` through a `SECURITY DEFINER` trigger, expanding the blast radius of a table mutation.

Recommended remediation:

- Move profile role updates and user deletion into an admin-only Edge Function.
- Revalidate caller role server-side using a service-role client after `auth.getUser()`.
- Enforce last-admin protection server-side, not only in UI.
- Add audit logging for delete actions and failed authorization attempts.

Workflow impact:

Moderate. Admin user management should remain intact, but UI save/delete calls need to switch from direct table mutations to function invocations.

### 5. High - Patient update policy allows broad updates without WITH CHECK

Affected:

- Database policy: `patients` policy `Staff can update patients`
- Source update path: [src/features/patients/services.ts](src/features/patients/services.ts:28)
- Patient detail UI allows BHW, nurse, doctor, and midwife chart access via [src/app/patients/details.tsx](src/app/patients/details.tsx:123)

Exploitation scenario:

Any role included in the policy can update any patient row, including potentially security-sensitive archive columns, demographic identifiers, consent-related fields, or workflow fields if sent through REST directly. The UI hides archived chart edits, but database policy is the actual boundary.

Recommended remediation:

- Add column-level restrictions through server-side functions for sensitive updates.
- Split patient profile updates from archive/restore fields.
- Use restrictive policies or triggers to prevent direct changes to `archive_status`, `archived_at`, `archived_by`, `archive_reason`, `archive_reviewed_at`, `archive_reviewed_by`, and `archive_protected`.
- Add `WITH CHECK` predicates and role-specific update policies.

Workflow impact:

Moderate to high. Patient registration/profile update flows need careful testing for BHW, nurse, doctor, and midwife.

### 6. High - Direct clinical writes rely on client-side role checks instead of server-enforced workflows

Affected direct-write modules:

- Patient registration: [src/features/patients/services.ts](src/features/patients/services.ts:15)
- Initial consultation/vitals: [src/features/consultation/services.ts](src/features/consultation/services.ts:11)
- Consultation/follow-up/lab request/prescription: [src/features/consultation/services.ts](src/features/consultation/services.ts:45), [src/features/consultation/services.ts](src/features/consultation/services.ts:119), [src/features/consultation/services.ts](src/features/consultation/services.ts:135)
- Lab result and lab request status: [src/features/laboratory/services.ts](src/features/laboratory/services.ts:31), [src/features/laboratory/services.ts](src/features/laboratory/services.ts:49)
- Pharmacy dispensing: [src/app/pharmacist/index.tsx](src/app/pharmacist/index.tsx:249)

Exploitation scenario:

If RLS remains broad or is misconfigured, a user can issue direct Supabase REST requests to create or alter workflow records without using the intended page, sequence, or role-specific UI. For example, a non-doctor could submit consultation records if authenticated insert policies remain permissive.

Recommended remediation:

- Keep low-risk reads in RLS, but move high-integrity writes into Edge Functions or database RPCs with explicit role checks.
- For direct table writes that must remain, enforce role, row, and status transitions in RLS.
- Add workflow-state checks such as consent exists before initial consultation, lab request exists before result, and prescription belongs to a pending queue before dispense.

Workflow impact:

High if converted all at once. Phase by module, beginning with role/privilege mutation and clinical write paths that are easiest to abuse.

### 7. High - Service-role follow-up reminder endpoint appears unauthenticated

Affected:

- Edge Function: [supabase/functions/send-followup-reminders/index.ts](supabase/functions/send-followup-reminders/index.ts:47)
- Local Node script: [send_follow_up_reminder.js](send_follow_up_reminder.js:21)

Exploitation scenario:

The Edge Function creates a service-role client and sends SMS reminders, but the handler does not validate a scheduler secret, JWT, method, or caller identity. If deployed as a publicly invokable Supabase function without JWT verification, an attacker can repeatedly trigger SMS sending, enumerate timing behavior, burn SMS quota, and expose phone numbers in logs/responses.

Recommended remediation:

- Require a secret header or Supabase JWT for scheduled invocations.
- Restrict function invocation to cron/internal callers if possible.
- Make the function idempotent per follow-up/date, and record sent reminders.
- Return aggregate counts rather than per-phone/provider details.

Workflow impact:

Low to moderate. Cron configuration needs updating. Reminder delivery should be preserved.

### 8. High - Edge Functions return technical authorization and database details

Affected:

- `create-user` returns profile lookup details and role mismatch internals in [supabase/functions/create-user/index.ts](supabase/functions/create-user/index.ts:85), [supabase/functions/create-user/index.ts](supabase/functions/create-user/index.ts:117), and raw database/auth messages in [supabase/functions/create-user/index.ts](supabase/functions/create-user/index.ts:136).
- `create-audit-log` returns `stage`, database error `code`, and `message` in [supabase/functions/create-audit-log/index.ts](supabase/functions/create-audit-log/index.ts:159).

Exploitation scenario:

An attacker can probe function behavior and collect user IDs, expected roles, profile existence, database error codes, and implementation stages. This improves targeted attacks and account enumeration.

Recommended remediation:

- Return generic user-facing errors from Edge Functions.
- Keep detailed diagnostics in server logs only.
- Normalize authorization failures to one message and one status.

Workflow impact:

Low. Admin UI already maps many failures to generic healthcare messages, but debugging may rely more on function logs.

### 9. Medium - Session handling relies on `getSession()` for route gating

Affected:

- Role/profile loader: [src/lib/auth/roles.ts](src/lib/auth/roles.ts:30)
- Login redirect: [src/app/auth/login.ts](src/app/auth/login.ts:16)
- Logout audit uses `getUser()` later in [src/lib/auth/roles.ts](src/lib/auth/roles.ts:92)

Exploitation scenario:

`getSession()` reads locally stored session state and is suitable for UX routing, but it is not a server authorization proof. A stale or manipulated browser state may briefly render UI or trigger queries until Supabase rejects them. If RLS is broad, the route check becomes the main control.

Recommended remediation:

- Keep `getSession()` for UX, but use `getUser()` where a verified user is needed before sensitive client actions.
- Treat all role checks in UI as convenience only.
- Enforce every write and sensitive read at RLS, RPC, or Edge Function level.

Workflow impact:

Low for UX; medium if sensitive operations are moved to server checks.

### 10. Medium - Audit logging is incomplete and non-blocking for critical mutations

Affected:

- Audit service suppresses/logs failures and does not block the original mutation in [src/features/audit/services.ts](src/features/audit/services.ts:225).
- Follow-up audit is explicitly TODO in [src/features/consultation/services.ts](src/features/consultation/services.ts:77).
- FHSIS update audit is explicitly TODO in [src/features/midwife/api.ts](src/features/midwife/api.ts:95).
- Admin delete does not log a delete event in [src/app/admin/index.tsx](src/app/admin/index.tsx:360).

Exploitation scenario:

An attacker or compromised account can perform sensitive changes while audit insertion silently fails due to network, function, or permission problems. Investigators later see incomplete activity history.

Recommended remediation:

- Define which actions must have durable audit entries.
- For high-risk actions, move mutation and audit insert into one server-side transaction or Edge Function workflow.
- Add audit entries for user delete, role changes, follow-up changes, vaccine/FHSIS updates, and archive authorization failures.

Workflow impact:

Moderate. Some workflows may need to fail closed for audit-critical actions.

### 11. Medium - Offline IndexedDB sync stores and later inserts untrusted patient payloads

Affected:

- Offline insert replay: [src/hooks/useNetworkSync.ts](src/hooks/useNetworkSync.ts:64)
- Local storage write helper: [src/hooks/useNetworkSync.ts](src/hooks/useNetworkSync.ts:120)
- Offline registration/consultation/follow-up callers: [src/app/patients/templates.tsx](src/app/patients/templates.tsx:211), [src/app/consultation/index.tsx](src/app/consultation/index.tsx:799), [src/app/follow-up-visitation/index.tsx](src/app/follow-up-visitation/index.tsx:119)

Exploitation scenario:

Users can tamper with IndexedDB records before reconnection. The sync job currently inserts only into `patients`, even for records tagged as consultation/follow-up, so tampered payloads may become malformed patient rows if RLS permits insert.

Recommended remediation:

- Validate offline payload type and schema immediately before sync.
- Sync each record type through the correct server-validated workflow.
- Add a server-generated idempotency key or offline queue table with validation.
- Encrypt or minimize sensitive offline data if production offline mode is required.

Workflow impact:

Moderate. Offline mode behavior needs correction and testing.

### 12. Medium - Expensive polling and broad queries increase abuse surface

Affected:

- Admin user list refresh every 1.5s in [src/app/admin/index.tsx](src/app/admin/index.tsx:188)
- Pharmacy polling every 1.5s in [src/app/pharmacist/index.tsx](src/app/pharmacist/index.tsx:92)
- Laboratory polling every 1.5s in [src/app/laboratory/index.tsx](src/app/laboratory/index.tsx:405)
- Patient registry loads up to 1000 records with contact/PhilHealth fields in [src/app/patients/records.tsx](src/app/patients/records.tsx:66)
- Audit log search does extra patient lookup in [src/features/audit/services.ts](src/features/audit/services.ts:105)

Exploitation scenario:

Multiple logged-in clients or scripted sessions can generate constant database traffic and fetch large PII sets. If an account is compromised, bulk patient data can be repeatedly enumerated through normal app queries.

Recommended remediation:

- Prefer realtime subscriptions plus debounced/manual refresh over fixed polling.
- Add server-side pagination and search for patient registry.
- Select only fields needed for the view; move full PII to detail screens.
- Add rate limiting around Edge Functions and expensive RPCs.

Workflow impact:

Low to moderate. UI loading behavior and search workflows may change.

### 13. Medium - Leaked-password protection is disabled

Affected:

- Supabase Auth project setting: leaked password protection disabled, reported by Supabase security advisor.

Exploitation scenario:

Staff accounts can use passwords already present in breach corpuses, increasing credential stuffing risk.

Recommended remediation:

- Enable leaked password protection in Supabase Auth.
- Consider minimum password strength and MFA for administrator accounts.
- Review session expiry policy for a healthcare production deployment.

Workflow impact:

Low. Some existing weak passwords may need reset.

### 14. Low - Wildcard CORS on privileged Edge Functions

Affected:

- [supabase/functions/create-user/index.ts](supabase/functions/create-user/index.ts:15)
- [supabase/functions/create-audit-log/index.ts](supabase/functions/create-audit-log/index.ts:4)
- [supabase/functions/archive-patient-record/index.ts](supabase/functions/archive-patient-record/index.ts:12)

Exploitation scenario:

Wildcard CORS does not bypass Supabase Auth by itself, but it allows any website to invoke these functions from a victim browser if the attacker can obtain or cause use of an access token. It increases exposure for phishing and token-theft scenarios.

Recommended remediation:

- Restrict CORS origins to production and approved staging domains.
- Keep `Authorization` required and never allow credentials broadly.

Workflow impact:

Low. Deployment environments need domain configuration.

## Missing Protections

- Trusted server-side role assignment that never uses `raw_user_meta_data`.
- Revoked public execution for internal `SECURITY DEFINER` functions.
- Fixed `search_path` on all definer functions.
- Role-specific, workflow-specific RLS for clinical tables.
- Column protection for patient archive/security fields.
- Server-side admin role update/delete workflows.
- Server-side validation for high-integrity clinical writes.
- Durable audit logging for user deletion, role changes, follow-ups, FHSIS/vaccine updates, and failed privileged actions.
- Rate limiting/idempotency on SMS reminders and other abuse-prone functions.
- Stronger offline sync validation.
- Supabase Auth leaked-password protection.
- Production CORS origin allowlist.

## RLS Permission Matrix by Role

Effective policy summary from linked catalog. This matrix describes database policy intent; UI route checks are not treated as security.

| Object | anon | admin | doctor | nurse | BHW | midwives | labaratory | pharmacist |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `profiles` | No table policy | Full via `get_my_role() = admin`; own select/insert | Own select/insert | Own select/insert | Own select/insert | Own select/insert | Own select/insert | Own select/insert |
| `patients` | No table policy | No explicit patient policy | Select/insert/update all patients | Select/insert/update all patients | Select/insert/update all patients | Select/update all patients | Select all patients | Select all patients |
| `patient_consent` | No table policy | ALL | ALL | ALL | ALL | ALL | ALL | ALL |
| `initial_consultation` | No table policy | Select/insert all | Select/insert all | Select/insert all | Select/insert all | Select/insert all | Select/insert all | Select/insert all |
| `vital_sign` | No table policy | Select/insert all | Select/insert all | Select/insert all | Select/insert all | Select/insert all | Select/insert all | Select/insert all |
| `consultation` | No table policy | Select/insert all | Select/insert plus doctor ALL | Select/insert all | Select/insert all | Select/insert all | Select/insert all | Select/insert all |
| `follow_up` | No table policy | Select/insert all | Select/insert/update all | Select/insert all | Select/insert all | Select/insert all | Select/insert all | Select/insert all |
| `lab_request` | No table policy | No explicit policy | Select/insert/update | No explicit policy | No explicit policy | No explicit policy | Select | No explicit policy |
| `lab_result` | No table policy | No explicit policy | Select | No explicit policy | No explicit policy | No explicit policy | ALL | No explicit policy |
| `prescription` | No table policy | No explicit policy | Select/insert/update | No explicit policy | No explicit policy | No explicit policy | No explicit policy | Select/update |
| `fhsis_logs` | Public-role policy exists but requires matching `auth.uid()` profile, so effectively none for true anon | ALL authenticated | ALL authenticated | ALL authenticated | ALL authenticated | ALL authenticated | ALL authenticated | ALL authenticated |
| `audit_logs` | No table policy | Select | Select | No explicit policy | No explicit policy | No explicit policy | No explicit policy | No explicit policy |
| `patient_archive_events` | No table policy | No explicit policy | Select | Select | No explicit policy | No explicit policy | No explicit policy | No explicit policy |

Risk notes:

- "ALL authenticated" and "Select/insert all" are not least privilege for a healthcare record system.
- `patients` update lacks a `WITH CHECK` clause and appears broad enough for sensitive field tampering unless column-level controls exist outside the inspected policies.
- Table grants show `anon` has broad table privileges, but no effective `anon` RLS policies were found for core data. This is acceptable only if no permissive public policies are added later.

## RPC and Function Permission Matrix

| Function group | anon | authenticated | Internal role check | Notes |
|---|---:|---:|---|---|
| `public.analytics_*` RPCs | No execute | Execute granted | `analytics_private.require_analytics_role()` requires `profiles.role = doctor` | `SECURITY DEFINER`, `search_path = ''`, good parameter limits. Advisor still flags authenticated definer execution because it is intentional but sensitive. |
| `analytics_private.*` helpers | No execute | No execute | N/A | Schema usage and function/table access revoked. |
| `public.get_my_role()` | Execute | Execute | Uses `auth.uid()` | `SECURITY DEFINER`, mutable search path, exposed in public schema. |
| `public.is_admin()` | Execute | Execute | Uses `auth.uid()` and `profiles.role = admin` | `SECURITY DEFINER`, public callable. |
| `public.handle_new_user()` | Execute | Execute | Trigger context only, but public callable | Trusts `raw_user_meta_data.role`; critical if signup/metadata role path exists. |
| `public.handle_delete_user()` | Execute | Execute | Trigger context only, but public callable | Deletes from `auth.users` when profile is deleted. |
| `public.rls_auto_enable()` | Execute | Execute | Event trigger context only, but public callable | Internal event trigger should not be exposed through RPC. |

## Exposed Tables and Views

- Public schema usage is granted to `public`, `anon`, and `authenticated`.
- Public tables are exposed through Supabase REST subject to RLS. Table privileges are broad, so policy quality is critical.
- No public views were observed in the linked catalog.
- `analytics_private` views exist but direct `anon`/`authenticated` select is false, and schema usage is false.

## Service-Role Key Usage

- Service-role use is server-side only in reviewed source:
  - `create-user`
  - `create-audit-log`
  - `archive-patient-record`
  - `send-followup-reminders`
  - `send_follow_up_reminder.js`
- No `VITE_` service-role exposure was found.
- Main concern is not key placement; it is that service-role functions need strict invocation authorization, generic responses, and complete audit trails.

## Public Forms and Unauthenticated Endpoints

- Login is public and uses `signInWithPassword` in [src/app/auth/login.ts](src/app/auth/login.ts:40).
- Edge Functions accept wildcard CORS and handle `OPTIONS`.
- `create-user`, `create-audit-log`, and `archive-patient-record` require bearer auth in function code.
- `send-followup-reminders` does not show request authentication and should be treated as a public-invocation risk until deployment settings prove otherwise.
- Public signup configuration was not changed or tested. The database trigger design makes public signup a critical risk if enabled.

## Expensive or Abuse-Prone Queries

- Repeated 1.5s polling in admin, pharmacy, and laboratory modules can multiply query load.
- Patient registry loads up to 1000 rows with contact and benefit identifiers.
- Several dashboard/queue queries use broad select across all accessible rows rather than server-side filtered views.
- Analytics RPCs have date and limit guards; this is a strength.
- Supabase outlier inspection showed dashboard/catalog queries dominating current `pg_stat_statements`; app-level query pressure should still be addressed before production scale.

## Recommended Implementation Phases

### Phase 0 - Production blockers

1. Disable or constrain public signup until role-assignment trigger is fixed.
2. Revoke public/anon/authenticated execute on internal `SECURITY DEFINER` functions.
3. Fix mutable `search_path` on definer functions.
4. Enable leaked-password protection.
5. Protect `send-followup-reminders` with a scheduler secret or JWT requirement.

### Phase 1 - Privileged account operations

1. Move admin profile update/delete to an Edge Function.
2. Enforce last-admin protection server-side.
3. Add durable audit events for role changes and deletion.
4. Review all existing `profiles.role` values.

### Phase 2 - Core RLS hardening

1. Replace broad `authenticated` true policies with role-specific policies.
2. Add `WITH CHECK` to every update policy.
3. Protect patient archive/security columns from direct client updates.
4. Add role-smoke tests for each table and workflow.

### Phase 3 - Clinical write boundaries

1. Move high-integrity writes to Edge Functions or RPCs where workflow rules matter.
2. Add workflow-state validation: consent before intake, doctor before diagnosis/prescription, lab role before result completion, pharmacist before dispense.
3. Ensure audit write and business write succeed or fail together for critical actions.

### Phase 4 - Abuse resistance and privacy minimization

1. Replace fixed polling with realtime/manual refresh and backoff.
2. Add server-side pagination/search for patient registry and audit search.
3. Minimize selected fields in list views.
4. Harden offline sync with schema validation and correct per-record routing.
5. Restrict CORS to approved domains.

## Production Deployment Blockers

- Critical: role assignment can be derived from user-editable auth metadata through `public.handle_new_user()`.
- Critical: internal `SECURITY DEFINER` functions in `public` are callable by `anon`.
- Critical: broad `authenticated` RLS policies allow cross-role clinical read/write access.
- High: admin role changes and user deletion are direct browser table mutations.
- High: patient updates can touch broad patient fields without server-side column protection.
- High: `send-followup-reminders` appears publicly invokable while using service role and SMS side effects.
- Medium: leaked-password protection is disabled.
- Medium: audit logging is incomplete/non-durable for privileged workflows.

## Verification Gaps

- This audit did not change code or database state.
- Public signup status and Edge Function JWT verification deployment flags were not modified or tested because that would affect production configuration.
- Insert/update/delete role smoke tests were not run because they would require controlled test data or transactional test harnesses. The matrix above is based on deployed policy catalog inspection.
- Storage policies were not assessed because no storage bucket usage was found in the reviewed application source.
