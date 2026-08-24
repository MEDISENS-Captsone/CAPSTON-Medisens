# SKILL-UI.md — MediSens Interface Design System

**Project:** MediSens — Secure Digital Health Record System for Malvar Rural Health Unit  
**Version:** 2.0  
**Status:** Current visual and interaction source of truth  
**Audience:** Claude Code, Codex, and human developers working on MediSens UI  
**Platform:** Responsive Progressive Web App for desktop, tablet, and mobile

---

# Visual Source of Truth

The file:

docs/design/medisens-ui-reference.png

is the canonical visual reference for MediSens.

Before implementing any new UI, redesigning existing screens, or creating reusable components, inspect this reference first.

Unless explicitly instructed otherwise, every visible interface should follow its visual language.

Replicate its:

- visual hierarchy
- spacing
- typography
- sidebar proportions
- card density
- border treatment
- subtle claymorphism
- dashboard composition
- layout rhythm
- component quality
- visual density

Do not copy:

- logos
- branding
- colors
- financial terminology
- dashboard content
- charts
- widgets

Adapt the same design language to MediSens's healthcare workflows.

The reference image defines the application's visual language, not its functionality.

If the reference image conflicts with existing MediSens workflows, permissions, accessibility requirements, or business logic, preserve MediSens behavior and adapt only the presentation.

Priority order:

1. Existing MediSens business logic
2. Existing role permissions
3. Existing workflows
4. SKILL-UI.md
5. docs/design/medisens-ui-reference.png

---

Do not copy:

- logos
- branding
- colors
- dashboard content
- financial terminology
- charts
- widgets

Copy only:

- spacing
- typography
- hierarchy
- proportions
- layout rhythm
- component quality
- card styling
- border treatment
- subtle claymorphism
- visual density

---

## 1. Purpose

This file defines how MediSens should **look, feel, and behave** across its seven current staff role shells:

1. Admin
2. BHW
3. Nurse
4. Doctor
5. Midwife
6. Pharmacist
7. Laboratory

The database role string for Laboratory may remain exactly `labaratory` where required by the existing backend. The visible interface label must remain **Laboratory**.

This file governs:

- visual direction
- design tokens
- shell and layout behavior
- responsive behavior
- component appearance
- loading, feedback, and empty states
- accessibility
- UI implementation boundaries

It does **not** redefine:

- role permissions
- routes
- database schema
- RLS policies
- RPCs or Edge Functions
- clinical validation rules
- workflow order
- offline synchronization architecture

Detailed clinical UI patterns live in `UI-CLINICAL-PATTERNS.md`. Future offline and synchronization goals live in `PWA-OFFLINE-TARGET.md`.

---

## 2. Authority and conflict resolution

When instructions conflict, use this order:

1. The user’s current task and explicit approval
2. Confirmed MediSens project decisions
3. Existing codebase behavior, permissions, and business logic
4. This file
5. Future-state guidance in `PWA-OFFLINE-TARGET.md`

The codebase is authoritative for what currently exists. This file is authoritative for how approved UI should be expressed.

A UI task must not silently invent missing workflows or implement target-state capabilities. When a design recommendation requires a logic change, keep the existing logic, document the dependency, and continue with the safe UI portion.

---

## 3. Requirement language

- **MUST:** required for approval
- **SHOULD:** strong default; deviation needs a clear reason
- **MAY:** optional when useful
- **TARGET:** future direction; do not implement unless the task explicitly requests it

---

## 4. Approved visual direction

### 4.1 Reference interpretation

MediSens should follow the overall visual character of the approved reference UI without copying its brand, finance content, promotional card, or exact arrangement.

The intended direction is:

- a compact operational workspace rather than a marketing dashboard
- a light grey application canvas
- crisp white content surfaces
- soft, restrained depth similar to subtle claymorphism
- rounded but not bubbly components
- a slim, clearly grouped left navigation on desktop
- a compact utility header with search, status, and account actions
- modular grids that feel balanced and efficient
- dark, highly legible typography
- restrained accent color
- small status tints and icon containers rather than large decorative color blocks
- dense information presented with breathing room

The reference is a **style compass**, not a layout template. MediSens must still prioritize patient identity, clinical safety, role workflows, accessibility, and mobile PWA behavior.

### 4.2 One-sentence direction

**MediSens should feel like a modern, well-organized RHU workspace: calm, compact, softly structured, easy to scan, and trustworthy during a long clinic day.**

### 4.3 Desired qualities

| Desired | Avoid |
|---|---|
| Clean and operational | Marketing-site presentation |
| Compact but breathable | Cramped tables and tiny text |
| Softly elevated surfaces | Heavy shadows and floating card stacks |
| Serious but approachable | Cold enterprise software |
| Consistent across roles | A different visual language per module |
| Clear status communication | Random color-coded decoration |
| Touch-friendly | Desktop UI squeezed into mobile |

### 4.4 Subtle claymorphism, not full claymorphism

MediSens may use a restrained soft-surface treatment inspired by the reference:

- white or near-white surfaces
- a quiet 1px border
- a faint top inner highlight
- a very soft, short shadow
- 10–14px radii

It must not use:

- inflated pill-like cards
- strong inner shadows
- large floating shadows
- glossy gradients
- embossed text
- excessive rounded containers

The result should feel tactile enough to separate layers, but flat enough for clinical data to remain the focus.

---

## 5. Current product constraints

### 5.1 Current role shells

MediSens currently has seven staff role shells. Do not create or imply a patient portal unless the user explicitly adds it to scope.

**Patient Portal exception (Patient Account Phase 4, `docs/patientAccount.md` §8/§17):** the Patient Portal (`pages/patient.html`, `src/app/patient/`) is an explicitly-scoped eighth shell, built for patients/guardians/caregivers rather than staff. It is a separate design context from the seven role shells below — it does not follow §5.2's drawer requirement (see that section) and is not a role shell this document otherwise governs. Its own token/layout rules live in `src/styles/patient-portal.css` and `docs/patientAccount.md`.

### 5.2 Mobile navigation

The current approved mobile shell uses a **navigation drawer**. R1 runtime testing already covered and fixed drawer keyboard behavior across all seven role shells.

Therefore:

- Preserve the mobile drawer.
- Do not replace it with bottom navigation during module-level work.
- Do not redesign the global shell unless the task explicitly requests a shell redesign.
- The drawer must trap focus correctly, close with Escape, restore focus to the trigger, and remain usable with the on-screen keyboard.

**Patient Portal exception:** the Patient Portal shell uses **bottom tabs**, not the drawer (thumb reach, permanent visibility, no hidden navigation for low-literacy users — `docs/patientAccount.md` §8). This is a deliberate, documented exception for that one shell; it does not license bottom navigation anywhere in the seven staff shells above.

### 5.3 Preserve established decisions

Examples of confirmed decisions that UI work must respect:

- BHW uses **Patient Records**, not “Records.”
- Doctor patient preview includes **Consult** beside **Edit profile**.
- Laboratory patient preview uses a right slide-over with a subtle blurred backdrop.
- Pharmacist preview should remain narrower than the general patient preview.
- Patient history filters are **All**, **Consultations**, and **Initial**.
- Maternal Care must block male patient entries according to existing business logic.
- Doctor retains access to Geographic Analytics.
- Initial loading uses skeletons; background updates retain content.

These examples are not a complete feature list. Always inspect the implementation before making changes.

---

## 6. Core design principles

### P1. Clinical clarity before decoration

Every visual choice must help the user identify a patient, understand status, enter information, or complete a task.

### P2. One dominant action, not one action total

Each screen should have one visually dominant action. Necessary secondary actions may remain visible as outline, ghost, or text controls.

Example:

- **Consult** — primary
- **Edit profile** — secondary
- **More actions** — overflow

### P3. Patient context remains visible

On any single-patient workflow, the patient name and key identity must remain visible or immediately reachable. See `UI-CLINICAL-PATTERNS.md`.

### P4. Shared grammar across roles

All roles share:

- the same visual tokens
- the same page header structure
- the same form grammar
- the same table behavior
- the same responsive patterns
- the same feedback system

Modules and priorities vary. The interaction language does not.

### P5. Mobile is designed, not compressed

Mobile must use deliberate stacked layouts, full-width controls, readable text, and stable navigation. Do not shrink desktop tables until they technically fit.

### P6. Repetitive work receives the shortest path

High-frequency actions should be obvious and near the relevant record. Low-frequency administrative actions may live in an overflow menu or secondary page.

### P7. Status is readable without color

Every meaningful status uses text. Important states should also use an icon. Color is reinforcement only.

### P8. Keep content visible during refresh

Filters, tab changes, pagination, and background refreshes must not blank the page. Existing content remains visible with a subtle updating state.

### P9. Reduce cognitive load

Use grouping, spacing, consistent placement, and progressive disclosure. Do not show every possible action at once.

### P10. The tenth-hour test

Design for a user who has already handled dozens of records that day. Avoid fragile interactions, tiny controls, hidden labels, and visual noise.

---

## 7. Visual tokens

Use tokens through the existing theme system, Tailwind configuration, CSS variables, or component theme. Do not add a second parallel token system.

### 7.1 Core palette

```css
:root {
  --ms-canvas: #F3F5F6;
  --ms-canvas-soft: #F7F8F9;
  --ms-surface: #FFFFFF;
  --ms-surface-soft: #F8FAFA;
  --ms-surface-muted: #EEF2F3;

  --ms-navy-950: #0B2230;
  --ms-navy-900: #102E40;
  --ms-navy-800: #173E54;
  --ms-navy-700: #1D4E68;
  --ms-navy-600: #286781;
  --ms-navy-200: #BCD4DF;
  --ms-navy-100: #DCEAF0;
  --ms-navy-50: #EEF6F8;

  --ms-text-primary: #14212A;
  --ms-text-secondary: #52616B;
  --ms-text-muted: #687781;
  --ms-text-inverse: #FFFFFF;

  --ms-border: #DDE3E6;
  --ms-border-strong: #C7D0D5;
  --ms-divider: #E8ECEE;

  --ms-success: #126B3D;
  --ms-success-soft: #E7F4EC;
  --ms-warning: #855400;
  --ms-warning-soft: #FFF3D8;
  --ms-error: #B42318;
  --ms-error-soft: #FDECEA;
  --ms-info: #1D4ED8;
  --ms-info-soft: #EAF1FF;
  --ms-neutral: #59656E;
  --ms-neutral-soft: #EEF1F2;

  --ms-overlay: rgba(10, 25, 34, 0.42);
}
```

### 7.2 Color usage

- Navy is the structural brand color for primary actions, links, focus states, active navigation, and strong headings.
- Green is reserved for successful or completed states.
- Yellow/amber is reserved for pending, due, caution, and attention states.
- Red is reserved for destructive actions, failures, abnormal critical values, and urgent safety alerts.
- White and soft grey dominate the interface.
- Large areas of red, yellow, or green are prohibited.
- Do not assign a different accent color to every role or module.

### 7.3 Active navigation

Use:

- pale navy background
- dark navy text
- small leading or left indicator
- medium font weight

This recreates the clear, softly highlighted active state seen in the visual reference while keeping MediSens branding distinct.

### 7.4 Typography

Preferred family:

```css
--ms-font-sans: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
--ms-font-mono: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
```

If the current project already uses an appropriate sans-serif family, keep it. Do not add a webfont only for aesthetic preference.

#### Type scale

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| Micro | 11px / 16px | 600 | group labels, compact badges |
| XS | 12px / 18px | 400–500 | timestamps, compact metadata |
| Small | 13px / 20px | 400–600 | secondary UI, table headers |
| Table | 14px / 20px | 400–600 | desktop tables and dense lists |
| Base | 16px / 24px | 400 | body text, mobile content, inputs |
| H4 | 16px / 22px | 600 | card and fieldset headings |
| H3 | 18px / 26px | 600 | section headings |
| H2 | 21px / 29px | 650 | modal and major section titles |
| H1 | 24–26px / 32px | 700 | page title |
| Metric | 26–30px / 34px | 650 | operational summary count |

Rules:

- Keep mobile form inputs at 16px minimum.
- Use `font-variant-numeric: tabular-nums` for counts, dates, vitals, measurements, and financial-style aligned metrics.
- Use mono only for identifiers, reference numbers, lot numbers, and system codes.
- Do not use oversized hero headings inside staff workflows.

### 7.5 Spacing

Base unit: 4px.

| Token | Value |
|---|---|
| 1 | 4px |
| 2 | 8px |
| 3 | 12px |
| 4 | 16px |
| 5 | 20px |
| 6 | 24px |
| 7 | 32px |
| 8 | 40px |
| 9 | 48px |

Applied defaults:

- desktop page padding: 24–32px
- tablet page padding: 20–24px
- mobile page padding: 16px
- card padding: 16–20px
- dashboard grid gap: 12–16px
- major section gap: 24–32px
- form field gap: 16px
- fieldset gap: 28–32px

The reference style is compact. Avoid exaggerated 48–64px gaps inside working screens.

### 7.6 Radius

```css
--ms-radius-xs: 4px;
--ms-radius-sm: 8px;
--ms-radius-md: 10px;
--ms-radius-lg: 12px;
--ms-radius-xl: 14px;
--ms-radius-full: 9999px;
```

Use consistently:

- inputs: 8–10px
- buttons: 10px
- cards and table shells: 12px
- modals and slide-overs: 14px
- badges and avatars: full

Avoid mixing several radii on one screen merely for visual variety.

### 7.7 Borders and shadows

```css
--ms-shadow-soft:
  0 1px 2px rgba(13, 33, 44, 0.04),
  0 8px 24px -20px rgba(13, 33, 44, 0.28);

--ms-shadow-float:
  0 12px 30px -16px rgba(13, 33, 44, 0.28);

--ms-inset-highlight:
  inset 0 1px 0 rgba(255, 255, 255, 0.72);
```

- Cards may use `--ms-shadow-soft` plus a 1px border.
- Tables may use a border and little or no shadow.
- Floating elements use `--ms-shadow-float`.
- Never use colored shadows, large glows, or multiple heavy shadow layers.

---

## 8. Application shell

### 8.1 Desktop

- persistent left sidebar at approximately 232–248px
- compact top header at approximately 56px
- light grey canvas behind white content surfaces
- main content max width of 1280–1440px depending on module
- header and sidebar separated by subtle dividers, not heavy elevation

### 8.2 Sidebar

Structure:

1. MediSens brand and facility context
2. grouped role navigation
3. utility/system links where permitted
4. user and role block
5. connection or sync state when implemented

Rules:

- icons are outline style and use one library
- labels remain visible at standard desktop width
- active item uses a pale navy tint and a small indicator
- counts use compact neutral badges
- no promotional card, upgrade panel, or decorative footer content
- restricted modules are not rendered

### 8.3 Header

Possible contents, based on current implementation:

- drawer/sidebar trigger
- page context or breadcrumb
- scoped/global search where available
- connection or background activity status
- notification/task indicator where implemented
- profile menu with current role

Keep the header compact. Do not turn it into a large page hero.

### 8.4 Mobile shell

- preserve the current navigation drawer
- compact top app bar with 44px controls
- page title may truncate but must remain understandable
- account and utility actions must not crowd the primary workflow
- drawer overlay uses a subtle blur only when supported and readable
- drawer must not cover focused form content after closing
- respect safe-area insets in installed PWA mode

### 8.5 Page header

Standard order:

1. breadcrumb or back context when needed
2. page title
3. concise one-line context, optional
4. primary and secondary actions
5. filters or tabs

On desktop, title and actions may share a row. On mobile, actions stack beneath the title or move into a sticky action area.

A contextual greeting may appear on dashboards, such as:

`Good morning, Maria · Nurse · Malvar RHU`

It must remain a compact orientation line, not a marketing hero. Do not use emoji.

---

## 9. Dashboard composition

The approved reference uses a balanced modular dashboard. Adapt that structure to role work rather than copying finance cards.

### 9.1 Recommended desktop pattern

```text
[Page context and primary action]
[3–4 compact summary cards]
[Primary queue / operational chart or list occupying most width]
[One secondary panel: alerts, recent activity, or follow-ups]
```

### 9.2 Summary cards

Each summary card may include:

- a small line icon in a quiet tinted container
- a concise label
- one count or operational metric
- a small trend or context line only when meaningful
- one subtle overflow or drill-down affordance

Rules:

- 3–5 summary cards maximum
- counts should link to the relevant filtered list when possible
- avoid vanity totals
- avoid giant numbers
- no gradients
- no decorative charts inside every card
- do not use red merely to attract attention

### 9.3 Primary work queue

The main queue or table should be the largest dashboard area for roles that perform operational work.

Examples:

- Nurse: intake queue
- Doctor: patients awaiting consultation
- Laboratory: pending requests
- Pharmacist: pending prescriptions
- Midwife: maternal care follow-ups
- BHW: recent registrations or assigned patient work
- Admin: user and system activity

### 9.4 Dashboard cards versus sections

Cards are appropriate for discrete operational summaries. Do not wrap every heading, filter bar, and table in separate nested cards.

Use a section without a card when:

- it is the main content of the page
- spacing and a heading are enough
- a card would create a card-inside-card effect

---

## 10. Responsive layout

### 10.1 Breakpoints

| Range | Layout |
|---|---|
| <360px | compact phone, single column |
| 360–767px | phone, drawer navigation, single column |
| 768–1023px | tablet, drawer or compact rail according to current shell |
| 1024–1439px | laptop, persistent sidebar |
| ≥1440px | desktop, capped content width |

Minimum runtime checks:

- approximately 390×844 mobile
- 768×1024 tablet
- 1440×900 desktop
- 200% browser zoom

### 10.2 Mobile behavior

- all important targets at least 44×44px
- form controls at least 48px high where practical
- one-column forms
- full-width primary actions for long forms
- readable 16px inputs
- no horizontal page overflow
- patient and table rows become stacked summaries, not miniature desktop rows
- drawers, dialogs, and slide-overs must remain keyboard and screen-reader usable

### 10.3 Tablet behavior

Tablet is not “wide mobile.” It should use available space deliberately:

- two-column summary grids
- two-column short forms only when labels remain readable
- filter drawers instead of overcrowded filter rows
- side panels may remain panels in landscape, but should become full-screen or bottom sheets in portrait where needed

### 10.4 Zoom and text scaling

At 200% browser zoom:

- content must reflow
- controls must remain reachable
- sticky regions must not consume most of the viewport
- no information may disappear because of fixed heights
- tables may move to a stacked-row pattern when width effectively collapses

---

## 11. Component standards

### 11.1 Buttons

Variants:

- **Primary:** navy fill, white text
- **Secondary:** white surface, strong border, dark text
- **Ghost:** transparent, quiet text, soft hover background
- **Destructive:** red fill or red text depending on emphasis
- **Link:** inline navigation only

Rules:

- one visually dominant action per screen or panel
- labels use specific verbs: `Save consultation`, `Record vitals`, `Release result`
- loading keeps button width stable and changes the label to `Saving…`
- prevent duplicate submission
- icon-only controls require an accessible name and desktop tooltip

### 11.2 Inputs

- persistent visible label above the field
- placeholder is an example, never the label
- helper or error text directly below
- 40px desktop height, 48px touch height
- 16px font on mobile
- units remain visible beside medical values
- focus uses a navy border and visible outer ring
- read-only and disabled states must look different

### 11.3 Cards

- white or near-white surface
- 1px border
- 12px radius
- soft shadow only
- compact 16–20px padding
- no gradient fill
- no decorative status stripe unless it communicates a real state
- avoid cards nested inside cards

### 11.4 Tables

Desktop:

- semantic table markup
- 40–48px rows
- sticky header when the list is long
- light horizontal dividers
- no heavy vertical grid
- clear hover and focus states
- whole-row navigation only when it does not conflict with row controls
- one compact trailing action menu where possible

Mobile:

- retain the most important identity and status fields
- stack secondary details below
- make the row a clear 64px+ target
- use a divider rather than turning every row into a large floating card
- use horizontal scrolling only for truly matrix-shaped data

### 11.5 Filters and search

- filter bar belongs close to the content it affects
- active filters appear as removable chips or clear controls
- preserve filter values during navigation where already supported
- filtering keeps old content visible and shows `Updating…`
- mobile filters open in a drawer or bottom sheet

### 11.6 Tabs

Use tabs only for parallel views of the same object or module.

- current tab is visually clear through weight and underline/indicator
- tab labels remain readable
- mobile tabs may horizontally scroll
- changing tabs must not blank global page context

### 11.7 Dialogs and slide-overs

Dialog:

- one focused decision or short form
- explicit title and consequence
- keyboard focus trapped
- Escape closes unless doing so would discard work without warning
- focus returns to trigger

Slide-over:

- preview or focused edit without losing list context
- subtle backdrop blur is allowed when contrast remains sufficient
- right side on desktop
- full-screen sheet on narrow mobile
- no nested modal stacks

### 11.8 Toasts and inline feedback

- success confirmation may use one toast
- failures must also be visible near the affected action or section
- do not stack multiple toasts
- use polite live announcements for success
- use assertive announcements for genuine errors and critical alerts

### 11.9 Empty states

Every empty state should answer:

1. What is empty?
2. Why might it be empty?
3. What can the user do next?

Example:

`No patients match these filters.`  
`Clear filters or search using another patient name or ID.`

### 11.10 Skeletons

- mirror the real content shape
- use the correct row/card dimensions
- avoid a generic centered spinner
- initial load only
- static or low-motion version under `prefers-reduced-motion`

---

## 12. Loading and refresh behavior

### 12.1 Initial load

Use content-shaped skeletons for:

- page header context
- summary cards
- table rows
- patient preview
- form sections

### 12.2 Background refresh

Keep existing content visible. Show one of:

- `Updating…` beside the section title
- a small inline spinner
- a thin route progress line
- reduced opacity on the updating table body, without disabling filters unnecessarily

### 12.3 Filter, tab, and pagination changes

- do not blank the page
- do not replace the entire page with a skeleton
- preserve filters, current tab, and scroll position where possible
- do not clear search text while fetching

### 12.4 Slow and failed loads

After an unusually long wait, replace indefinite skeletons with clear text and a retry action.

Example:

`Still loading patient records.`  
`Check your connection and try again.`  
`[Retry]`

---

## 13. Status and feedback

Status vocabulary must be consistent **within each workflow lifecycle**, not forced across unrelated workflows.

### 13.1 Patient queue states

Examples according to existing implementation:

- Waiting for intake
- Waiting for consultation
- In consultation
- Completed
- Cancelled

### 13.2 General task states

- Pending
- In progress
- Completed
- Failed

### 13.3 Laboratory states

Use the existing lifecycle in the codebase. Typical labels may include:

- Requested
- Collected
- In progress
- Resulted
- Released
- Cancelled

Do not change backend status values during a UI task.

### 13.4 Prescription states

Use the existing lifecycle. Typical visible labels may include:

- Pending
- Partially dispensed
- Dispensed
- Cancelled

### 13.5 Rules

- every status has a visible text label
- critical or easily confused statuses should add an icon
- badges are not controls
- status changes require an explicit action
- do not rename status values in one module only

---

## 14. Accessibility baseline

All new or modified UI MUST meet this baseline.

### 14.1 Keyboard

- every interactive element reachable by keyboard
- logical focus order
- visible focus ring
- Escape closes menus, drawers, and dialogs
- overlays trap focus and return it to the trigger
- no keyboard traps
- skip-to-content link remains available

### 14.2 Semantics

- use buttons for actions and anchors for navigation
- one `h1` per page
- semantic tables for tabular data
- real labels for form controls
- fieldsets and legends for grouped choices
- avoid clickable `div` elements

### 14.3 Announcements

- success toast: `aria-live="polite"`
- validation summary and action errors: `role="alert"` or assertive live region where appropriate
- loading region: `aria-busy="true"`
- drawer/dialog: correct accessible name and modal semantics

### 14.4 Contrast

- normal text: minimum 4.5:1
- large text and meaningful graphical controls: minimum 3:1
- disabled content remains readable
- meaningful text must not use a lighter token than `--ms-text-muted`

### 14.5 Touch and zoom

- 44px minimum touch target
- 8px minimum separation between adjacent controls
- 200% zoom without content loss
- no hover-only information
- support reduced motion

---

## 15. Content and microcopy

### 15.1 Tone

- direct
- calm
- professional
- plain-language
- sentence case

Avoid:

- emoji in the interface
- playful error wording
- vague buttons such as `Submit`, `OK`, or `Process`
- raw server errors
- unnecessary exclamation marks

### 15.2 Action labels

| Avoid | Use |
|---|---|
| Submit | Save consultation |
| Add | Register patient |
| Process | Dispense medicine |
| Publish | Release result |
| Delete patient | Archive record |
| Retry request | Retry |

### 15.3 Errors

State what happened and what the user can do.

Good:

`Couldn't save the consultation. Your entries are still here. Check your connection and try again.`

Bad:

`Error 500.`

---

## 16. Role dashboard emphasis

This section guides visual priority only. It does not add modules or permissions.

### Admin

Emphasize:

- user management
- archive review
- audit log
- operational/system statuses already implemented

### BHW

Emphasize:

- recent registrations
- patient records
- registration entry points
- patient preview
- clear mobile use

### Nurse

Emphasize:

- nursing intake queue
- patient records
- initial consultation entry points
- vital signs entry points

### Doctor

Emphasize:

- patient queue and preview
- consultation entry
- history
- laboratory and prescription workflows
- Geographic Analytics where currently permitted

### Midwife

Emphasize:

- maternal care
- visit and census workflows already implemented
- safe eligibility/sex restrictions from current business logic

### Pharmacist

Emphasize:

- pending prescription work
- narrower preview panel
- clear dispense status

### Laboratory

Emphasize:

- pending requests
- request/result states
- right slide-over preview with subtle backdrop blur

---

## 17. Anti-patterns

Do not introduce:

- gradient cards or buttons
- glassmorphism
- oversized greeting heroes
- generic AI dashboard visuals
- random role colors
- card soup
- heavy shadows
- mixed icon libraries
- emoji as interface icons
- hidden field labels
- tiny mobile text
- desktop tables simply shrunk on mobile
- full-page blank loading after initial render
- full-page reloads for filters
- stacked toasts
- optimistic success for clinical saves
- destructive actions without confirmation
- inaccessible icon-only controls
- changes to business logic during UI work
- a patient-facing portal without explicit scope
- bottom navigation replacing the approved mobile drawer without explicit approval

---

## 18. Implementation rules for Claude Code and Codex

Before changing UI:

1. Read `CLAUDE.md` and the relevant sections of this file.
2. Inspect the page, imported components, shared shell, data hooks, and role guards.
3. Inspect sibling role shells when the change affects a shared pattern.
4. Reuse existing components and tokens.
5. Preserve workflows, permissions, validation, RPCs, database calls, and audit behavior.
6. Do not install a new UI, icon, chart, date, or animation library without approval.
7. Do not add hard-coded sample data.
8. Do not broaden the task into unrelated redesigns.
9. Do not implement `PWA-OFFLINE-TARGET.md` items unless the task explicitly requests them.
10. Keep TypeScript safety. Do not add `any`, `@ts-ignore`, or unsafe assertions to bypass errors.

During implementation:

- use current tokens or add the smallest required token to the existing theme
- preserve existing route and URL behavior
- keep loading and error states complete
- verify shared component changes against every consumer
- maintain the current mobile drawer shell
- use actual role labels and module names from the codebase

Before completion, verify:

- 1440×900 desktop
- 768×1024 tablet
- approximately 390×844 mobile
- 200% zoom
- keyboard-only representative workflow
- loading, empty, error, disabled, success, and confirmation states relevant to the task

---

## 19. Required task summary

Every UI implementation report should state:

- files changed
- what was visually changed
- what was deliberately preserved
- breakpoints checked
- keyboard/accessibility checks completed
- loading and failure states checked
- shared role shells or consumers affected
- anything discovered but not changed because it was outside scope

Do not claim unobserved behavior passed.

---

## 20. Compact approval checklist

### Visual

- [ ] Follows the compact light-canvas, white-surface reference direction
- [ ] Uses restrained navy accents and semantic status colors
- [ ] Uses subtle depth, not heavy elevation
- [ ] No gradients, emoji, or decorative healthcare clichés
- [ ] Typography and spacing remain compact but readable

### Structure

- [ ] One dominant action
- [ ] Current mobile drawer preserved
- [ ] Shared layout grammar remains consistent across roles
- [ ] No invented modules or patient portal

### Responsive

- [ ] Desktop, tablet, mobile, and 200% zoom checked
- [ ] No horizontal page overflow
- [ ] Touch targets meet minimum size
- [ ] Tables reflow intentionally

### States

- [ ] Initial load uses skeletons
- [ ] Background refresh retains content
- [ ] Errors are actionable and do not erase input
- [ ] Success and error announcements are accessible

### Engineering

- [ ] Existing components reused
- [ ] No unrelated logic, permission, or database changes
- [ ] No unapproved dependency added
- [ ] No hard-coded sample data

---

*End of `SKILL-UI.md`.*
