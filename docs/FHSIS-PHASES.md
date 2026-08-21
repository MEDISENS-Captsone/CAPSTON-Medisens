# MediSens FHSIS Refactor — Implementation Phases

## Purpose

Refactor the current MediSens FHSIS workflow so that the **Nurse directly encodes the official monthly FHSIS M1 Barangay report inside MediSens**, while the **Midwife acts as the final reviewer and verifier**.

The end state must eliminate the normal need to encode FHSIS values in a separate Excel sheet or separate Census Entry workflow before transferring them into MediSens.

This plan is intentionally scoped to the **Nurse + Midwife FHSIS workflow**. Do not redesign unrelated MediSens modules.

---

## Recommended Model

Use the **strongest available Codex reasoning model** with high reasoning effort for:

- Supabase schema design
- RLS and role restrictions
- workflow-state transitions
- migration of legacy FHSIS behavior
- official FHSIS template modeling
- export integrity

Use normal/medium reasoning for isolated UI implementation once the architecture is verified.

---

# Locked Product Decisions

These decisions are requirements for this refactor.

## Role ownership

### Nurse

The Nurse is the **FHSIS encoder**.

The Nurse can:

- open or create the monthly FHSIS report
- directly encode official FHSIS indicator values in MediSens
- save and resume a draft
- correct a report returned by the Midwife
- run validation
- review the report before submission
- submit the report for verification
- view report history and status
- view verified reports
- export/print verified reports if the final permission model allows it

The Nurse cannot:

- perform final verification
- verify their own report
- edit a report while it is `for_verification`
- edit a verified report through the normal workflow

### Midwife

The Midwife is the **final FHSIS reviewer and verifier**.

The Midwife can:

- view reports submitted for verification
- review the same official FHSIS indicators in read-only mode
- review validation findings
- add reviewer notes
- return a report for correction with a reason
- verify a complete and acceptable report
- view verified report history
- export/print verified reports

The Midwife cannot:

- manually encode a new monthly FHSIS report
- edit Nurse-entered FHSIS indicator values
- silently correct values during review
- verify an incomplete/invalid report unless the validation rule explicitly permits a warning

### BHW

BHW has **no access to the new FHSIS report workflow**.

Do not expose:

- FHSIS navigation
- FHSIS report data
- report creation
- report editing
- report review
- verification
- report export

to the BHW role.

---

# Canonical Workflow

```text
NURSE
Open/Create Monthly FHSIS M1 Report
        ↓
Encode official indicators directly in MediSens
        ↓
Autosave / Save Draft
        ↓
Complete all required sections
        ↓
Run/receive validation
        ↓
Review entire monthly report
        ↓
Submit for Verification
        ↓
Status = for_verification

MIDWIFE
Verification Queue
        ↓
Open submitted report
        ↓
Review read-only indicators + findings
        ↓
       ┌──────────────────┴──────────────────┐
       ↓                                     ↓
Return for Correction                    Verify Report
       ↓                                     ↓
Status = returned                      Status = verified
       ↓                                     ↓
Nurse sees exact issues                 Report becomes final
       ↓                                     ↓
Correct + Resubmit                      Report History / Export
```

Allowed report lifecycle:

```text
draft
  ↓
for_verification
  ↓              ↘
returned          verified
  ↓
for_verification
```

Do not create extra database lifecycle statuses merely to represent UI progress inside individual sections.

---

# Important Reporting Model

The FHSIS M1 Barangay form is treated as **one monthly report per reporting context**, not one independent submission per health program.

Example:

```text
August 2026
Malvar Poblacion
M1 Barangay Report
```

contains multiple official sections/programs.

Do not model normal behavior as:

```text
August Maternal Care submission
August Child Care submission
August Family Planning submission
```

unless a verified local requirement explicitly says those are submitted independently.

Program/section navigation exists to make encoding easier, not to split one official monthly report into unrelated reports.

---

# UX Principle

The official FHSIS form is the **data and output authority**.

The MediSens UI is a **guided digital encoding layer**.

Do not recreate the entire giant paper form as one horizontally scrolling web table.

Instead:

- preserve the exact official indicators
- preserve their official dimensions/groupings
- present them section-by-section
- use progressive disclosure / accordions
- support fast keyboard entry
- auto-calculate only totals that are officially derived
- show inline validation
- autosave progress
- let users jump directly to an invalid/missing field
- generate final exports in the official reporting structure

The input experience may be optimized for humans while the final exported report follows the official form structure.

---

# Mandatory Source-of-Truth Rule

**Never invent, rename, simplify, or infer an official FHSIS indicator.**

The canonical FHSIS template must be transcribed from a verified official FHSIS M1 Barangay source provided for this project.

The template must define, at minimum:

- section name
- subgroup name
- exact indicator label
- official order
- input dimensions
- applicable age groups
- applicable sex columns
- manually encoded vs derived values
- formulas/relationships when explicitly defined
- remarks availability
- required/optional behavior
- whether `0` is a valid explicit value

If the official form/reference is not available in the repository when the template population phase is reached, **stop only that phase and request the verified source**. Do not fill the gap with guessed indicators.

Recommended repository location:

```text
docs/fhsis/reference/
docs/fhsis/M1-BRGY-SPEC.md
```

---

# Current Repository Baseline to Verify Before Editing

The current `main` branch should be inspected again at execution time.

Known current architecture at the time this plan was written:

- Nurse entry point:
  - `pages/nurse.html`
  - `src/app/nurse/index.tsx`
- Midwife entry point:
  - `pages/midwife.html`
  - `src/app/midwife/index.tsx`
- Midwife currently imports:
  - `src/features/midwife/censusEntry.tsx`
  - `src/features/midwife/reportGenerator.tsx`
- Midwife currently exposes:
  - `Census Entry`
  - `FHSIS Reports`
- Nurse currently does not expose the new FHSIS encoding workflow.
- Existing Midwife realtime logic subscribes to `fhsis_logs`.
- Existing `fhsis_logs` RLS was designed for older census/vaccination/FHSIS behavior and currently includes roles that conflict with the new reporting ownership.

Do not assume these facts are unchanged. Verify them before modifying code.

---

# Critical Legacy Safety Rule

`fhsis_logs` is already used by existing workflows, including historical/vaccination behavior.

**Do not drop, truncate, rename, repurpose, or broadly rewrite `fhsis_logs` merely to make the new M1 workflow fit.**

Prefer introducing a dedicated monthly FHSIS report model and leave legacy `fhsis_logs` intact until all consumers are identified.

Any legacy removal must happen only after:

1. all current consumers are identified;
2. replacement behavior is working;
3. historical data handling is decided;
4. runtime regression checks pass.

---

# Phase 0 — Architecture & Legacy Audit

## Goal

Understand the real implementation before changing UI, schema, permissions, or old FHSIS behavior.

## Tasks

Read and follow:

- `CLAUDE.md`
- `docs/design/SKILL-UI.md`
- `docs/design/medisens-ui-reference.png`
- `docs/design/UI-CLINICAL-PATTERNS.md` when applicable

Inspect at minimum:

```text
src/app/nurse/index.tsx
src/app/midwife/index.tsx
src/features/midwife/censusEntry.tsx
src/features/midwife/reportGenerator.tsx
src/features/midwife/api.ts
src/features/midwife/types.ts
src/features/midwife/useMidwifeData.ts
src/components/layout/Sidebar.tsx
src/components/layout/Topbar.tsx
src/components/layout/PageHeader.tsx
src/components/ui/
src/styles/tokens.css
supabase/migrations/
```

Search the entire repository for:

```text
fhsis_logs
CensusEntry
census
reportGenerator
FHSIS
vaccination
maternal
```

Identify:

- every `fhsis_logs` reader/writer
- all current FHSIS-related RLS policies
- all current FHSIS-related RPCs/triggers
- any audit-log integrations
- current report/export implementation
- whether any test/demo data relies on current census behavior
- all role checks involving BHW, Nurse, Doctor, and Midwife for FHSIS
- all UI routes/hash states related to census and FHSIS

## Deliverable

Before editing, produce a short verified architecture note containing:

- files that will be retained
- files that will be replaced
- files that can be safely retired later
- current schema dependencies
- current security conflicts
- current export dependencies
- any blocking ambiguity

## Stop conditions

Stop and ask only if there is a material ambiguity involving:

- official FHSIS semantics
- data loss
- role/security ownership
- an unknown production dependency

Do not stop for routine implementation choices that are already settled by this document.

## Completion gate

No implementation work starts until legacy consumers of `fhsis_logs`, `censusEntry.tsx`, and `reportGenerator.tsx` are known.

---

# Phase 1 — Canonical FHSIS Template Specification

## Goal

Create a versioned, machine-readable definition of the official FHSIS M1 Barangay form.

## Architecture direction

Prefer a **versioned configuration-driven template** instead of hundreds of hardcoded form fields scattered through React.

Suggested structure:

```text
src/features/fhsis/
  templates/
    m1-brgy/
      v1.ts
      types.ts
```

or an equivalent verified project-convention path.

The template should define:

```ts
type FhsisIndicator = {
  key: string;
  label: string;
  order: number;
  inputShape: string;
  dimensions: ...;
  totalRule?: ...;
  remarks?: boolean;
  required?: boolean;
};
```

Do not adopt this exact type blindly. Design the smallest typed model that can faithfully represent the official form.

The renderer must support different official layouts, for example:

```text
Age based:
Indicator | 10–14 | 15–19 | 20–49 | Total | Remarks

Sex based:
Indicator | Male | Female | Total | Remarks

Age + sex:
Indicator | 0–9 M/F | 10–19 M/F | 20–59 M/F | 60+ M/F | Total

Simple total:
Indicator | Total | Remarks
```

Family Planning or other complex sections may require more specialized column groups.

Do not force every section into one generic `10–14 / 15–19 / 20–49` table.

## Requirements

- Exact official indicator wording.
- Stable internal keys separate from display labels.
- Preserve official order.
- Version the template.
- Reports must record the template version used.
- `0` must be distinguishable from blank/unencoded.
- Derived totals must be declared by the template, not guessed by the UI.
- Template logic must be testable without rendering React.

## Completion gate

A representative set of different official layouts renders correctly from configuration, with no hardcoded per-page form duplication.

---

# Phase 2 — New Supabase Monthly Report Model + Security

## Goal

Introduce a dedicated data model for the monthly M1 workflow without breaking legacy `fhsis_logs`.

## Migration rule

Create **new corrective/additive migrations**.

Never edit already-applied migration history.

## Suggested data model

Final names must follow verified project conventions, but conceptually create:

### `fhsis_reports`

One record for one monthly official report.

Suggested responsibilities:

- `id`
- report type, e.g. M1 Barangay
- template version
- reporting month/year or canonical reporting-period value
- barangay
- BHS name where required
- municipality/city
- province
- projected population
- lifecycle status
- prepared/created by
- submitted timestamp
- verified by
- verified timestamp
- returned timestamp
- created/updated timestamps

Add a uniqueness constraint that prevents accidental duplicate active reports for the same reporting context.

Do not guess the uniqueness key. Derive it from the verified local reporting context.

### `fhsis_report_values`

Store direct encoded values using stable template keys.

Conceptually:

- report ID
- indicator key
- dimension key
- integer/count value, nullable
- remarks if the official indicator permits remarks
- updated by
- updated timestamp

Requirements:

- unique value per report + indicator + dimension
- reject negative counts
- preserve `NULL` as “not encoded”
- preserve `0` as an intentional encoded zero
- do not store a derived total as editable input when the total is purely formula-derived

### `fhsis_report_reviews`

Store reviewer actions/findings.

Conceptually:

- report ID
- reviewer
- action (`returned`, `verified`, review note)
- reason
- notes/findings
- timestamp

Reuse the project's existing audit-log mechanism where appropriate, but do not rely on a generic audit row as the only place reviewer feedback is stored if the Nurse needs to see structured correction feedback.

## RLS / authorization requirements

### Nurse

Allow:

- SELECT the reports/history they are authorized to see
- INSERT a new draft
- INSERT/UPDATE values only while report status permits Nurse editing
- update returned reports
- submit through a controlled transition

Deny:

- verification
- editing during `for_verification`
- normal editing after `verified`

### Midwife

Allow:

- SELECT FHSIS reports/values for review
- create review findings
- controlled `return` or `verify` transition

Deny:

- creating a new monthly report as encoder
- changing encoded indicator values
- silently editing a Nurse draft

### BHW / Doctor

No access to the **new monthly FHSIS report tables** unless a later explicit requirement grants it.

Do not infer permissions from sidebar visibility.

## Workflow transitions

Prefer database-enforced transitions.

Create narrowly scoped functions/RPCs if this matches project conventions, e.g. conceptually:

```text
submit_fhsis_report(...)
return_fhsis_report(...)
verify_fhsis_report(...)
```

Requirements for privileged functions:

- fixed `search_path`
- minimal grants
- role/profile checks inside the function
- valid current-state checks
- timestamps written server-side
- reject self-verification if required by role ownership
- no `public` or `anon` execution when inappropriate

## Completion gate

Database security independently enforces the locked Nurse/Midwife workflow even if the frontend is bypassed.

---

# Phase 3 — Shared FHSIS Domain Layer

## Goal

Build one reusable FHSIS engine used by both Nurse and Midwife screens.

## Suggested module structure

Adapt to repository conventions after inspection:

```text
src/features/fhsis/
  api.ts
  types.ts
  validation.ts
  calculations.ts
  templates/
  components/
  nurse/
  midwife/
```

Do not create abstractions merely for aesthetics. Extract only shared behavior that is genuinely reused.

## Shared responsibilities

### Data loading

- get/open report by reporting context
- get report history
- get report values
- load template by report template version
- load reviewer findings
- preserve previous content during background refresh

### Calculations

- derived totals defined by the canonical template
- no floating-point logic for person counts
- never convert missing values to zero silently

### Validation

Return structured findings such as:

```ts
{
  sectionKey,
  indicatorKey,
  dimensionKey,
  severity,
  message
}
```

Support:

- required missing values
- invalid negative values
- declared arithmetic consistency rules
- official cross-field consistency rules only when verified
- incomplete sections
- submission blockers
- non-blocking warnings

### Navigation helpers

Allow “View issue” / “Go to field” to open the exact program/section/indicator.

## Completion gate

The same template, calculations, validation, status formatting, and report data are reused by both Nurse encoding and Midwife review.

---

# Phase 4 — Nurse FHSIS Encoding Experience

## Goal

Replace the separate census/logbook mental model with direct FHSIS report encoding inside the Nurse role.

## Nurse navigation

Add under an appropriate verified sidebar group:

```text
FHSIS Reports
  Encode Report
  Report History
```

If the current Sidebar component does not support nested items cleanly, use the smallest safe adaptation consistent with existing navigation patterns.

Do not introduce a new global router.

Use the current hash/navigation approach unless verified architecture requires otherwise.

## Remove from Nurse

Do not expose a separate Census Entry workflow for the new FHSIS process.

## Screen A — Encode Report / Reporting Context

Show:

- reporting month
- year
- barangay
- BHS where applicable
- municipality/city
- province
- projected population
- current status
- autosave state

Behavior:

- open existing draft for the selected reporting context
- do not accidentally create duplicate reports
- clearly indicate when a report is `for_verification`, `returned`, or `verified`

## Screen B — Section/Program Navigation

Use the current MediSens visual language.

Show official sections/program groupings derived from the canonical template.

Each section shows:

- status
- completion
- missing/blocking issue count
- action: Start / Continue / Review

Use progressive disclosure.

Do not render the entire official paper form at once.

## Screen C — Indicator Encoding

Requirements:

- visible indicator labels
- numeric inputs sized for fast entry
- keyboard `Tab` progression
- whole-number counts
- reject negative values
- blank remains `NULL`
- explicit `0` remains zero
- auto-derived totals are read-only
- optional remarks where allowed
- no page-level horizontal overflow

Dense tables may use a **local** scroll container only if the official column structure cannot reasonably reflow without destroying readability.

Desktop should prioritize rapid keyboard encoding.

Tablet/mobile should reflow into understandable grouped rows/cards rather than shrinking the desktop table beyond usability.

## Autosave

Implement debounced or field-exit autosave using existing project request/error patterns.

Show:

```text
Saving…
Saved just now
Unable to save — retry
```

Do not silently lose user input.

Keep explicit `Save Draft` only if it provides meaningful reassurance/control in addition to autosave.

## Screen D — Review Before Submission

Show:

- report metadata
- overall completion
- sections completed
- indicators encoded
- missing required values
- blocking issues
- non-blocking warnings

Provide:

- `Back to Edit`
- `View Issues`
- `Run Validation` if manual validation remains useful
- `Submit for Verification`

Disable or block submission when required validation fails.

After submission:

- report becomes `for_verification`
- inputs become read-only to Nurse
- UI returns to Report History or shows a clear submitted state

## Screen E — Returned Correction

When status is `returned`:

- prominently show reviewer reason/notes
- show exact affected sections/indicators when available
- provide `Go to Field`
- allow edits again
- preserve unaffected values
- resubmit through the same controlled transition

## Completion gate

A Nurse can complete an entire monthly M1 workflow without opening the old Midwife Census Entry module or an external spreadsheet.

---

# Phase 5 — Midwife Verification Experience

## Goal

Turn the Midwife FHSIS experience from manual encoding/report creation into review and verification.

## Midwife navigation

Replace legacy FHSIS/Census ownership with:

```text
FHSIS Reports
  Verification Queue
  Report History
```

Remove `Census Entry` from the active Midwife navigation after the replacement path is functional.

Do not delete the legacy component yet in this phase.

## Screen A — Verification Queue

Show:

- pending review count
- returned count
- verified count for selected period
- filters such as reporting period/status/barangay as supported

Queue columns should focus on:

- reporting period
- reporting context
- Nurse encoder
- completion/validation state
- submitted timestamp
- status
- Review/View action

One monthly M1 report should appear as one queue item.

Do not create one queue row per internal section/program unless the verified business workflow requires separate submission.

## Screen B — Detailed Review

Use the same canonical template and section navigation as Nurse.

Differences:

- all encoded values are read-only
- derived totals remain derived
- validation findings are visible
- show report metadata + submitted by + submission date
- show reviewer notes/findings area

Do not let Midwife edit Nurse-entered values.

## Return for Correction

Require a reason.

Prefer structured findings when possible:

- section
- indicator
- optional dimension
- reviewer note

The Nurse must be able to find the returned field quickly.

Transition report to `returned`.

## Verify Report

Before verification:

- rerun/confirm blocking validation server-side or through the verified backend path
- confirm current status is `for_verification`
- prevent stale/double actions

On success:

- status becomes `verified`
- verified by and verified timestamp are server-recorded
- normal report values become immutable
- report becomes available in Report History/export

## Completion gate

Midwife can fully review, return, and verify without any manual encoding path.

---

# Phase 6 — Report History + Official Export

## Goal

Provide one understandable report-history surface and official-format output.

## Report History

Avoid unnecessary separate `My Submissions` + `eReports` modules unless verified usage requires both.

Prefer one history page with filters/statuses:

```text
Draft
For Verification
Returned
Verified
```

Role-aware actions:

### Nurse

- Continue Draft
- View Submitted
- Correct Returned
- View Verified
- Export Verified if permitted

### Midwife

- Review For Verification
- View Returned
- View Verified
- Export Verified

## Export

At minimum support the project-required outputs, such as:

- PDF
- Excel
- Print

The final export must preserve the official FHSIS reporting structure even though the encoding UI is guided.

Do not merely screenshot the web UI.

The export layer must:

- use the report's stored template version
- reproduce official section/indicator order
- populate official values and totals correctly
- preserve remarks
- include reporting metadata
- clearly represent blank vs zero correctly
- use verified data for final official exports

If current `reportGenerator.tsx` contains reusable export logic, extract/reuse it after inspection rather than rewriting blindly.

## Completion gate

A verified report can be opened and exported without re-encoding or manual copy/paste.

---

# Phase 7 — Legacy FHSIS Cleanup & Permission Removal

## Goal

Remove obsolete UI/permissions only after the replacement workflow is proven.

## UI cleanup

After Nurse encoding + Midwife verification pass runtime tests:

- remove `Census Entry` from Midwife navigation
- remove obsolete legacy report-creation navigation
- remove BHW FHSIS navigation if any remains
- remove dead links/routes
- remove duplicate report-generation entry points

## Code cleanup

Only after confirming no remaining imports/consumers:

- retire `src/features/midwife/censusEntry.tsx` if truly obsolete
- retire or refactor `src/features/midwife/reportGenerator.tsx`
- remove dead types/helpers
- remove obsolete realtime subscriptions if the new report tables replace them for this workflow

Do not delete code used by vaccination or another confirmed workflow.

## Security cleanup

Create new migration(s) to remove obsolete access to the old FHSIS reporting path where safe.

Important:

The old `fhsis_logs` RLS currently reflects an older multi-role model. Do not simply remove BHW/Doctor access if `fhsis_logs` still backs vaccination or other valid workflows.

Separate **new monthly FHSIS report authorization** from **legacy vaccination/log authorization**.

## Data handling

Do not destructively delete old FHSIS/census data.

Choose one explicit treatment:

- legacy read-only archive
- migration into new monthly reports where mapping is trustworthy
- retained historical table with deprecated UI

Document what was done.

## Completion gate

No active user path exposes the retired census-based FHSIS workflow, and no unrelated legacy workflow is broken.

---

# Phase 8 — Verification, Regression, Accessibility & Runtime QA

## Goal

Prove the workflow works end to end and does not weaken MediSens.

## Build/type verification

Run the repository's verified equivalents of:

- typecheck
- production build
- lint if configured
- focused tests

Do not report success without running the commands.

## Role/RBAC tests

Verify:

### Nurse

- can create/open draft
- can encode values
- can encode explicit `0`
- blank is not silently saved as zero
- can resume draft
- cannot verify
- cannot edit `for_verification`
- can edit `returned`
- cannot edit `verified`

### Midwife

- cannot create/encode a new report
- can review submitted report
- cannot edit encoded values
- can return with reason
- can verify valid report
- cannot verify invalid state
- cannot verify stale/previously handled submission

### BHW

- no new FHSIS navigation
- direct URL/hash attempt does not grant access
- database access to new monthly report tables is denied

### Unauthorized roles

Verify database denial, not just hidden UI.

## State-transition tests

Test:

```text
draft → for_verification
for_verification → returned
returned → for_verification
for_verification → verified
```

Reject invalid transitions.

## Validation tests

Test representative official shapes:

- age-group table
- sex table
- age + sex table
- simple total
- derived total
- optional remarks
- blank required field
- explicit zero
- negative input
- inconsistent derived relationship

## UX tests

Check:

- fast Tab-based numeric entry
- autosave state
- failed save/retry
- returned issue → Go to Field
- no full-page reload for section switching
- no lost focus/value during background save
- no horizontal page overflow
- local table scroll only when unavoidable
- mobile/tablet usable touch targets
- keyboard focus visible
- accessible labels for all inputs
- section state is not communicated by color alone

## Regression tests

At minimum verify:

- Nurse Home
- Nurse Patient Records
- Nurse Initial Consultation
- Midwife Home
- Midwife Analytics
- Midwife Patient Records
- Midwife Initial Consultation
- vaccination flows that touch `fhsis_logs`
- current audit-log behavior where relevant
- existing shared Sidebar/Topbar behavior on desktop/mobile

## Completion gate

Do not mark the refactor complete until runtime checks pass for Nurse, Midwife, BHW-denied access, and any confirmed `fhsis_logs` legacy consumers.

---

# Phase 9 — Documentation & Test-Case Alignment

## Goal

Make implementation, paper, and UAT describe the same workflow.

Update relevant project documentation so it states:

### Nurse

> Responsible for entering the FHSIS census/report indicator data directly into MediSens and submitting the completed monthly report for verification.

### Midwife

> Acts as the final reviewer and verifier of submitted FHSIS data, ensuring accuracy and completeness instead of manually encoding the report.

### BHW

> Has no access to the FHSIS report workflow.

Update system test cases to cover the core flow without excessive micro-cases:

1. Nurse encodes and saves FHSIS data.
2. Nurse submits completed report for verification.
3. Midwife reviews the submitted FHSIS report.
4. Midwife verifies correct and complete report.
5. Midwife returns incorrect/incomplete report for Nurse correction.
6. Negative role-access case for BHW/unauthorized FHSIS access if required by the test suite.

Ensure Chapter 4 / UAT wording matches the final implementation after runtime testing.

---

# Implementation Order

Execute in this order:

```text
0. Audit
1. Canonical template
2. Database + RLS + state transitions
3. Shared FHSIS domain layer
4. Nurse encoding UI
5. Midwife verification UI
6. History + official export
7. Legacy cleanup
8. Runtime / RBAC / regression QA
9. Documentation + test-case alignment
```

Do not start with visual deletion of `Census Entry`.

The safe order is:

```text
Build replacement
→ verify replacement
→ migrate/retain legacy data intentionally
→ remove obsolete UI
→ tighten obsolete permissions
```

---

# Non-Goals

Do not include in this refactor unless separately requested:

- offline-online sync
- patient data migration
- patient account creation
- unrelated laboratory refactor
- unrelated Doctor workflow changes
- unrelated BHW redesign
- new analytics dashboards
- AI-generated health recommendations
- automatic inference of FHSIS counts from clinical records
- auto-population from patient data unless explicitly designed and validated later

This phase is about **direct, reliable FHSIS encoding and verification**, not automatic reporting intelligence.

---

# Definition of Done

The refactor is complete only when all of the following are true:

- Nurse can directly encode the official monthly FHSIS M1 report in MediSens.
- Nurse no longer needs the old Census Entry workflow for this reporting process.
- Nurse can save, resume, validate, submit, correct returned reports, and view history.
- Midwife reviews the Nurse's submitted values read-only.
- Midwife can return or verify through backend-enforced transitions.
- BHW has no access to the new FHSIS report workflow.
- Official FHSIS indicators come from a verified versioned template.
- Blank and explicit zero are distinct.
- Official derived totals are not manually editable.
- One monthly M1 report contains its official sections rather than becoming unrelated program submissions.
- Verified reports are immutable through normal workflow.
- Official-format PDF/Excel/print output works from verified data.
- Existing vaccination/legacy `fhsis_logs` consumers still work or have an explicitly verified replacement.
- RLS protects the workflow independently of UI visibility.
- Desktop, tablet, and mobile behavior is usable and accessible.
- Build/type/runtime/RBAC regression checks pass.
- Test cases and paper documentation describe the implemented workflow accurately.
