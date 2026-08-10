# MediSens UAT Revision Roadmap

**File:** `UAT-Revision.md`  
**Scope:** Post-UAT revisions requested by the Malvar RHU Head Doctor  
**Primary Goal:** Improve Doctor workflow, patient-record usability, and pediatric visualization while preserving existing business logic, permissions, Supabase relationships, audit behavior, offline behavior, and follow-up SMS functionality unless explicitly changed.

---

## Core Safety Rules

These rules apply to every phase:

- Preserve existing database relationships, RLS, permissions, role guards, audit logging, offline behavior, and working clinical workflows unless a phase explicitly requires a change.
- Prefer UI/UX and field-remapping changes before schema changes.
- Do not hard-refresh or reload the whole page after saves, tab changes, filters, or workflow actions.
- Do not introduce horizontal scrolling on normal application screens.
- Preserve the existing Doctor queue eligibility logic.
- Preserve Laboratory Request and E-Prescription behavior unless explicitly revised.
- Do not change the follow-up SMS Edge Function or its scheduling behavior during UI restructuring.
- Keep historical patient data readable after every revision.
- Run TypeScript, build, and diff checks after every phase.
- Stop without committing after each phase until manually reviewed.

---

# Phase UAT-1 — Baseline Verification and BHW Patient Directory Fix

## Goal

Fix the BHW Patient Directory update issue first and establish a clean baseline before restructuring the Doctor workflow.

## Scope

### BHW Patient Directory

- Verify the existing `updatePatientRecord()` flow updates the correct `patients.id`.
- After a successful BHW edit, update the matching patient inside the BHW dashboard's local `patients` state.
- Immediately reflect edited patient details in:
  - Patient Directory
  - Recent Registrations
  - Patient preview/modal
  - any visible BHW patient counts affected by the change
- Do not insert a new patient when editing an existing patient.
- Preserve current toast behavior and audit logging.

### Audit prerequisite

Fix the existing audit allowlist issue before later using audit logs for "Last Patient Handler":

- Add `patient_consent` to the allowed audit record types.
- Add `consent_id` to the Edge Function metadata allowlist if still missing.
- Redeploy the `create-audit-log` Edge Function.
- Verify one BHW consent save creates exactly one audit row.

## Risk Level

**Low to Medium**

No schema change should be required.

## Manual Checks

- Edit a BHW patient name/address/contact.
- Confirm the modal reflects the change.
- Close the modal and confirm Patient Directory reflects the same change immediately.
- Confirm no duplicate patient row was created.
- Refresh and confirm the updated data persists.
- Record one consent and verify one audit log is created.

---

# Phase UAT-2 — Doctor Consultation Information Architecture

## Goal

Restructure the Doctor consultation UI into the Head Doctor's requested clinical documentation sequence without changing underlying save behavior yet.

## Final Consultation Flow

**Patient Details**

1. **Chief Complaint and History of Present Illness**
2. **Relevant Patient Histories**
3. **Pertinent Physical Examination Findings**
4. **Diagnosis**
5. **Management and Health Education**
6. **Laboratory Request**
7. **E-Prescription**

## Scope

### Patient Details

- Keep the Patient Details card above the consultation workflow.
- Make it compact and easy to reference while documenting.
- Sticky behavior may be used on desktop if it does not block content.
- Preserve:
  - patient name
  - age
  - sex
  - blood type
  - View Patient History
  - Back to Patient Queue
  - Return to Work Queue

### Tab/step restructuring

Replace the current:

`Histories → OBGyne → Assessment → Clinical Notes → Follow-up → Lab Request → E-Prescription`

with the new seven-step structure.

### Section 1

**Chief Complaint and History of Present Illness**

Use the existing consultation fields:

- Chief Complaint
- History of Present Illness

Do not create duplicate fields if existing `chief_complaints` and `hpi` fields already cover these values.

### Section 2

**Relevant Patient Histories**

Include existing:

- Past Medical / Surgical History
- Family History
- Social History
  - smoking
  - drinking
- Immunization History

### Conditional OB-Gyne

- Remove OB-Gyne as a permanent standalone numbered tab.
- Show the OB-Gyne / pregnancy block only when applicable.
- Never show an empty or disabled OB-Gyne tab for irrelevant patients.
- Preserve all existing OB-Gyne fields and saved historical data.

## Risk Level

**Medium**

Mostly UI restructuring, but tab IDs and navigation buttons are currently tightly coupled.

## Manual Checks

- Male patient has no standalone OB-Gyne tab.
- Applicable patient can still access and save all OB-Gyne fields.
- Switching steps preserves entered form data.
- Desktop and mobile show all workflow steps clearly.
- No horizontal page scrolling.
- Back/Next buttons follow the new sequence.

---

# Phase UAT-3 — Physical Examination, Diagnosis, and Management Field Remapping

## Goal

Move existing fields into clinically correct sections without changing their database meaning unnecessarily.

## Section 3 — Pertinent Physical Examination Findings

Rename current Assessment to:

**Pertinent Physical Examination Findings**

Display existing clinical measurements such as:

- Vital Signs
- General Survey
- Relevant Physical Examination Findings
- Anthropometric measurements where appropriate
- Other existing examination findings

### Important

- Remove **Medication and Treatment** from this section.
- Reuse already-loaded `vital_sign` data.
- Prefer the existing consultation `assessment` field for free-text pertinent examination findings if available.
- Avoid creating a new schema field unless repository inspection proves no appropriate existing field exists.

## Section 4 — Diagnosis

Rename Clinical Notes to:

**Diagnosis**

- Diagnosis must be the primary content.
- Keep using the existing `consultation.diagnosis`.
- Preserve Medical Certificate diagnosis behavior.

Move non-diagnosis content out of this section.

## Section 5 — Management and Health Education

Create the initial-consultation management section using existing fields where possible:

- Treatment / Management Plan
- Medication or treatment instructions
- Patient Instructions
- Health Education
- Recommendations
- Follow-up Recommendations
- Follow-up Schedule

Use existing consultation fields such as:

- `management_treatment`
- `medication_treatment`
- `plan`

where semantically appropriate.

### Medical Certificate

If Remarks / Recommendation currently reads from `medication_treatment`, update the print mapping so the Medical Certificate still prints the correct recommendation after the UI move.

## Risk Level

**Medium to High**

The current UI reuses some fields across multiple purposes. The main risk is displaying/saving the right value under the wrong clinical label.

## Manual Checks

- Old consultation data still displays correctly.
- Diagnosis saves and reloads.
- Management notes save and reload.
- Medical Certificate still includes Diagnosis and Remarks/Recommendation.
- Medication/Treatment is no longer shown under physical examination findings.
- No duplicate fields are created for the same database value.

---

# Phase UAT-4 — Follow-up UI Separation While Preserving SMS Logic

## Goal

Separate **follow-up scheduling during the initial consultation** from the **actual return/follow-up visit workflow**.

This is the most important preservation phase.

## Protected Existing Logic

Do **not** modify the behavior of:

- `follow_up` table relationships
- `follow_up.visit_date`
- `follow_up.follow_up_status`
- follow-up audit logging
- `send-followup-reminders` Edge Function
- iProg SMS sending
- reminder idempotency checks
- patient contact lookup
- existing "Mark Follow-up as Done" behavior

## Initial Consultation Behavior

Inside **Management and Health Education**, allow the Doctor to document:

- Follow-up recommendation
- Follow-up date/schedule
- related patient instructions

This is scheduling/planning only.

## Actual Return Visit

The existing return-visit workflow must remain separate.

When the patient actually returns:

- Doctor explicitly begins the Follow-up Visit.
- Then reveal:
  - General Survey
  - Clinical fields
  - Vital Signs
  - Anthropometrics
  - Treatment / Results
  - Provider verification
  - Mark Follow-up as Done

Do not display these examination fields merely because a follow-up date was scheduled.

## Required Verification Before Changing Save Logic

Inspect the current behavior where saving a consultation also upserts a pending follow-up record.

Verify:

- whether every consultation currently creates a follow-up row
- whether `followUpDate` defaults to today's date
- whether this causes unintended reminder records

Do not change that logic during the UI-only refactor unless the behavior is confirmed to be incorrect and separately approved.

## State Separation

Avoid using one frontend field for both:

- initial management plan
- actual return-visit treatment

Prefer:

- initial consultation → `consultation.management_treatment` / `consultation.plan`
- actual follow-up visit → `follow_up.medication_treatment`

## Risk Level

**High**

This phase touches UI around an existing automated SMS workflow.

## Manual Checks

### Initial consultation

- Doctor can record management and health education.
- Doctor can schedule a follow-up.
- No actual follow-up examination fields appear during scheduling.

### SMS

- Existing scheduled follow-up remains in `follow_up`.
- Reminder function still detects the scheduled date.
- No Edge Function code was changed.
- No duplicate follow-up records are created.

### Return visit

- Returning patient opens actual follow-up workflow.
- Examination fields remain hidden until "Begin Follow-up Visit".
- Mark Follow-up as Done still works.

---

# Phase UAT-5 — Laboratory Request and E-Prescription Final Alignment

## Goal

Keep working Lab and Pharmacy behavior intact while aligning navigation and layout with the new consultation structure.

## Laboratory Request

Keep as **Section 6**.

Preserve:

- Lab Request creation
- consultation linkage
- patient linkage
- requested tests
- fasting test rules
- Laboratory queue
- result synchronization
- audit logging

Only update:

- section numbering
- Back/Next navigation
- labels/layout if required by the revised workflow

## E-Prescription

Keep as **Section 7**.

### Quantity Layout

- Keep Quantity on the right side of the relevant medication details on desktop.
- Stack cleanly on mobile.
- No horizontal scrolling.
- Preserve medication JSON structure and Pharmacy parsing.

## Risk Level

**Low**

## Manual Checks

- Send one Lab Request and confirm Laboratory receives it.
- Submit one result and confirm Doctor sees the result.
- Send one E-Prescription and confirm Pharmacy receives it.
- Prescription Quantity is correctly positioned.
- Mobile layout remains readable.

---

# Phase UAT-6 — Last Patient Handler

## Goal

Display the most recent healthcare staff member who meaningfully managed the patient.

## Source of Truth

Prefer existing:

- audit logs
- consultation records
- initial consultation records
- laboratory results
- prescription dispensing history
- follow-up history

Do not create a duplicate "last_handler" column unless existing data proves insufficient.

## Meaningful Interaction Rules

Count actions such as:

- patient registration/update
- consent recording
- initial consultation
- doctor consultation
- follow-up documentation
- lab-result completion
- prescription dispensing
- clinically meaningful patient-record changes

Do **not** treat simple record viewing as patient management.

## Display

Show where useful:

- Staff Name
- Staff Role
- Latest meaningful action
- Date/time

Suggested placement:

- Patient Details / Patient Summary
- Patient preview/modal

## Architecture

Prefer a shared helper/query that resolves the latest meaningful interaction.

Do not scan the full audit table client-side.

## Risk Level

**Medium to High**

Audit records are heterogeneous, and some historical rows may lack complete `patient_id` metadata.

## Manual Checks

Create a controlled sequence:

1. BHW updates patient.
2. Nurse/Midwife performs intake.
3. Doctor consults.
4. Laboratory completes result.
5. Pharmacist dispenses.

After each step, verify "Last handled by" changes to the correct staff member and action.

---

# Phase UAT-7 — Pediatric Child Growth Chart

## Goal

Provide a clinically appropriate growth visualization only for pediatric patients.

## Eligibility

- Show only for pediatric patients.
- A 12-year-old is eligible.
- Do not show for adults.
- Do not display misleading charts when measurements are insufficient.

## Data Sources

Reuse existing historical measurements where possible:

- age/date of measurement
- height
- weight
- BMI if appropriate
- initial consultation vitals
- follow-up measurements

## Clinical Reference Gate

Before implementing interpretation:

**Confirm with the Head Doctor which growth reference Malvar RHU wants to use.**

Recommended candidate for ages 5–19:

- WHO 2007 Growth Reference

Do not apply adult BMI categories to pediatric patients.

## Suggested Indicators for Ages 5–19

If WHO 2007 is approved:

- Height-for-age
- BMI-for-age

Weight-for-age must only be used within the age range supported by the chosen reference.

## UI

Integrate naturally into Doctor Patient History / Patient Details.

Possible structure:

- compact "Growth" section
- measurement timeline
- chart
- latest measurement summary
- clear empty state when data is insufficient

Avoid adding another permanent consultation tab.

## Risk Level

**High**

The chart UI is straightforward, but clinical interpretation must use the correct sex- and age-specific reference dataset.

## Manual Checks

- Adult patient: chart hidden.
- Pediatric patient with one measurement: clear insufficient-history state.
- Pediatric patient with historical data: chart plots measurements chronologically.
- Sex-specific reference is correct.
- No adult BMI labels are shown to pediatric patients.

---

# Phase UAT-8 — Responsive and Accessibility Pass

## Goal

Polish all revised UAT screens after the workflow is stable.

## Scope

Verify:

- 390px mobile
- 430px mobile
- tablet
- desktop

Requirements:

- no horizontal page scrolling
- all consultation steps visible on mobile
- minimum practical touch targets
- readable labels
- consistent active states
- keyboard focus-visible states
- drawers/modals remain usable
- sticky Patient Details does not obstruct content
- growth chart remains readable
- management/follow-up sections remain distinct

## Risk Level

**Low**

UI-only unless a responsive defect reveals a deeper workflow issue.

---

# Phase UAT-9 — Regression and Workflow Stabilization

## Goal

Verify that the UAT revision did not break existing MediSens workflows.

## Full Role Regression

### BHW

- registration
- update patient
- consent
- Patient Directory refresh

### Nurse

- Initial Consultation
- Complete Visit
- Refer to Doctor

### Midwife

- Initial Consultation
- Complete/Refer
- Patient Records
- census/FHSIS

### Doctor

- consultation queue
- revised seven-step consultation
- conditional OB-Gyne
- physical examination
- diagnosis
- management
- follow-up scheduling
- actual return visit
- lab request
- E-Prescription
- history
- last handler
- pediatric growth chart

### Laboratory

- request queue
- result entry
- result update
- Doctor result synchronization

### Pharmacist

- prescription queue
- dispensing
- unavailable medication flow

### Admin

- Audit Log
- Archive Review
- role behavior

## Technical Checks

- no duplicate writes from rapid clicks
- no hard refreshes
- no lost tabs/filters/scroll position
- no broken Browser Back/Forward state
- TypeScript clean
- production build clean
- diff check clean

---

# Phase UAT-10 — Deployment and Post-UAT Validation

## Goal

Deploy the verified revision and perform a final production smoke test.

## Before Deployment

- Backup Supabase database.
- Confirm migrations, if any, are documented.
- Confirm Edge Functions that changed were redeployed.
- Confirm environment variables.
- Confirm no test records remain.
- Commit in logical groups.

## Production Smoke Test

Verify:

- Login
- BHW Patient Directory update
- consent audit
- Nurse/Midwife intake
- Doctor consultation queue
- new Doctor workflow
- follow-up scheduling
- SMS reminder path remains intact
- actual follow-up visit
- Laboratory
- Pharmacy
- pediatric chart
- last patient handler
- mobile usability

---

# Recommended Implementation Order

```text
UAT-1  BHW Directory + Audit prerequisite
  ↓
UAT-2  Doctor information architecture
  ↓
UAT-3  Physical Exam + Diagnosis + Management remapping
  ↓
UAT-4  Follow-up separation + SMS preservation
  ↓
UAT-5  Lab + E-Prescription alignment
  ↓
UAT-6  Last Patient Handler
  ↓
UAT-7  Pediatric Growth Chart
  ↓
UAT-8  Responsive/accessibility polish
  ↓
UAT-9  Full regression
  ↓
UAT-10 Deploy + production validation
```

---

# Implementation Responsibility Guide

## Claude Code

Best suited for:

- Doctor UI restructuring
- responsive behavior
- Patient Details layout
- conditional OB-Gyne rendering
- physical examination layout
- Diagnosis / Management UI
- follow-up UI separation
- E-Prescription layout
- growth-chart presentation
- mobile/accessibility polish

## Codex

Best suited for:

- audit allowlist fix
- audit/transaction query for Last Patient Handler
- Supabase/RLS verification
- follow-up data-flow verification
- any required schema/RPC changes
- growth-reference data integration if clinical interpretation requires structured reference tables
- migration review
- backend regression/security checks

## Shared / Either

- BHW local state update
- TypeScript/build checks
- targeted runtime regression tests

---

# Important Do-Not-Break List

The following must survive the UAT revision unchanged unless explicitly approved:

- BHW-only patient consent write permissions
- Nurse/Midwife Complete vs Refer workflow
- Doctor queue showing only referred patients
- encounter-specific Doctor queue selection
- Patient Records pagination
- audit logging
- offline storage/sync behavior
- Lab Request workflow
- Lab Result workflow
- E-Prescription → Pharmacy workflow
- prescription printing
- Medical Certificate printing
- follow-up table relationships
- Follow-up SMS Edge Function
- reminder idempotency
- follow-up completion workflow
- patient history
- archive behavior
- role permissions / RLS
