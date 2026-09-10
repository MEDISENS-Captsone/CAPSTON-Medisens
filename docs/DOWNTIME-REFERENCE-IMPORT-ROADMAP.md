# MediSens Downtime Reference Import Roadmap

## Purpose

This file is the working plan for completing the MediSens **Downtime Reference Import** fallback feature.

Codex should read this file before working on any phase.

The goal is to let the team use short prompts such as:

> Read `DOWNTIME-REFERENCE-IMPORT-ROADMAP.md` and proceed with Phase 1 only.

Codex must stop after the requested phase unless explicitly told to continue.

---

# Feature Context

MediSens is a cloud-based healthcare information system.

During a **prolonged internet outage**, the RHU cannot reliably continue the full BHW → Nurse → Doctor → Laboratory/Pharmacy digital handoff because the roles depend on the central Supabase database.

The fallback process will therefore be:

1. Internet becomes unavailable for a prolonged period.
2. RHU staff temporarily return to their existing paper-based workflow.
3. Patient care continues using paper records.
4. At the end of the outage or day, completed paper records are gathered.
5. A designated authorized **Nurse / IT Nurse encoder** transfers the downtime records into a standardized Excel workbook.
6. The workbook is uploaded to MediSens through **Downtime Reference Import**.
7. MediSens validates the entries before anything is inserted.
8. Valid records are imported into the correct MediSens records/tables.
9. Imported records preserve the real service date/time and responsible clinical staff.
10. The system records who performed the import and when it was imported.

The Nurse / IT Nurse is the **encoder/importer only**. They must not become the clinical author of Doctor diagnoses, Laboratory results, prescriptions, or other role-owned clinical information.

---

# Core Principles

- Do not claim that MediSens supports full cross-role digital processing while the RHU is completely offline.
- Do not build a local RHU server/LAN architecture for the current version.
- Full local-server offline operation may be documented as a future enhancement.
- Do not bypass existing RBAC, RLS, RPCs, Edge Functions, audit logging, or workflow validation.
- Do not use real patient data during development/testing.
- Do not modify remote Supabase unless explicitly approved.
- Do not run `supabase db push --linked` from a checkout containing the reconstructed baseline unless remote migration-history reconciliation has been explicitly approved.
- Preserve the existing Phase 0 containment of the unsafe legacy `MediSensDB/offline_patients` mechanism.
- Preserve existing Nurse Intake security work unless the requested phase specifically requires changes.
- Prefer small, reviewable changes.
- Do not commit or push unless explicitly requested.

---

# Important Import Metadata

Every imported downtime encounter should preserve at least:

- **Downtime Reference**
- **Source:** Paper Downtime Record
- **Actual Service Date**
- **Actual Service Time**
- **Imported Date/Time**
- **Imported By**
- **Responsible Clinical Staff**, where applicable
- **Import Status**
- **Audit Trail**

Example:

```text
Downtime Reference: DT-20260910-001
Source: Paper Downtime Record
Actual Service Date/Time: 2026-09-10 10:25 AM
Imported By: Nurse / IT Nurse
Imported At: 2026-09-10 05:40 PM
Diagnosis By: Responsible Doctor
```

The importer must not be recorded as the Doctor/Laboratory/Pharmacy author unless they were actually the responsible staff member.

---

# Proposed Excel Concept

The exact workbook structure must come from the real MediSens schema and forms, not assumptions.

Likely structure:

- `Encounters`
- `Initial Intake / Vitals`
- `Doctor Consultation`
- `Laboratory`
- `Prescription`
- `Follow-up` if approved for the first version

All sheets should be connected using the same **Downtime Reference**.

Example:

```text
DT-20260910-001
```

Do not finalize these sheets until Phase 1 confirms the actual fields and relationships.

---

# Phase 1 — Finalize Import Specification

## Goal

Audit the current MediSens schema, forms, services, RPCs, and workflows and produce the exact specification for Downtime Reference Import.

## Review

Inspect the real implementation for:

- Patient records
- Initial Consultation / Vitals
- Doctor Consultation
- Follow-up
- Laboratory
- Prescription
- Related encounter/workflow data
- Existing audit logging
- Existing role/staff attribution
- Existing date/time fields
- Existing status fields and workflow relationships

## Deliverables

Define:

- Exact Excel sheet names
- Exact columns per sheet
- Required vs optional fields
- Data type per field
- Relationships between sheets
- Downtime Reference format
- Responsible staff attribution rules
- Which fields come from paper records
- Which system fields should be generated automatically
- Which workflows are safe for Version 1
- Which workflows should be deferred

## Acceptance Criteria

Phase 1 passes when:

- Every proposed Excel column maps to a verified MediSens field or clearly defined import-only metadata.
- Relationships between Patient, Intake, Consultation, Lab, Prescription, etc. are documented.
- No field is invented from assumptions.
- Version 1 scope is clearly defined.
- No code or migration changes are made.

---

# Phase 2 — Create the Standard Excel Template

## Goal

Create the actual standardized `.xlsx` workbook based on the approved Phase 1 specification.

## Requirements

The workbook should:

- Use multiple sheets when necessary.
- Use a shared Downtime Reference.
- Clearly mark required fields.
- Use dropdowns where appropriate.
- Use proper date/time and numeric formats.
- Avoid complicated formulas unless necessary.
- Be easy for a designated encoder to fill quickly.
- Include short instructions.
- Preserve clinical attribution fields.
- Avoid storing system secrets or technical identifiers the encoder should not manage manually.

## Deliverables

- Final `.xlsx` template
- Field guide / data dictionary
- Sample synthetic rows
- Rules for creating Downtime Reference values

## Acceptance Criteria

- Template matches the approved specification.
- Synthetic sample encounter can be represented completely.
- Multiple prescriptions or other one-to-many records are supported where required.
- No real patient data is included.

---

# Phase 3 — Define and Implement Import Validation

## Goal

Validate the workbook before any database write.

## Validation Areas

At minimum review:

- Workbook format/version
- Required sheets
- Required columns
- Downtime Reference uniqueness
- Patient matching
- Existing vs new patient rules
- Archived/inactive patient handling
- Required fields
- Numeric values
- Date/time values
- Valid clinical relationships
- Responsible staff identity/role
- Duplicate encounters
- Duplicate prescriptions/lab records
- Conflicting existing records
- Invalid workflow state
- Unsupported services
- Blank or malformed rows

## Expected Validation Statuses

Use clear statuses such as:

- `READY`
- `ERROR`
- `DUPLICATE`
- `CONFLICT`
- `SKIPPED`

## Acceptance Criteria

- Invalid data never reaches the import/write stage.
- Errors point to the exact sheet/row/field.
- Duplicate detection is deterministic.
- Validation does not require real patient data.

---

# Phase 4 — Build the Nurse-Side Import UI

## Goal

Create a simple import experience for the authorized Nurse / IT Nurse.

## Suggested Flow

```text
Upload Excel
→ Preview
→ Validate
→ Review Errors / Duplicates
→ Confirm Import
→ Import Summary
```

## UI Requirements

- Clear `Downtime Reference Import` page title.
- File upload area.
- Template/version detection.
- Preview of encounters.
- Per-record validation status.
- Error details.
- Ability to cancel before import.
- Confirm step before database writes.
- Final import summary.
- Clear count of Imported / Skipped / Failed / Duplicate.
- No need to navigate through BHW → Nurse → Doctor pages individually.

## Acceptance Criteria

- Encoder can understand what will be imported before confirming.
- Invalid rows are visibly blocked.
- UI does not imply the importer performed all clinical actions.
- No database write occurs before confirmation.

---

# Phase 5 — Implement Backend Import Logic

## Goal

Convert validated downtime workbook entries into the correct MediSens records.

## Requirements

- Use server-authorized logic for sensitive writes.
- Preserve existing clinical workflow integrity.
- Preserve the actual service date/time.
- Record import date/time separately.
- Record importer identity.
- Preserve responsible Doctor/Lab/Pharmacy/etc. attribution.
- Create appropriate relationships between imported records.
- Prevent duplicate Downtime Reference imports.
- Use transactional behavior where appropriate.
- Avoid partial, inconsistent encounters.
- Produce a clear import result for each encounter.

## Important

The importer must not gain unrestricted ability to directly impersonate another role.

Any cross-role historical import capability must be explicitly validated and audited by trusted server-side logic.

## Acceptance Criteria

- Valid synthetic workbook creates the expected records.
- No duplicate records on retry.
- Failed encounter does not silently create partial clinical state.
- Imported records are distinguishable from normal live records.

---

# Phase 6 — Security and Audit Hardening

## Goal

Ensure Downtime Reference Import cannot bypass MediSens security.

## Review

- RBAC
- RLS
- Server-side authorization
- RPC/Edge Function permissions
- Clinical attribution rules
- Audit logging
- Duplicate/idempotency controls
- Tampered Excel values
- Unauthorized staff identifiers
- Archived patients
- Inactive users
- Importer permissions
- Sensitive error messages
- Batch size/abuse limits if needed

## Audit Requirements

Record:

- Who imported
- When
- Source = Paper Downtime Record
- Downtime Reference
- Actual service date/time
- Responsible clinical staff
- Result/status
- Relevant imported record IDs

## Acceptance Criteria

- Only approved role/account can import.
- Import cannot bypass role/workflow validation merely because it comes from Excel.
- Tampered or unauthorized staff attribution is rejected.
- Audit trail is sufficient to trace the recovery event.

---

# Phase 7 — Runtime and Functional Testing

## Goal

Test realistic import scenarios with synthetic data.

## Test Cases

At minimum:

- One valid patient encounter
- Multiple valid encounters
- Existing patient
- Unsupported/new patient scenario
- Missing required field
- Invalid vital sign format/value
- Invalid date/time
- Unknown patient
- Archived patient
- Duplicate Downtime Reference
- Duplicate clinical record
- Multiple prescriptions
- Laboratory data if included
- Follow-up if included
- Invalid responsible staff
- Wrong role attribution
- Partial workbook
- Bad workbook format
- Retry after failure
- Medium/large batch
- Import interrupted before confirmation
- Import failure during write
- Audit Log verification

## Acceptance Criteria

- All critical scenarios have PASS/FAIL evidence.
- Failed imports do not corrupt clinical data.
- Retry does not create duplicates.
- Existing online workflows still work.

---

# Phase 8 — Final UX and Error Handling

## Goal

Polish the encoder experience after runtime testing.

## Requirements

- Clear statuses
- Clear field-level errors
- Clear duplicate/conflict explanation
- Good loading states
- Prevent double-submit
- Confirmation before import
- Useful final summary
- `Save/Export Error Report` only if safe and needed
- Responsive layout for the actual RHU device
- Keyboard-friendly workflow where practical

## Acceptance Criteria

- Encoder can process a batch without technical knowledge.
- Errors are understandable and actionable.
- No misleading success messages.

---

# Phase 9 — Final End-to-End QA

## Goal

Prove the complete fallback process.

## Simulation

```text
Internet outage
→ RHU paper process
→ Gather paper records
→ Encode standardized Excel workbook
→ Upload
→ Preview
→ Validate
→ Resolve errors
→ Confirm import
→ Verify patient records
→ Verify clinical attribution
→ Verify actual service timestamps
→ Verify Audit Log
→ Verify duplicates are prevented
```

## Final Acceptance Criteria

The feature can be considered complete when:

- Standard workbook is finalized.
- Valid batch imports correctly.
- Invalid batch is blocked safely.
- Duplicate imports are prevented.
- Responsible staff attribution is preserved.
- Actual service time and import time are distinct.
- Audit logging works.
- Existing MediSens workflows are not broken.
- Security review passes.
- Runtime tests pass.
- Thesis/documentation matches implementation.
- Known limitations are documented.

---

# Current Status

Use this section as the phase tracker.

| Phase | Status |
|---|---|
| Phase 1 — Import Specification | NEXT |
| Phase 2 — Excel Template | NOT STARTED |
| Phase 3 — Validation | NOT STARTED |
| Phase 4 — Import UI | NOT STARTED |
| Phase 5 — Backend Import | NOT STARTED |
| Phase 6 — Security/Audit | PASS — local authenticated RLS/runtime verification completed |
| Phase 7 — Runtime Testing | PASS — local synthetic RPC/RLS scenarios completed; deferred V1 services marked N/A |
| Phase 8 — UX/Error Handling | PASS — encoder statuses, confirmation, server summary, and failure-preserving UX refined |
| Phase 9 — Final End-to-End QA | PASS — local synthetic fallback simulation completed; remote/browser QA remains outside this local run |

Update this table after each approved phase.

---

# How Codex Should Work

When instructed to proceed with a phase:

1. Read this file.
2. Read `CLAUDE.md` and relevant repository documentation.
3. Inspect the actual current implementation before changing code.
4. Work only on the requested phase.
5. Preserve existing security and business logic unless the phase explicitly requires a reviewed change.
6. Run appropriate checks.
7. Report:
   - What changed
   - Files changed
   - Tests/checks performed
   - PASS/FAIL
   - Remaining blocker or next phase
8. Stop after the requested phase.

Do not continue automatically into the next phase.

---

# Short Prompt Examples

## Phase 1

```text
Read DOWNTIME-REFERENCE-IMPORT-ROADMAP.md and proceed with Phase 1 only.
Stop after the specification report.
```

## Phase 2

```text
Read DOWNTIME-REFERENCE-IMPORT-ROADMAP.md and proceed with Phase 2 only using the approved Phase 1 specification.
```

## Phase 3

```text
Read DOWNTIME-REFERENCE-IMPORT-ROADMAP.md and proceed with Phase 3 only.
Do not continue to the UI or backend import phase.
```

## Continue After a Blocker

```text
Read DOWNTIME-REFERENCE-IMPORT-ROADMAP.md.
Continue the current phase from the last verified blocker only.
```

## Final QA

```text
Read DOWNTIME-REFERENCE-IMPORT-ROADMAP.md and run Phase 9 only.
Report PASS/FAIL per acceptance criterion.
```
