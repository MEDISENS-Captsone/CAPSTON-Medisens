# BHW-UI.md

## MediSens BHW Tablet/Mobile UI/UX Redesign Plan

### Purpose

Redesign the **BHW experience only for tablet/mobile/PWA use** into a large-tile, touch-first, POS-like operational interface that is easier for older BHW users (including 50+ users) to understand and operate.

The redesign must make common tasks obvious, reduce precision requirements, reduce visual clutter, and guide the BHW through one task at a time.

This is a **responsive redesign**, not a new visual identity.

Desktop MediSens should remain recognizable and stable. Tablet/mobile BHW screens should adapt into the approved touch-first layout while preserving the same MediSens product language.

---

# 1. Non-Negotiable Visual Rules

## 1.1 Current MediSens UI is the visual source of truth

Strictly preserve the existing system's:

- color palette;
- navy/white visual identity;
- existing status colors;
- typography and font family;
- typography weights;
- icon style and icon library;
- border colors;
- border-radius language;
- focus states;
- button language;
- form-control styling;
- spacing rhythm where compatible;
- loading/skeleton patterns;
- toast/feedback patterns.

### Do not

- introduce a new font;
- introduce a new icon library;
- invent new brand colors;
- add gradients;
- add decorative glassmorphism;
- add random colorful cards;
- use generic AI-dashboard styling;
- create a separate "senior citizen theme";
- redesign desktop MediSens into a different product;
- replace existing status meanings with new colors.

When a new touch layout is needed, **reuse existing MediSens design tokens/classes/components first**.

If an exact color, font size, icon, radius, or spacing value is needed, inspect the current implementation and reuse the existing token/value instead of guessing.

---

# 2. Core BHW UX Principles

The BHW tablet/mobile interface should behave like a **guided operational workstation**, not a compressed desktop database application.

## Priorities

1. **Task-first**
   - Show what the BHW needs to do, not a list of technical modules.

2. **Large touch targets**
   - Primary controls should be comfortably tappable.
   - Maintain at least a 44×44 px interactive target.

3. **Low precision**
   - The user should not need to hit tiny chevrons, icons, checkboxes, or table cells.

4. **Low memory burden**
   - Important actions should be visible instead of hidden behind multiple menus.

5. **Simple choices**
   - Prefer large segmented buttons/tile choices for short option sets.
   - Use dropdowns mainly for long lists such as barangays.

6. **Forgiving workflows**
   - Preserve entered data while navigating registration steps.
   - Avoid accidental resets.
   - Confirm destructive exits when an unfinished task would be lost.

7. **Progressive disclosure**
   - Show essential information first.
   - Open details only when needed.

8. **No horizontal page scrolling**
   - Tablet/mobile BHW pages must fit the viewport.
   - Never require horizontal scrolling to understand a patient row/card.

9. **Whole-card interaction**
   - Patient cards/rows should be tappable across the entire surface, not only through a small arrow.

10. **Clear feedback**
   - Hover where applicable, pressed states, saving states, success/error feedback, and disabled states must be visible.

---

# 3. Responsive Shell Rules

## Tablet/Mobile BHW shell

For BHW touch layouts:

- remove the persistent left desktop sidebar;
- use the compact MediSens top header;
- retain system online/offline state;
- retain the authenticated BHW identity/profile;
- use a fixed/sticky bottom navigation with only:
  - **Home**
  - **Patient Records**
- the active destination must be unmistakable;
- no FHSIS navigation item in the BHW touch navigation;
- no duplicate navigation systems;
- no persistent bottom navigation on screens where it would obstruct an active full-screen task unless the existing PWA pattern requires it.

## Desktop

Preserve the current desktop BHW shell unless a shared fix is strictly required.

Any shared CSS/layout change must be scoped carefully so the BHW tablet/mobile redesign does not regress other roles or desktop shells.

## Target verification sizes

At minimum verify:

- 390 px mobile;
- 430 px mobile;
- tablet portrait;
- tablet landscape;
- large desktop.

Do not assume that a tablet landscape viewport should use the desktop sidebar. The BHW PWA tablet experience is intentionally touch-first.

---

# 4. Approved BHW Touch Information Architecture

## Bottom navigation

1. **Home**
2. **Patient Records**

These are the only persistent BHW tablet/mobile destinations.

Common tasks such as registration and finding a patient should be exposed from Home as direct task actions instead of becoming additional permanent navigation tabs.

---

# Phase BHW-UI-0 — Current UI Inventory and Safety Baseline

## Goal

Before redesigning anything, identify the exact current BHW implementation, shared components, styles, and workflows that must be preserved.

## Required work

- Read `CLAUDE.md`.
- Read existing UI/design guidance in the repository.
- Inspect the current BHW shell and responsive styles.
- Identify the current:
  - font family;
  - color tokens;
  - icon library;
  - button styles;
  - input styles;
  - card styles;
  - focus-visible rules;
  - loading/skeleton patterns;
  - toast patterns.
- Identify all BHW routes/components used by:
  - Home/Dashboard;
  - Patient Records;
  - Patient Registration;
  - Patient Directory;
  - consent recording;
  - patient details/preview.
- Identify shared components used by other roles before modifying them.
- Record existing business logic, permissions, queries, RPCs, audit writes, and consent behavior.

## Do not

- redesign anything yet;
- change database schema;
- change RLS;
- change permissions;
- change audit behavior.

## Exit criteria

- Exact implementation files are known.
- Existing design tokens/components to reuse are known.
- Desktop/shared-regression risks are documented.

---

# Phase BHW-UI-1 — Tablet/Mobile BHW Shell

## Goal

Create the responsive BHW PWA shell that all redesigned screens will use.

## Tablet/mobile layout

### Top header

Keep the existing MediSens identity.

Show:

- MediSens logo/wordmark using the current system asset;
- current system connectivity indicator;
- logged-in BHW name;
- BHW role;
- current profile/avatar treatment.

Do not invent a new header style unrelated to the current system.

### Bottom navigation

Create a large, touch-friendly bottom navigation:

- Home
- Patient Records

Requirements:

- active state uses the existing MediSens active/nav treatment;
- icon style comes from the current system icon set;
- labels remain visible;
- 44 px minimum touch target;
- safe-area aware;
- no horizontal overflow;
- no extra FHSIS tab.

## Desktop

Current desktop navigation remains unchanged.

## Regression checks

- native vertical scrolling works;
- no nested mobile scroll trap;
- drawers/modals restore scrolling when closed;
- no horizontal page scrolling.

---

# Phase BHW-UI-2 — Home Redesign

## Goal

Make Home immediately answer:

**"What do I need to do?"**

The BHW should not need to understand the system's internal module structure.

## Required Home content

Everything below must be visible from Home.

### A. Greeting/context

Use a simple contextual greeting with the BHW's name.

Example structure:

- `Good afternoon, Annie!`
- `How can we help you today?`

Keep language simple and operational.

### B. Large Quick Actions

Show two dominant task cards/tiles:

#### Register Patient

- large icon from the existing MediSens icon set;
- large label;
- short plain-language description;
- large tappable surface;
- entire tile is interactive;
- clear pressed/active state.

#### Find Patient

- large search/patient icon from the existing system;
- large label;
- short plain-language description;
- entire tile is interactive.

These two actions should receive the strongest visual priority on Home.

### C. Recent Registrations

Show a compact list of recently registered patients.

Each entry should prioritize:

- patient name;
- age;
- sex;
- barangay;
- registration date/time where currently available;
- entire row/card tappable.

Include a **View all** action only if it maps to an existing valid workflow.

Do not show excessive metadata.

### D. Patient Directory

Patient Directory must remain visible directly on Home.

Required tabs:

- **All**
- **Pending**
- **Signed**

Preserve the existing consent semantics.

Each patient entry should show only the information needed to identify the patient and understand consent status.

Use the current status colors for Pending/Signed.

The entire patient row/card should be tappable.

### E. Remove FHSIS from this BHW touch Home

Do not show:

- FHSIS quick action;
- FHSIS dashboard card;
- FHSIS bottom navigation item.

Do not delete underlying FHSIS functionality/database objects as part of this UI phase unless separately approved.

## Tablet behavior

- Register Patient and Find Patient may sit side-by-side.
- Recent Registrations and Patient Directory should remain easy to scan.
- Use generous spacing without wasting large empty areas.

## Mobile behavior

- quick actions may stack or use a compact two-tile grid if labels remain readable;
- Recent Registrations and Patient Directory become vertically stacked sections;
- no horizontal scrolling;
- Patient Directory tabs must fit/wrap without a horizontal tab scroller.

## Preserve

- consent workflow;
- Patient Directory filters/status logic;
- patient ordering rules;
- latest-consent sorting behavior;
- local state updates;
- audit logging;
- patient registration logic.

---

# Phase BHW-UI-3 — Patient Records Touch Redesign

## Goal

Replace the compressed desktop-table experience on tablet/mobile with a large touch-list optimized for scanning and opening patient records.

## Header

Show:

- `Patient Records`
- a short plain-language subtitle such as `Find and open a patient record.`

## Search

Make search a primary control.

Requirements:

- large input;
- clear search icon;
- preserve existing supported search behavior;
- do not require precision tapping;
- retain existing debouncing/query behavior.

Do not add voice search unless separately approved.

## Filters

Show large controls for:

- Barangay;
- existing relevant filters.

Do not squeeze multiple controls into an unreadable toolbar.

## Patient result cards

Below the tablet/mobile breakpoint, do not render a horizontally scrollable table.

Each patient becomes a large card/row.

Prioritize:

1. Patient name
2. Age
3. Sex
4. Barangay
5. Existing classification/status badge if relevant

Secondary information such as contact number and record number should only remain visible if it does not reduce readability. Otherwise expose it after opening the patient.

### Interaction

- entire card is tappable;
- chevron may remain as an affordance but must not be the only tap target;
- long patient names wrap safely;
- no fixed widths causing overflow;
- clear pressed state;
- preserve existing patient-open behavior.

## Desktop

Keep the current desktop table where appropriate.

## Preserve

- filters;
- pagination;
- sorting;
- patient selection;
- role permissions;
- queries;
- current data source;
- patient detail workflow;
- no full-page refresh.

---

# Phase BHW-UI-4 — Four-Step Patient Registration Wizard

## Goal

Turn BHW patient registration into a guided, forgiving, touch-first workflow.

Do not change the underlying patient-registration business rules just to fit the redesign.

## Global wizard behavior

Show a clear four-step progress indicator:

1. **Basic Information**
2. **Personal Information**
3. **PhilHealth & Classification**
4. **Review & Confirm**

Requirements:

- current step clearly highlighted;
- completed steps visually distinct using existing MediSens states;
- Back and Continue are large and obvious;
- preserve values when navigating between steps;
- validation errors appear beside the affected field;
- do not wipe entered values on orientation change or navigation between steps;
- warn before abandoning an unfinished registration if data would be lost;
- no horizontal form scrolling.

---

## Step 1 — Basic Information

Use the current registration fields/business rules.

Expected information includes the existing equivalents of:

- Last Name
- First Name
- Middle Name
- Suffix
- Birthday
- Age (auto-calculated/read-only if that is current behavior)
- Sex

### Touch UX

For short choices such as Sex:

- use large selectable controls instead of a tiny dropdown;
- maintain the current stored values and validation.

Keep name fields large and easy to read.

---

## Step 2 — Personal Information

Use existing patient fields such as:

- Barangay/address;
- house number/street;
- contact number;
- civil status;
- nationality;
- employment status;

only where these already exist in the current system.

### Touch UX

- use large dropdowns/select controls;
- use large option buttons where the option set is short;
- preserve existing formats and validation;
- do not invent new patient fields.

---

## Step 3 — PhilHealth & Classification

Preserve the current MediSens fields and allowed values.

Potential UI patterns:

- PhilHealth number input;
- large category selection buttons;
- large classification selection buttons.

Do not rename backend values or change classification semantics without explicit approval.

Selected options must have a strong but existing MediSens active state.

---

## Step 4 — Review & Confirm

Do not dump a long readonly form.

Present a readable summary grouped into existing registration categories.

Suggested sections:

- Basic Information
- Personal Information
- PhilHealth & Classification
- other existing required registration sections

Allow the BHW to review before creating the patient.

Where appropriate, provide an obvious **Edit** action that returns to the relevant step without losing other values.

Preserve the existing final confirmation requirement and **Register Patient** business logic.

## Submit feedback

On final registration:

- prevent duplicate submissions;
- show an immediate saving state;
- disable the submit control while saving;
- retain the existing toast/success behavior;
- never rely on toast alone as the only interaction feedback.

---

# Phase BHW-UI-5 — Patient Details and Consent Entry Points

## Goal

Make the transition from patient discovery to patient action clear and touch-friendly.

## Patient details/preview

On tablet/mobile:

- use a readable card, sheet, or slide-over pattern consistent with current MediSens;
- show core patient identity first;
- expose actions as large buttons;
- avoid dense desktop tables;
- no horizontal overflow.

## Consent

Preserve the existing rule that consent recording is initiated from the correct BHW Patient Directory workflow.

Do not duplicate `Record Consent` into unrelated screens.

The consent status must remain clear:

- Pending
- Signed

Use only the existing MediSens status colors/labels.

## Signature redesign

Do not implement a new signature redesign in this phase unless separately approved.

The current signature workflow must remain functional while the rest of the BHW UI is redesigned.

---

# Phase BHW-UI-6 — Touch Interaction and Accessibility Pass

## Goal

Make the redesigned BHW experience comfortable for users with limited digital familiarity without creating a separate visual theme.

## Verify

### Touch

- interactive targets ≥44×44 px;
- buttons have clear pressed states;
- cards do not require precise chevron taps;
- short-choice buttons are comfortably spaced;
- no accidental neighboring activation.

### Typography

Use the current MediSens font family.

Increase touch-layout sizing through the existing typography system where needed, but do not introduce a new type scale unrelated to the product.

Prioritize:

- readable patient names;
- readable form labels;
- readable button labels;
- clear step titles.

Avoid unnecessary tiny metadata.

### Contrast

Maintain accessible contrast using the current approved palette.

### Focus/keyboard

Desktop/tablet keyboard accessibility must remain usable:

- visible focus;
- logical focus order;
- Enter/Space activation where appropriate;
- Escape closes dialogs/drawers where already supported.

### Motion

Respect existing reduced-motion rules.

### Scrolling

- native vertical scrolling;
- no page-level horizontal scrolling;
- no hidden scroll locks after modal/drawer close.

---

# Phase BHW-UI-7 — Loading, Feedback, Error and Offline States

## Goal

Ensure the simplified UI remains understandable during real RHU conditions.

## Loading

Follow current MediSens loading guidance:

- use content-shaped skeletons for initial load;
- do not blank the entire page during filters/tab updates;
- preserve visible content while updating when possible.

## Saving

Every important write action must show:

- pressed state;
- disabled/in-flight state;
- clear progress label such as `Saving...`;
- success/error feedback.

## Validation

Prefer field-level errors.

Avoid generic messages that force the BHW to search for the problem.

## Empty states

Provide clear plain-language states for:

- no recent registrations;
- no patients found;
- no Pending consent;
- no Signed consent.

## Connectivity

Preserve existing MediSens online/offline state behavior.

Do not fake offline support that is not already implemented.

---

# Phase BHW-UI-8 — Runtime Regression and Role Safety

## Goal

Confirm that the tablet/mobile redesign changed presentation and interaction only, not healthcare workflow permissions or data behavior.

## BHW workflow regression

Verify:

- Login
- Home
- Register Patient
- Find Patient
- Recent Registrations
- Patient Directory
- All / Pending / Signed
- Record Consent
- Patient Records
- Patient details
- navigation Back/Forward
- mobile/tablet scrolling
- logout

## Cross-role regression

Because shared components/styles may be touched, verify no regressions to:

- Nurse
- Doctor
- Midwife
- Laboratory
- Pharmacist
- Admin

especially shared:

- Patient Records;
- Patient detail components;
- cards;
- modals;
- navigation;
- global CSS.

## Data safety

Confirm:

- patient writes still target existing patient records/tables;
- consent writes remain unchanged;
- RLS remains unchanged unless separately approved;
- audit logging remains unchanged;
- no new duplicate patient writes;
- no hard refresh introduced.

---

# Phase BHW-UI-9 — Final Device QA and Sign-Off

## Required runtime QA

Test the final BHW touch interface on:

- 390 px mobile;
- 430 px mobile;
- representative Android tablet portrait;
- representative Android tablet landscape;
- desktop.

## Verify on physical touch device where possible

Check:

- comfortable tap targets;
- readable labels;
- scroll behavior;
- keyboard opening/closing;
- orientation change;
- form value persistence;
- patient-card tapping;
- bottom navigation;
- filters;
- registration wizard;
- consent entry point;
- no horizontal overflow.

## Final acceptance condition

The redesign is accepted only if an older BHW can reasonably complete the primary workflows without needing to understand the system's module structure or precisely target small controls.

The intended experience is:

**Open MediSens → see the task → tap the task → follow the guided steps → receive clear confirmation.**

---

# 5. Implementation Safety Rules

For every phase:

1. Read this file as the source of truth.
2. Preserve current business logic unless the phase explicitly requires a functional change.
3. Prefer existing shared MediSens components/tokens.
4. Do not add dependencies simply to reproduce the mockup.
5. Do not introduce a new icon library.
6. Do not invent new colors or fonts.
7. Do not change RLS/permissions unless explicitly approved.
8. Do not change database schema for a visual redesign unless absolutely required and approved.
9. Do not introduce hard page refreshes.
10. Do not introduce horizontal page scrolling.
11. Scope tablet/mobile BHW styles so other roles are not accidentally redesigned.
12. Run:
    - TypeScript check;
    - production build;
    - `git diff --check`.
13. Perform runtime viewport checks when browser access is available.
14. Stop without committing after each phase for manual review.

---

# 6. Recommended Phase Execution Order

```text
BHW-UI-0  Current UI Inventory and Safety Baseline
BHW-UI-1  Tablet/Mobile BHW Shell
BHW-UI-2  Home Redesign
BHW-UI-3  Patient Records Touch Redesign
BHW-UI-4  Four-Step Patient Registration Wizard
BHW-UI-5  Patient Details and Consent Entry Points
BHW-UI-6  Touch Interaction and Accessibility Pass
BHW-UI-7  Loading, Feedback, Error and Offline States
BHW-UI-8  Runtime Regression and Role Safety
BHW-UI-9  Final Device QA and Sign-Off
```

---

# 7. Prompting Pattern

Use short phase prompts.

Example:

```text
Proceed with Phase BHW-UI-0. Read BHW-UI.md as the source of truth. Preserve existing logic and stop without committing.
```

Then continue one phase at a time only after manual review.

---

## Final Design Principle

The approved mockups are **layout and interaction references**, not permission to replace MediSens's existing visual identity.

The implementation must look like **MediSens redesigned for touch**, not a different product inspired by MediSens.
