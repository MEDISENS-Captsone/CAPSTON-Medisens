# UI-CLINICAL-PATTERNS.md — MediSens Clinical Interface Patterns

**Project:** MediSens  
**Version:** 1.0  
**Status:** Current clinical presentation guidance  
**Companion file:** `SKILL-UI.md`

---

## 1. Purpose and scope

This file defines reusable UI patterns for clinical and patient-related workflows in MediSens.

It is a **presentation and interaction guide**, not a clinical policy document. It must not redefine:

- who may view or edit a record
- required clinical fields
- medical reference ranges
- role permissions
- database status values
- audit behavior
- workflow order

Before implementing a pattern, inspect the current route, components, database types, role guard, and business rules. When this document describes a pattern that does not exist in the codebase, treat it as design guidance only and do not add it without explicit scope.

---

## 2. Clinical safety principles

### 2.1 Patient identity before action

Any screen, panel, form, confirmation, or workflow concerning one patient must make it clear whose record is open.

At minimum, show:

- full patient name
- patient ID
- age and sex where already available and permitted

Show barangay, pregnancy status, allergy, or other flags only when supported by the current data model and role permission.

### 2.2 No silent clinical automation

MediSens UI must not automatically select, infer, or prefill:

- diagnosis
- medicine
- dose
- frequency
- duration
- laboratory result
- vital sign
- risk classification
- clinical assessment

Permitted convenience patterns:

- safe demographic defaults already used by the system
- current date and logged-in staff
- explicitly selected “copy previous” actions
- searchable recent or common options that still require user selection

### 2.3 Clinical values remain attributable

Where supported, a saved clinical record should visibly show:

- who recorded it
- their role
- date and time
- record status

Do not invent attribution fields that the system does not store.

### 2.4 Wrong-patient prevention

Before high-risk actions, restate the patient name and ID in the confirmation.

Examples:

- start or save a consultation where confirmation is required
- release laboratory results
- dispense medicine
- archive a record
- remove an attachment

### 2.5 Preserve data entry

Validation, connection failure, tab changes, and background refreshes must not erase typed clinical input.

---

## 3. Patient identity header

### 3.1 Use

Use on full single-patient pages and major clinical forms.

### 3.2 Desktop anatomy

```text
[Initial/avatar]  DELA CRUZ, Maria Santos
                  PT-0001842 · 34 years · Female · Brgy. San Isidro
                  [Critical or relevant flags, when supported]
                                                   [Secondary] [Primary]
```

### 3.3 Mobile anatomy

```text
← Patients
DELA CRUZ, Maria S.
PT-0001842 · 34 years · Female
[Compact flags]
```

The mobile version may collapse noncritical metadata, but name and patient ID must remain visible.

### 3.4 Sticky behavior

A compact identity header may remain sticky during long forms. It must not consume excessive viewport height.

At 200% zoom or small screens, allow the identity header to reflow rather than truncate essential identity.

### 3.5 Visual style

- white surface
- subtle border or soft shadow
- 12px radius when it sits inside page content
- compact spacing
- dark navy or primary text
- status tints only for genuine flags

Do not render it as a decorative hero.

---

## 4. Patient list and Patient Records

### 4.1 Desktop list

Recommended column order, adjusted to actual available data:

1. Patient identity
2. Patient ID
3. age/sex or demographic context
4. barangay or relevant location
5. last activity or registration date
6. status, if the workflow has one
7. actions

Rules:

- patient name is the strongest row label
- identifier uses mono or tabular styling
- whole row may open preview when existing interaction supports it
- Edit, Consult, and other consequential actions remain explicit
- preserve current role permission and action availability

### 4.2 Mobile list

Use a stacked row:

```text
DELA CRUZ, Maria S.              [Status]
PT-0001842 · Female · 34 years
Brgy. San Isidro · Last updated 14 Aug
```

- 64px minimum height
- clear row boundary
- no miniature desktop columns
- no decorative shadow on every row

### 4.3 Search

Use a scoped placeholder such as:

`Search patients by name or patient ID`

While searching:

- preserve current result content until new results return
- show a small inline updating indicator
- do not blank the entire page

### 4.4 Empty states

Examples:

- `No patients have been registered yet.`
- `No patients match these filters.`
- `No recent registrations are available.`

Offer only actions the current role may perform.

---

## 5. Patient preview

### 5.1 Purpose

The preview helps staff verify and understand a patient without losing the list context.

It is primarily a read-and-navigate surface. Do not turn it into a full clinical form.

### 5.2 General structure

1. identity
2. concise demographic information
3. important flags supported by the system
4. recent clinical or registration summary
5. role-appropriate actions

### 5.3 Doctor preview

Current confirmed action layout:

- **Consult** — visually dominant
- **Edit profile** — secondary

Do not automatically open the Consultation Room when the preview opens.

### 5.4 Laboratory preview

- right slide-over
- soft blurred backdrop, provided text contrast remains sufficient
- concise request/patient context
- no accidental exposure of information outside Laboratory permissions
- close with Escape and return focus to the triggering row

### 5.5 Pharmacist preview

Use a narrower panel than the general patient preview. Prioritize:

- patient identity
- active/pending prescription context
- dispense status
- relevant prescription information

Do not crowd it with the full clinical history unless the current permission and workflow require it.

### 5.6 Mobile preview

Convert the slide-over to a full-height sheet or full-screen dialog.

- visible close/back control
- patient identity at the top
- actions near the bottom within easy reach
- no content hidden behind the safe area or on-screen keyboard

---

## 6. BHW patterns

### 6.1 Dashboard

Use the reference-inspired compact dashboard structure:

- 3–4 operational summary cards
- Recent Registrations as a prominent list or table
- a clear Patient Records entry point
- a clear Register patient entry point when permitted

Do not invent household or field modules that are not present in the current implementation.

### 6.2 Patient registration entry points

Entry points should use a specific action label:

- `Register patient`

Avoid ambiguous labels such as `Add` or `Create record`.

### 6.3 Registration form

- single clear page title
- grouped demographic sections
- persistent field labels
- safe format guidance
- mobile single-column layout
- do not mark optional information as required without existing validation
- do not change duplicate-patient detection logic during UI work

### 6.4 Recent Registrations

Use compact rows with:

- patient name
- patient ID
- registration time/date
- registered by, when available
- direct preview/open action

Show `Updating…` during background refresh instead of blanking the list.

---

## 7. Nurse patterns

### 7.1 Nursing Intake Queue

The queue is a working surface, not a decorative dashboard list.

Prioritize:

- patient identity
- arrival/queue context
- intake status
- clear entry point to Initial Consultation or Vital Signs according to existing workflow

Use the real current queue statuses. Do not rename backend values during visual work.

### 7.2 Queue row actions

High-frequency row actions may remain visible when they materially reduce intake time.

Example hierarchy:

- `Record vitals` or current equivalent — primary row action
- patient preview — row click or secondary action
- other actions — overflow

### 7.3 Initial Consultation entry point

The action label must match the current module terminology. Do not merge Initial Consultation with Doctor Consultation unless existing business logic already does so.

### 7.4 Vital Signs entry point

Display a clear patient confirmation before opening or saving vitals.

The form must retain the patient identity header or a compact equivalent.

---

## 8. Vital signs

### 8.1 Display pattern

Use a compact grid, not a collection of oversized dashboard cards.

```text
Blood pressure   Temperature   Heart rate   Respiratory rate
120/80 mmHg      37.2 °C       78 bpm       18 /min
```

Other values appear only when supported by the current system.

### 8.2 Formatting

- value uses tabular numbers
- unit remains visible beside the value
- label remains visible
- derived values are clearly marked read-only
- abnormal/critical presentation requires text, not color alone

### 8.3 Entry controls

- numeric keyboard on mobile
- visible units
- clear validation
- do not silently round or replace entered values
- warn on unusual but possible values according to existing validation
- do not invent medical ranges

### 8.4 Saving

- prevent duplicate submission
- keep the form visible while saving
- show `Saving vitals…`
- confirm only after actual backend or approved local-save acknowledgement
- never clear fields after a failed save

---

## 9. Initial Consultation

Use the current existing fields and order. The UI may visually group them into sections without changing data or validation.

Possible grouping based on present fields:

1. patient context
2. intake details
3. complaint or reason for visit
4. initial observations
5. vital signs entry or reference
6. save/continue action

Do not add Doctor-only diagnosis, prescription, or clinical plan fields to the Nurse initial workflow unless already present.

---

## 10. Doctor consultation

### 10.1 Page structure

Use a single clear workflow page, not a modal.

A practical structure is:

1. patient identity
2. relevant intake/vitals summary
3. complaint/history
4. examination/findings
5. diagnosis/assessment
6. plan and follow-up
7. laboratory request and prescription entry points where currently implemented
8. save action

Actual fields and order come from the codebase.

### 10.2 Information density

Desktop may show a main form column plus a narrower patient context column. Tablet and mobile should move context above the form or into a collapsible summary.

Do not hide essential patient context below the form.

### 10.3 Long forms

- use fieldsets and visible section headings
- keep narrative fields comfortably sized
- preserve input across temporary errors
- use a sticky mobile save area only when it does not cover fields or the keyboard

### 10.4 Diagnosis controls

When the current system provides coded or suggested diagnoses:

- keep the user in control
- make selection explicit
- display codes and descriptions clearly
- never auto-select a diagnosis
- preserve current database and validation behavior

### 10.5 Follow-up

Use explicit labels and dates. Do not imply that a follow-up was scheduled unless the underlying save succeeded.

---

## 11. Patient history

Current confirmed filters:

- All
- Consultations
- Initial

Keep these names unless the user explicitly changes them.

### 11.1 Presentation

Use either:

- a reverse chronological timeline, or
- compact grouped records

Choose the pattern already closest to the current implementation.

Each entry should show available:

- date and time
- record type
- staff/role
- concise summary
- open/details action

### 11.2 Filter refresh

Changing history filters must:

- keep the previous history visible while fetching
- show a small updating state
- preserve the active filter
- avoid full-page reloads

---

## 12. Laboratory patterns

### 12.1 Worklist

Prioritize:

- patient identity
- request type/test
- requesting clinician where permitted
- request date
- current status
- urgency where supported

Use real current statuses and business logic.

### 12.2 Request preview

The right slide-over should:

- preserve worklist position
- show patient identity prominently
- group request information cleanly
- expose only role-permitted actions
- support keyboard close and focus restoration

### 12.3 Result entry

Use a structured table or repeated row form according to actual implementation.

Typical visual columns:

- test/analyte
- result
- unit
- reference range, if stored
- flag/status, if stored

Do not invent reference ranges or abnormality logic.

### 12.4 Release confirmation

When releasing results is supported, confirmation should restate:

- patient name
- patient ID
- result/test scope
- consequence according to current workflow

Use the exact action name `Release result` or the existing project terminology.

---

## 13. Prescription and Pharmacist patterns

### 13.1 Prescription display

Group prescription information into clearly labelled rows or items. Use the current field model.

Possible visible fields when available:

- medicine
- strength/form
- dose
- frequency
- duration
- quantity
- instructions
- status

Do not collapse structured fields into one unreadable sentence.

### 13.2 Pharmacist queue

The main worklist should emphasize:

- patient identity
- prescription date
- prescriber
- item count
- dispense status

### 13.3 Dispensing interaction

- patient identity remains visible
- prescribed versus dispensed quantities remain distinguishable
- partial dispense behavior must match existing logic
- confirmation restates patient and items
- do not alter inventory or stock logic during UI work

### 13.4 Narrow preview

The Pharmacist preview panel should be deliberately compact. Avoid placing large general patient-record sections before the prescription information needed to act.

---

## 14. Maternal Care and Midwife patterns

### 14.1 Eligibility protection

The current business rule blocks male patient entries in Maternal Care. The UI must surface this safely without changing the rule.

Recommended blocked state:

`Maternal Care is available only for eligible female patients.`

Provide a safe action such as returning to Patient Records or opening the patient profile. Do not show a broken form and wait for submission to fail when eligibility is already known.

### 14.2 Maternal record layout

Use actual existing fields. Group related information rather than creating a long undifferentiated form.

Possible groups only when supported:

- pregnancy context
- current visit
- observations and vitals
- next visit/follow-up
- census or reporting details

### 14.3 Timeline

Where multiple maternal visits exist, use a clear date-based timeline or compact record list. Do not invent risk classifications or calculations unless the system already stores them.

---

## 15. Archive and read-only records

### 15.1 Archived presentation

Archived records should clearly show:

- `Archived` status
- read-only state
- archived date/actor when available

Use a neutral banner or header treatment. Do not use a large red error state for a valid archived record.

### 15.2 Editing

Remove or disable edit controls according to the existing permission model. A control blocked because the record is archived should explain why.

### 15.3 Archive confirmation

The confirmation must name the patient or record and explain the consequence using existing behavior.

Do not use “Delete patient” when the actual behavior is archiving.

---

## 16. Audit Log

### 16.1 Desktop

Use a dense, readable table with columns supported by the current data:

- timestamp
- actor
- role
- action
- module/target
- details

### 16.2 Mobile

Convert each audit event into a compact chronological row or timeline item. Do not create large decorative cards.

### 16.3 Read-only behavior

Audit entries are not editable. Do not add row actions that imply modification or deletion unless the existing system explicitly supports them.

### 16.4 Sensitive details

Display only fields already authorized by existing permissions. Do not expose hidden before/after values merely because the UI has room.

---

## 17. Attachments and images

Use actual current attachment workflows.

### 17.1 Upload state

Show:

- filename
- type/size guidance
- upload progress where available
- success or failure
- retry action on failure

### 17.2 Preview

- do not crop clinical images
- provide a way to enlarge
- show file identity and upload metadata when available
- use a slide-over or full-screen mobile view

### 17.3 Removal

If removal is supported, require confirmation and preserve current audit behavior.

---

## 18. Clinical confirmation pattern

Use for high-risk or irreversible actions.

```text
Release this result?

Maria Dela Cruz · PT-0001842
The result will become available according to the current MediSens workflow.

[Cancel] [Release result]
```

Rules:

- specific action verb
- patient or record identity
- consequence
- safe action visually separated from destructive action
- default focus on the safe action for destructive confirmations

---

## 19. Validation and errors

### 19.1 Field-level validation

- label remains visible
- error appears below field
- message explains the correction
- `aria-invalid` and `aria-describedby` used correctly
- form value remains intact

### 19.2 Form-level errors

Use an error summary when several fields fail. Move focus to the summary or first invalid control according to the existing form pattern.

### 19.3 Server errors

Translate technical errors into a user action without hiding useful context.

Good:

`Couldn't save the consultation. Your entries are still here. Check your connection and try again.`

Do not show raw Supabase or network payloads in the interface.

---

## 20. Responsive clinical checklist

For each affected workflow verify:

- patient identity remains visible
- 390×844 mobile layout has no horizontal overflow
- 768×1024 tablet uses space intentionally
- 1440×900 desktop is not excessively stretched
- 200% zoom preserves action access
- mobile keyboard does not cover the focused field or save action
- drawers and slide-overs close and restore focus correctly
- table/list transformation keeps patient name and status visible

---

## 21. Clinical UI anti-patterns

Do not:

- auto-select a clinical answer
- hide patient identity during data entry
- use a dashboard metric card for a vital or laboratory value
- use color alone for abnormal/critical status
- invent reference ranges
- merge role workflows during a visual refactor
- expose restricted fields in previews
- present archived records as deleted
- use an optimistic success state for a clinical save
- erase typed input after failure
- open Doctor consultation automatically from patient preview
- broaden BHW or Midwife scope beyond current modules without approval

---

## 22. Implementation note

When this file and the current codebase differ about available data or actions, preserve the codebase and report the mismatch. Do not fabricate missing clinical fields to satisfy a visual pattern.

*End of `UI-CLINICAL-PATTERNS.md`.*
