# MEDISENS Security Roadmap

## Purpose

This roadmap defines SQL-first and application-level security improvements for MEDISENS without changing the approved RHU workflows, role permissions, Supabase integration, database schema, business logic, routes, or Use Case Diagram behavior until implementation is explicitly approved.

The goal is to reduce database overload risk, harden authorization, protect Edge Functions, improve auditability, and keep user-facing errors safe and non-technical.

## Scope Guardrails

- Preserve existing role workflows for Admin, BHW, Nurse, Doctor, Laboratory, Pharmacist, and Midwife.
- Preserve current Supabase Auth, database tables, business logic, and routes until a migration plan is approved.
- Use SQL-first planning before implementation.
- Treat all schema, policy, function, and index changes as migration work requiring review.
- Do not claim official PhilHealth compliance without exact PhilHealth report specifications.

## Current Risk Areas To Address

- Some data access patterns still use broad reads such as `select('*')`.
- Patient-heavy views can grow expensive as records accumulate.
- Role checks exist in application code, but database-level authorization should be hardened as defense in depth.
- Edge Functions need consistent authentication, authorization, rate limiting, and CORS handling.
- Audit logging exists and should become the default security trail for sensitive actions.

## Preventing Supabase And Database Overload

### Query Limits

- Require pagination or explicit `.limit()` on list views.
- Avoid loading all patients, logs, consultations, prescriptions, or FHSIS records into the browser.
- Use count-only queries for dashboard totals where row data is not needed.
- Prefer server-side filtering for date ranges, status, role, barangay, patient name, and record type.
- Set default page sizes:
  - Work queues: 25-50 rows.
  - Patient Records: 25 rows, expandable to 50.
  - Audit Log: 25 rows.
  - Analytics aggregates: date-bounded, no raw patient exports by default.

### Avoiding `select('*')`

Replace broad selects with explicit column lists:

- `patients`: request only identifiers, name, age, sex, address, registration date, and fields required by the current view.
- `consultation`: request only dates, complaints, diagnosis, assessment, and provider fields needed by the screen.
- `lab_request` / `lab_result`: request only request status, dates, patient display fields, test flags, and result summary fields.
- `prescription`: request only prescription date, status, patient name, doctor, and medication content required by the role.
- `audit_logs`: request fields needed for filtering, display, and drilldown.

### Pagination Strategy

- Use `range(from, to)` for list pages.
- Pair pagination with deterministic ordering, usually newest first by `created_at`, `consultation_date`, `request_date`, or role-specific queue order.
- Keep search server-side wherever possible.
- Use indexed columns for filter conditions before enabling large-result pagination.

## Indexing Recommendations

Schema changes required.

Create or verify indexes after measuring query plans. Candidate indexes:

- `patients`
  - `created_at`
  - `lastName`, `firstName` for patient search
  - `address` or barangay-equivalent field if used as a filter
  - archive flags when archiving is implemented
- `profiles`
  - `role`
  - `email`
- `audit_logs`
  - `created_at`
  - `user_id`
  - `user_role`
  - `module`
  - `action`
  - `record_type`
  - composite index for common filters such as `(created_at, module, action)`
- `initial_consultation`
  - `patient_id`
  - `consultation_date`
  - `(consultation_date, consultation_time)`
- `consultation`
  - `patient_id`
  - `initial_consultation_id`
  - `created_at`
  - `diagnosis` only if analytics/search requires it, likely through normalized support later
- `follow_up`
  - `patient_id`
  - `visit_date`
  - `follow_up_status`
- `lab_request`
  - `patient_id`
  - `request_date`
  - `status`
- `lab_result`
  - `patient_id`
  - `labrequest_id`
  - `date_performed`
- `prescription`
  - `patient_id`
  - `status`
  - `prescription_date`
- `fhsis_logs`
  - `patient_id`
  - `category`
  - `created_at`

## Rate Limiting Strategy

Application and Edge Function changes required.

- Add rate limits to sensitive actions:
  - Login attempts.
  - Account creation.
  - Patient registration.
  - Audit log creation.
  - Reminder sending.
  - Report generation and export.
- Prefer server-side rate limiting for Edge Functions and high-risk mutations.
- Track rate limit keys by authenticated user ID, role, IP where available, and function/action name.
- Return non-technical messages such as: `Too many requests. Please wait a moment and try again.`
- Log rate-limit events to `audit_logs` or a dedicated security events table if approved.

## Edge Function Security

Edge Function changes required.

For functions such as user creation, audit logging, and follow-up reminders:

- Require a valid authenticated Supabase session for user-facing functions.
- Validate role authorization inside the function before privileged work.
- Never trust client-provided role values without checking `profiles` or trusted app metadata.
- Keep `service_role` keys only in Supabase function secrets.
- Validate request bodies with explicit schemas.
- Restrict allowed methods.
- Use strict CORS origins when deployment domains are known.
- Return safe user-facing errors and log technical details privately.
- Do not expose stack traces, SQL errors, Supabase internals, or service-role responses.

## Authorization And RLS Hardening

Schema and policy changes required.

- Enable or verify RLS on all exposed `public` tables.
- Use policies aligned with MEDISENS roles, not broad `authenticated` access.
- Avoid using user-editable metadata for authorization.
- Store role authority in trusted server-managed data such as `profiles.role` or Supabase app metadata if later adopted.
- Add explicit policies per table and action:
  - Admin: profile and audit governance according to approved role permissions.
  - BHW: patient registration and FHSIS workflows only.
  - Nurse: initial intake and patient intake queues only.
  - Doctor: consultations, records, history, follow-up, and audit visibility as approved.
  - Laboratory: lab requests and results only.
  - Pharmacist: prescriptions only.
  - Midwife: maternal/child/FHSIS workflows only.
- Ensure update policies include both `USING` and `WITH CHECK`.
- Avoid `SECURITY DEFINER` unless absolutely required; if required, keep functions in a non-exposed schema and revoke public execute access.

## Attack Protection

- Validate all user input at the client and server/database boundary.
- Use allowlists for roles, statuses, modules, actions, and report categories.
- Normalize and sanitize free-text fields before display where rich text is not required.
- Prevent IDOR/BOLA by enforcing role and row-level checks on every patient-linked resource.
- Protect account management actions with Admin-only checks in both UI and backend.
- Avoid exposing internal IDs when a user-friendly record label is enough.
- Keep dependencies pinned through `package-lock.json`.
- Run dependency audits as part of release readiness.

## Safe Error Handling

- Keep user-facing messages professional and non-technical.
- Log technical details to console in development and server logs for Edge Functions.
- Do not display raw Supabase errors, SQL errors, stack traces, or function internals.
- Use consistent fallback copy:
  - `Unable to complete the request. Please try again. If the problem persists, contact the system administrator.`
- Ensure failed writes do not create misleading success messages.

## Secrets Handling

- Never expose service-role, database, SMTP, or function secrets in frontend code.
- Keep frontend environment variables limited to publishable/public values.
- Store Edge Function secrets through Supabase secret management.
- Rotate secrets after exposure or personnel changes.
- Document required secrets in deployment notes without including values.

## Audit Logging

- Keep audit logging for:
  - Login-sensitive access events where available.
  - User creation, editing, deactivation/deletion.
  - Patient registration and updates.
  - Consultation creation and updates.
  - Lab result recording.
  - Prescription dispensing.
  - Report exports.
  - Archive and restore actions when implemented.
  - Rate-limit and authorization denial events if approved.
- Standardize audit fields:
  - actor ID, actor name, actor role
  - action
  - module
  - record type
  - record ID
  - patient ID where relevant
  - safe metadata
  - timestamp

## Implementation Phases

### Phase 1: Query Safety Audit

- Inventory all Supabase queries.
- Replace `select('*')` in high-traffic list and dashboard views.
- Add query limits to list pages.
- Preserve UI behavior and role workflows.

### Phase 2: Pagination And Server-Side Filtering

- Add pagination to Patient Records, Audit Log, and role work queues.
- Move large filters to the database where practical.
- Add empty/loading/error states for paginated results.

### Phase 3: Index Planning And Migration

Schema changes required.

- Capture slow query patterns.
- Create migration for approved indexes.
- Validate with query plans before and after indexes.

### Phase 4: RLS And Authorization Review

Schema and policy changes required.

- Document table-by-table role access.
- Draft policies before applying migrations.
- Test each role with allow and deny cases.

### Phase 5: Edge Function Hardening

Edge Function changes required.

- Add body validation, role verification, strict error handling, and rate limiting.
- Confirm service-role usage is isolated to server-side functions only.

### Phase 6: Security QA

- Perform authenticated role-by-role testing.
- Test unauthorized route access and direct data access attempts.
- Confirm audit logs record sensitive actions.
- Run build and release checks.
