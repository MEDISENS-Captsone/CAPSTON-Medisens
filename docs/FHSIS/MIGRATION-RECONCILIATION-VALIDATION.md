# Migration Reconciliation Validation Record

## Scope and controls

This record is for validating the 23 pre-Phase-2 local migrations against an
isolated restored copy of the linked database. It is not authorization to run
`migration repair`, `db push`, or any DDL. Keep the legacy `public.fhsis_logs`
table and its confirmed consumers intact.

Use the current local file checksum below. Any checksum change invalidates that
migration's validation result and requires a new review.

**Status values:** `Not started`, `Pass`, `Fail`, `Manual review`, `Approved for
staging reconciliation`, `Approved for linked reconciliation`, `Rejected`.

## Required snapshot evidence

Attach or link these immutable artifacts before marking any row approved:

- linked-project reference, UTC capture time, CLI version, Git commit, and
  `migration list --linked` output;
- verified restore of a recoverable database backup into isolated staging;
- schema/catalog export covering tables, columns, defaults, constraints,
  indexes, sequences, RLS flags, policies, grants, functions, and triggers;
- aggregate-only evidence for data-affecting migrations; and
- a reviewer decision for every policy overlap, supersession, and manual-review
  item.

## Standard verification queries/checks

Run these against staging, adapting the object names listed in each row.

| Check | Required evidence |
| --- | --- |
| `T` table shape | `pg_class`, `pg_attribute`, `pg_constraint`, `pg_indexes`; compare schema, types, nullability, defaults, constraints, and indexes. |
| `R` RLS and policies | `pg_class.relrowsecurity` / `relforcerowsecurity`, then `pg_policies`; compare command, roles, `qual`, and `with_check`. Confirm no overlapping policy widens access. |
| `F` functions and grants | `pg_get_functiondef`, `pg_get_function_identity_arguments`, `pg_proc.prosecdef`, `proconfig`, and `information_schema.routine_privileges`; compare body, security mode, fixed `search_path`, owner, grants, and revokes. |
| `G` triggers | `pg_trigger` and `pg_get_triggerdef`; compare target relation, timing/events, enabled state, and bound function. |
| `D` data effect | Approved aggregate-only counts/invariants before and after restore; document why the check proves the migration's intended backfill without exposing patient data. |
| `S` supersession | Verify both the original dependency and named replacement; document why current state is sufficient or retain `Manual review`. |

## Per-migration validation register

| Migration | SHA-256 | Bucket | Expected objects/effects | Verification checks | Supersession notes | Approval status |
| --- | --- | --- | --- | --- | --- | --- |
| `20260714091118_harden_patient_consent_rls.sql` | `561971add0aaa6e019d489b42d12bd64acbb59acd7683ef8ee582e06038a8eb1` | Manual review | `patient_consent` RLS; care-team SELECT; original Midwife write policies. | R | Write policies replaced by `20260804090000`; prove ordered replacement. | Not started |
| `20260714100027_protect_patient_archive_fields.sql` | `e3753d7ad6a3547c137798063b074107af19c41e16d04a15e8afc0f67171e576` | Safe candidate | Patient archive-field update protection function/trigger and staff UPDATE policy. | R, F, G, T | No known replacement. | Not started |
| `20260714130331_harden_initial_consultation_vital_sign_rls.sql` | `1052f61a1d370f4d9861c367f583e2818fba7bf9d216011ba7e1d48256664b7d` | Safe candidate | RLS and Nurse/Doctor clinical policies on `initial_consultation` and `vital_sign`. | R | Policies are restored/revalidated by `20260810115857`. | Not started |
| `20260714132112_harden_consultation_follow_up_rls.sql` | `8ec257ce9da6ef7b5fb25a080359e9c6d04b800fa7695b4f94062fc4a20cd9c3` | Safe candidate | RLS and clinical policies on `consultation` and `follow_up`. | R | Restrictive policies restored by `20260810115857`. | Not started |
| `20260714140402_harden_laboratory_prescription_rls.sql` | `c18c0feb4576eff3a33320f5bb990065a028e1ba312315165510256c3f3d0248` | Corrective migration required | Lab/prescription RLS, restrictive policies, and dispensing guard trigger. | R, F, G | Overlapping legacy policies remain; do not reconcile until an approved additive-correction decision exists. | Not started |
| `20260716000000_harden_fhsis_logs_rls.sql` | `5fcf01a98129b474867e5ca470e9e5de95b8e21d5cb740f1b58a2b38cbeeb671` | Corrective migration required | `fhsis_logs` RLS and verb-specific SELECT/INSERT/UPDATE policies. | R | Phase 2 removes the two broad read policies; preserve legacy table/consumers. | Not started |
| `20260716082840_harden_prescription_dispensing_transitions.sql` | `a088b1084a5fd1e3e61c25811f7d204ea5f7a100a12ae549824ce37fbb7cbf2b` | Safe candidate | Final prescription dispensing guard and trigger. | F, G, R | Replaces earlier guard form from `20260714140402`. | Not started |
| `20260716084759_harden_laboratory_state_transitions.sql` | `6421dc0c2f814c5ea876b4c5a4e4ccc322e6f6976835b8da2230413dbd9e1a7c` | Safe candidate | Lab request/result transition and completion functions/triggers. | F, G | No known replacement. | Not started |
| `20260716091404_harden_consultation_follow_up_integrity.sql` | `5f5df9d09b3096ff96bd8e1b9283f821b118a5f4ca23b213da18b42a02d1914e` | Manual review | Consultation/follow-up integrity functions and triggers. | F, G, S | Consultation guard replaced by `20260810122022`; prove final behavior accounts for it. | Not started |
| `20260716123320_analytics_barangay_distribution.sql` | `a8ddab8f54d131d94c95ae3422829398c6e25afc19ebe380c7d86569c4b4cf3b` | Safe candidate | Barangay-distribution analytics RPC and restricted execution. | F | No known replacement. | Not started |
| `20260716140907_analytics_barangay_drilldown.sql` | `88ba3948bf41347009f92fc3e6b1b6832ca8e9c7e07be967f7bb277e1b90bb96` | Manual review | Initial barangay-drilldown analytics RPC. | F, S | Replaced by `20260716154404`; validate final function and grants. | Not started |
| `20260716142646_analytics_barangay_heatmap.sql` | `044ff008c249be3b7cbdbb79105eed9f57b94e01ff2d47c807317de8acafa129` | Safe candidate | Barangay-heatmap analytics RPC and restricted execution. | F | No known replacement. | Not started |
| `20260716154404_fix_barangay_drilldown_registration_timestamp.sql` | `1fe61571b4ebfe7daa8b4834ded9655917fd811c67fdea1049555ef9b6e234fd` | Safe candidate | Final barangay-drilldown RPC and restricted execution. | F | Supersedes `20260716140907`. | Not started |
| `20260716170633_allow_midwife_analytics_access.sql` | `960f802eedfed1ff3863be10a894a7e711ca9e1e955e6ae80b8dfede4aa85a0d` | Manual review | Initial analytics-role helper and grants. | F, S | Replaced by `20260729174949`; validate final role model. | Not started |
| `20260729174949_correct_midwife_clinical_geographic_analytics_access.sql` | `4b71f0150349dfe1650314299307c0e907a3b6188c7884cd23ce0385cf7dea46` | Safe candidate | Final `analytics_private.require_analytics_role` helper and restricted grants. | F | Supersedes `20260716170633`. | Not started |
| `20260729181402_staff_operations_g4b_backend.sql` | `7471e4990841c7033daf9e3cc1e859648c2346d414affb20852eb5278a4f0dab` | Safe candidate | Staff-operations public/private helpers, role guard, and grants. | F | G4B RPC is refined by later migrations. | Not started |
| `20260729190407_correct_staff_operations_g4b_role_totals.sql` | `cd6a7de3ff52e145d45fe741f778c45222be956a3388fe5daa078296d01dfe2d` | Manual review | Intermediate G4B staff-operations RPC. | F, S | Replaced by `20260730133617`; validate final return shape and grants. | Not started |
| `20260730133617_add_staff_operations_period_total.sql` | `ad1954fcb194bba651f68ae72d2314eebc32a2ef370ba811c9e5e08d19078aae` | Safe candidate | Final G4B staff-operations RPC with period total and grants. | F | Supersedes `20260729190407`. | Not started |
| `20260804090000_move_consent_signing_to_bhw.sql` | `803cc0f98091803b9e2b83724a01028cdc27c9c7a049981b03477e94044d900a` | Safe candidate | BHW consent INSERT/UPDATE policies; removes Midwife write policies. | R | Supersedes consent write portion of `20260714091118`. | Not started |
| `20260804090100_add_initial_consultation_visit_status.sql` | `5c41af8a9ecb1ed16f6a93fede059c64ced8e6446a01e3c80298a6e15d473884` | Manual review | `visit_disposition` column, check constraint, guard/trigger, Nurse update policy, historical backfill. | T, R, F, G, D | Data backfill must be evidenced with approved aggregate checks. | Not started |
| `20260804100000_allow_midwife_intake.sql` | `4dd03c5cf53cdd39d2c80031c71154e7eb704dfb9cbda2f852d5e383c353f193` | Safe candidate | Midwife initial-consultation/vital-sign INSERT and disposition UPDATE policies. | R | Required by the later clinical-RLS remediation assertions. | Not started |
| `20260810115857_restore_clinical_restrictive_rls_policies.sql` | `b522b3f59eb5a7b5965bb372a6d77d0c05dfb4a31c1854a9b64704b0a101df22` | Safe candidate | Clinical restrictive policy restoration; RLS/no-client-DELETE assertions. | R | Finalizes policies from `20260714130331` and `20260714132112`. | Not started |
| `20260810122022_remediate_intake_atomicity_and_consultation_fields.sql` | `904417771d05be46ed8c2916aac2e65675e651b7d28cd7e4215c89eab7fc1075` | Safe candidate | Atomic intake RPC, grants, and final consultation-integrity guard. | F, G, R, T | Supersedes consultation guard from `20260716091404`. | Not started |

## Approval gate

Do not change a row to `Approved for staging reconciliation` until all listed
checks pass and the evidence links are attached. Do not change any row to
`Approved for linked reconciliation` until a reviewer has approved the full,
timestamp-ordered set and a linked backup/restore test is documented.

The expected post-reconciliation dry-run state is that only
`20260821184151_add_fhsis_monthly_report_workflow.sql` remains pending. That
dry run is a future approval gate; it does not authorize Phase 2 deployment.
