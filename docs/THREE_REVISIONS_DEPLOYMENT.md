# Three revisions: deployment status

Verified 16 October 2026 (Asia/Manila).

## Deployed backend

- Supabase project: `sdtaotbklrienpvicdte` (the existing Medisens project).
- Applied only the `consultation_photos_patient_csv_import` migration. The remote
  migration history assigned version `20261015160248`; the reviewed local source
  is `20261015152856_consultation_photos_patient_csv_import.sql`. Do not apply it twice.
- Deployed only `import-patients`, version 1, active, with JWT verification enabled.
- Confirmed the consultation-photo bucket is private, has the expected MIME/size
  restrictions, and metadata RLS is enabled.
- Confirmed the import RPC is executable by `service_role` and denied to `anon`
  and `authenticated`.
- Existing patient-insert policies, existing record encryption service, existing
  staff accounts/roles, Auth configuration, and unrelated database objects were
  not modified.

## Live synthetic-data verification

Result: **33 checks passed, zero failed, one existing account unavailable**.
Six of the passes are successful existing test-account logins; the remaining 27
cover the feature requests against the real deployed Supabase APIs.

- All four clinical roles: CSV preview, invalid-date rejection, same-file duplicate
  detection, encrypted import, patient consent remaining false, and duplicate
  rejection on a second commit.
- Anonymous, admin and pharmacist import access denied; a clinical user cannot
  call the service-only RPC directly.
- All four clinical roles: missing photo consent rejected, wrong-patient attachment
  rejected, upload accepted, completion accepted, and downloaded bytes match the
  synthetic image.
- Public photo URLs do not serve the image. All four clinical roles can view a
  different uploader's photo. Admin and pharmacist cannot retrieve the metadata
  or image bytes.
- Another staff member cannot delete an uploader-owned photo. Each uploader can
  remove their own photo and metadata.
- Confirmed eight photo lifecycle audit events (four completions, four removals)
  and twelve CSV preview/commit audit events for this test run.
- Laboratory's existing test login was unavailable. No password/account changes
  or repeated credential guesses were performed. Its live HTTP role tests were
  therefore not run; local RLS tests already cover the stored `labaratory` role.

Synthetic run marker: `REV3_1792080386379`.
Patient IDs 201–204, consultation 89, and all four test photos/metadata were removed
after verifying their marker and ownership. Cleanup readback confirmed no fixtures
remain and the patient count returned to 53. Audit evidence was retained. Removed
synthetic fixtures can be regenerated with the opt-in live-test script.

The live-test source is `tests/revisions-live.mjs`; sanitized run output is under
ignored `test-results/revisions-live/evidence.json`. It reads credentials from
environment variables and does not persist tokens or passwords.

The Supabase security-advisor categories/counts match the pre-deployment baseline;
there are no findings for the new objects. Existing unrelated findings were not
modified as part of this task.

## Earlier frontend blocker (resolved; superseded below)

The current Vercel CLI login is `notsxfe19-6114`, team `pacnars`. That team lists
only a Kanban project. It cannot access `medisens.vercel.app`. The user confirmed
that the wrong account is signed in. A Vercel connection was offered as another
way to provide access; it has not been confirmed connected.

The live Medisens login page also contains a patient-portal entry and assets absent
from the local checkout. The local Git remote's `main` matches local HEAD
`78477e7e54218c26ae8f039d2811938f46128e3e`, but that is not sufficient evidence
that it matches the currently deployed production source. No frontend was deployed,
no new Vercel project was created, and no Git commit/push was made.

To resume: sign in to the Vercel account/team that owns Medisens and identify the
current production source repository/branch or deployment. Reconcile only these
three revision changes against that source, verify the scoped diff, deploy the
frontend, then test the three revisions through the actual Medisens interface.
The current local build and isolated UI tests remain passing; they do not establish
that the frontend revisions are live.

## Frontend deployment update - 16 October 2026

After the user corrected the Vercel login, the previous deployment identified the
actual production repository as `MEDISENS-Captsone/CAPSTON-Medisens`, base commit
`80dc04b001fbdf93b799f780bfb14fa8b5ab27cc`. The older `medisens_project_stage`
checkout is not that source and was NOT deployed.

Only the three revisions were ported into the sibling
`medisens_production_revision` checkout of that exact production commit. The
tracked-source diff is six integration files, 21 insertions and eight deletions;
the new files are the two feature components, CSV parser/re-export and photo
preparation helper. Existing patient portal, shared styles, login, offline
features, dependencies and consultation save/navigation handlers are unchanged.

The production-source build passed. TypeScript comparison reports seven errors
in the unchanged production baseline, seven in the revised source, and zero new
diagnostics. Those unrelated baseline errors and existing dependency advisories
were left untouched. `git diff --check` passed.

Vercel team: `medisens-capstone`; existing project: `medisens`
(`prj_QSV8n9iIthGCQ9FglJch9Z132KAT`). Deployment
`dpl_CTkmFgte4tesAAgR1MjD2ezuRS59` was built as a candidate, tested against the
real backend using the exact production-source checkout, and promoted to
`https://medisens.vercel.app`. Vercel readback confirmed that the main URL resolves
to this Ready deployment. No new project, environment change, protection change,
Git commit or Git push was made. The source revisions remain local and must be
included in the source repository before a future Git-driven redeployment.

The pre-promotion real-backend browser run passed all 15 checks: existing login
and patient portal entry, four role logins, four complete CSV workflows, four
photo consent/upload/enlarge/remove workflows, all six consultation Next actions,
and import dialog layout/focus checks at four viewport sizes. No page runtime
errors occurred. This exercised existing draft-save behavior without completing
a consultation or creating lab requests, prescriptions or follow-ups.

Local UI run marker: `REV3UI_1792087321589`. Its patients 206-209, consultation 90,
and four photos/metadata were removed after exact-marker checks. Readback showed
zero remaining fixtures and 53 patients. An earlier interrupted test's patient
205 was also removed after matching marker `REV3UI_1792087237269`; its failure
was an ambiguous test selector, not an application defect. Audit events remain.

Post-promotion production browser verification passed all 15 checks, with zero
page runtime errors, at `https://medisens.vercel.app`. Run marker:
`REV3UI_1792087575814`, completed `2026-10-15T18:07:48.487Z` (16 October locally).
Patients 210-213, consultation 91, and four photos/metadata were removed after
exact-marker verification; audit events were retained. No real patient records
were edited or removed. Removed synthetic fixtures can be regenerated by rerunning
the opt-in test. Source: `tests/revisions-frontend-live.mjs`; ignored
`test-results/frontend-production` contains timestamped manifests and screenshots.
Credentials are supplied through the environment and are not stored in evidence.

The canonical production checkout also contains exact copies of the deployed
import Edge Function, encryption helper and migration source for reproducibility.
Do not reapply the migration: its remote version is recorded above. The canonical
checkout's package files remain unchanged; browser-test tooling stays in the
older staging checkout and was not shipped as a new runtime dependency.

Final cleanup readback: 53 total patients (the pre-test total), zero `REV3UI_`
patients/consultations, zero test photo metadata and zero test storage objects.

## GitHub handoff

The user subsequently authorized committing these revisions to a new branch:
`codex/medisens-three-revisions`. This handoff includes only the scoped application
changes, their deployed backend source and this deployment report. The earlier
no-commit/no-push statements describe deployment-time status, not this handoff.
Existing branches are not merged or rewritten, and the migration must not be
applied again to the already-updated production database.
