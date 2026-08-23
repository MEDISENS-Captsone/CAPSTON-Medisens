# FHSIS Phase 9 — Workflow, UAT, and Verification Record

## Scope

This is the implementation-aligned record for the MediSens monthly **M1 BRGY**
workflow. It documents the Nurse/Midwife workflow, the canonical form contract,
the Phase 8 runtime evidence, and the focused UAT cases. It does not replace
the source images or introduce another form definition.

The canonical implementation is `src/features/fhsis/templates/m1-brgy/v1.ts`.
Its source pages are `docs/FHSIS/IMG_9233.JPG` through `IMG_9239.JPG`; its
stored template identity is `m1-brgy` / `v1`.

## Implemented ownership and lifecycle

| Role | Implemented responsibility | Prohibited action |
| --- | --- | --- |
| Nurse | Creates one monthly report for a reporting context, encodes the official indicators, saves/resumes, corrects a returned report, and submits it. | Cannot verify; cannot edit while `for_verification` or after `verified`. |
| Midwife | Opens Nurse-submitted reports read-only, reviews findings, returns with a required reason, or verifies. | Cannot create a report or modify encoded values. |
| BHW | Has no new monthly-report navigation or data-write access. | Cannot create reports, submit, review, return, or verify. |

The only report states are `draft`, `for_verification`, `returned`, and
`verified`:

```text
draft -> for_verification -> returned -> for_verification -> verified
```

Each report represents one monthly M1 BRGY reporting context, not independent
submissions for individual programs. The context stores reporting month,
barangay, BHS, municipality/city, province, projected population, and template
version. The database uniqueness rule covers report type, reporting month,
barangay, and BHS.

## M1 BRGY form contract

The guided interface renders the verified versioned template rather than
inventing a simplified census form. It retains the source form's indicator
wording, section order, subgroup order, input dimensions, and declared derived
totals. The seven top-level sections are:

1. Family Planning Services for Women of Reproductive Age
2. Maternal Care and Services
3. Child Care and Services
4. Oral Health Care Services
5. Non-Communicable Diseases
6. Environmental Health and Sanitation
7. Communicable Diseases and Vital Statistics

Supported official layouts include age-based, sex-based, age-and-sex,
simple-total, and declared-derived-total tables. Blank data is stored as
`NULL`; an entered `0` remains an intentional zero; negative counts are
rejected; and declared totals are calculated rather than edited. CSV and print
output use the stored template version, form metadata, official order, stored
values, and derived totals.

## Phase 8 runtime and RBAC evidence

The linked project received the corrective migration
`20260823175420_fix_fhsis_transition_guard_coalesce.sql`. It replaces the
invalid `pg_catalog.coalesce(...)` invocation in the report-transition trigger
with SQL `coalesce(...)`; before this correction, Nurse submission failed with
SQLSTATE `42883`. The linked migration dry run subsequently reported the
database up to date.

The final hardening migration
`20260823180347_enforce_fhsis_submit_required_manual_values.sql` adds a
versioned, server-only manifest of the 1,212 required manual `m1-brgy`/`v1`
field pairs and makes `submit_fhsis_report` reject missing or `NULL` values.
Derived dimensions are deliberately absent from that manifest, so the backend
does not duplicate or persist derived-total formulas.

Authenticated dedicated-account checks produced the following results:

| Check | Result |
| --- | --- |
| Nurse creates draft; saves explicit `0`; preserves blank as `NULL` | Pass |
| Negative value | Rejected by database constraint (`23514`) |
| Nurse verification | Denied (`42501`) |
| Nurse submit; returned report edit; resubmit | Pass |
| Nurse edit during `for_verification` or after `verified` | RLS returned no writable rows |
| Midwife create/edit values | Denied; creation returned `42501`, value update had no writable rows |
| Midwife review, return with reason, then verify | Pass |
| Midwife verify a returned or previously handled report | Rejected (`22023`) |
| BHW create and submit RPC | Denied (`42501`) |
| BHW reads of new monthly-report tables | No visible rows under RLS |
| Legacy `fhsis_logs` read regression | Pass for Nurse, Midwife, and BHW; 28 legacy rows were visible |

The in-app browser was unavailable during Phase 8, so the visual BHW direct
hash/URL check was not executed. This is distinct from the live database RBAC
denial above.

## UAT cases

Use a dedicated, synthetic reporting context. Do not use real patient data.

| ID | Actor | Preconditions | Steps | Expected result |
| --- | --- | --- | --- | --- |
| FHSIS-UAT-01 | Nurse | Signed in as Nurse; unused monthly context. | Create an M1 BRGY draft; reopen it from history. | One context-bound draft opens; it can be resumed without a duplicate report. |
| FHSIS-UAT-02 | Nurse | Draft open. | Enter representative values from an age-group table, a sex table, an age-and-sex table, and a simple-total table; enter `0` once and leave another required input blank. | Values save; zero remains zero; blank remains unencoded; declared totals are read-only. |
| FHSIS-UAT-03 | Nurse | Draft with missing required values. | Open Review & submit; use Go to field for a blocking finding; attempt direct submission; complete all required manual values and submit. | UI validation blocks submission; the RPC independently rejects incomplete reports with `22023`; successful submission changes status to `for_verification` and locks inputs. |
| FHSIS-UAT-04 | Midwife | A Nurse-submitted report exists. | Open it from Verification Queue; inspect several sections and findings. | Values and derived totals are read-only; no manual encoding action is available. |
| FHSIS-UAT-05 | Midwife then Nurse | Submitted report exists. | Return it with a reason and optional note; sign in as the Nurse; correct and resubmit. | Return reason is required; status becomes `returned`; Nurse sees the reason, can edit, and can resubmit. |
| FHSIS-UAT-06 | Midwife | Valid submitted report exists. | Verify once; attempt a second verify. | First action sets `verified`, verifier, and timestamp; normal value editing is locked; stale verify is rejected. |
| FHSIS-UAT-07 | BHW | Signed in as BHW. | Inspect navigation; attempt an FHSIS hash/URL; call new-report create/submit through the Data API test harness. | No new FHSIS navigation or usable workspace; create/submit are denied by the database. Record the visual hash result separately when browser QA is available. |
| FHSIS-UAT-08 | Nurse/Midwife/BHW | Existing legacy vaccination/history records. | Open the relevant existing vaccination/history consumer and perform its approved regression check. | Legacy `fhsis_logs` data and approved vaccination behavior remain available; no new monthly report workflow is substituted for legacy records. |

## Completion assessment

Phase 9 documentation and UAT alignment are complete when this record and the
UAT regression checklist are reviewed together. The role descriptions, test
cases, form contract, migration correction, and verified runtime evidence above
match the implemented workflow.

The complete required-field set is now also enforced by the submission RPC. One
follow-up remains before making a broader browser-complete claim:

- Run the BHW direct-hash/URL visual check in an available authenticated
  browser session.
