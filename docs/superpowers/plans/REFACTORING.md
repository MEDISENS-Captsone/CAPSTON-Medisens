# REFACTORING.md

## MEDISENS Final Healthcare UI/UX Refactoring Plan

### Purpose

Codex must use every available skill, capability, and “superpower” as a Senior Healthcare Product Designer, Senior UX Engineer, Senior Frontend Architect, and RHU system reviewer to improve MEDISENS.

The goal is to make MEDISENS feel like a dependable RHU healthcare information system used daily by doctors, nurses, BHWs, midwives, laboratory staff, pharmacists, and administrators.

This is a UI/UX maturity refactor, not a feature rewrite.

---

## Non-Negotiable Rules

Preserve 100% of the RHU system functionality.

Do not change:

- Approved Use Case Diagram
- Workflows
- Role responsibilities
- Role permissions
- Supabase integration
- Database schema
- Business logic
- Authentication flow
- Patient, consultation, prescription, lab, vaccination, follow-up, reporting, and admin behavior

Allowed changes:

- UI layout
- Spacing
- Typography
- Component consistency
- Responsiveness
- Accessibility
- Tables/forms/modals
- Visual hierarchy
- Clinical information architecture

If a fix requires changing functionality or schema, do not implement it. Document it as a recommendation only.

---

# Priority 1 — Critical Healthcare UI Refactor

## Goal

Fix the biggest reasons MEDISENS still feels like a generic dashboard instead of real RHU healthcare software.

---

## Phase 1.1 — Replace Dashboard Thinking With RHU Work Queues

Audit all role dashboards.

Replace generic stat-card/dashboard patterns with RHU operational work queues.

Focus per role:

- Doctor: waiting patients, follow-ups due, pending lab results, unsigned/incomplete consultations
- Nurse: patients needing consent/vitals, patients ready for doctor, incomplete initial consultations
- Laboratory: pending lab requests, results to encode, completed results, flagged results if available
- Pharmacist: prescriptions to dispense, partially dispensed prescriptions, completed dispensing
- BHW: registrations, barangay records, follow-ups due, recently registered patients
- Midwife: maternal/child records, vaccinations due, follow-ups, census/reporting tasks
- Admin: users, system activity, role/account status, reports

Requirements:

- Reduce vanity metric cards.
- Prioritize queues, tables, lists, and actionable records.
- Do not invent backend behavior.
- Use existing data only.
- Preserve all workflows.

---

## Phase 1.2 — Rework Patient Details Into A Clinical Chart

Refactor patient details so it feels like a real patient chart, not scattered cards.

Organize clearly:

- Patient Summary
- Demographics
- Medical History
- Consultations / Encounters
- Vitals
- Laboratory
- Prescriptions
- Vaccinations
- Follow-ups
- Documents/attachments if available
- Transaction/history timeline if available

Requirements:

- Make longitudinal history easier to scan.
- Keep patient identity visible and clear.
- Connect consultations, labs, prescriptions, vaccines, and follow-ups as one chart.
- Reduce nested decorative cards.
- Preserve all patient-detail functionality.

---

## Phase 1.3 — Remove Vibe-Coded Decoration

Audit the whole UI and reduce patterns that feel AI-generated, amateur, or overly decorative.

Reduce:

- Excessive rounded cards
- Excessive shadows
- Floating dashboard cards
- Huge empty states
- Decorative avatar circles
- Hover scale effects on serious clinical surfaces
- Too many pastel badges
- Oversized padding
- Repeated nested cards
- Decorative icons that do not help workflow clarity

Replace with:

- Clean clinical panels
- Subtle borders
- Compact spacing
- Consistent 6–8px radius
- Quiet typography
- Professional healthcare density

---

## Phase 1.4 — Make Tables And Lists First-Class

Healthcare staff need fast scanning.

Improve table/list systems for:

- Patient registry
- Consultation queue
- Lab queue
- Pharmacy queue
- Vaccination records
- Follow-ups
- Reports
- Admin users

Requirements:

- Compact readable rows
- Clear columns
- Consistent status placement
- Search/filter toolbar consistency
- Stable empty/loading/error states
- Responsive behavior
- No unnecessary card/list hybrids when tables are better
- No horizontal overflow on normal screens

---

## Priority 1 Output

After Priority 1:

- List issues found
- List files changed
- Explain before/after improvements
- Confirm RHU functionality preserved
- Note remaining risks
- Run `npm run build`
- Update `UPDATE.md`

---

# Priority 2 — UI Discipline And Component Consistency

## Goal

Make MEDISENS feel like one mature healthcare system instead of separate pages with one-off styling.

---

## Phase 2.1 — Typography Discipline

Audit typography.

Fix:

- Overuse of `font-black`
- Overuse of uppercase labels
- Tiny `text-[10px]` for important clinical metadata
- Excessive tracking/widest text
- Headings that overpower patient data

Use:

- `font-medium`
- `font-semibold`
- Readable body text
- Clear labels
- Tabular numerals for counts, dates, vitals, ages, and lab values where useful

Typography should be boring, readable, and clinical.

---

## Phase 2.2 — Spacing And Responsive Layout Density

Audit spacing and viewport usage across all roles.

Fix:

- Unwanted whitespace
- Fixed widths
- Oversized max-width containers
- Large empty right-side areas
- Nested card padding
- Floating panels that waste space
- Inconsistent gaps

Requirements:

- MEDISENS must behave like a professional PWA.
- Layouts must adapt to the user’s screen resolution.
- Use fluid containers, flexible grids, and responsive panels.
- Keep mobile/tablet usability.
- No horizontal scrolling unless absolutely unavoidable for clinical tables.

---

## Phase 2.3 — Badge And Status Cleanup

Unify all status indicators.

Fix:

- Inconsistent `SYSTEM ONLINE` banners
- Duplicate online/offline designs
- Role-specific status styling
- Overuse of colored badges
- Remove the separate `Live Data` indicator everywhere

Requirements:

- Use one shared online/offline component.
- Text must be consistent: `SYSTEM ONLINE` and `SYSTEM OFFLINE`.
- Online: restrained blue/cyan.
- Offline: amber/orange.
- Status colors must be semantic and scarce.
- Do not remove actual network/realtime functionality.

---

## Phase 2.4 — Forms, Modals, And Dialogs

Audit every form, modal, dialog, and drawer.

Improve:

- Required field clarity
- Field grouping
- Label consistency
- Validation presentation
- Save/cancel states
- Modal sizing
- Keyboard flow where safe
- Empty/loading/error states

Reduce:

- Overdecorated modal styling
- Oversized modal padding
- Inconsistent headers
- One-off form layouts

Preserve all form submission and data behavior.

---

## Phase 2.5 — Component Reuse

Strengthen shared UI components.

Prefer one shared implementation for:

- Button
- Input
- Select
- Textarea
- Modal
- Table
- Search/filter toolbar
- StatusBadge
- EmptyState
- LoadingState
- PageHeader
- SectionHeader
- Role dashboard layout

Remove or refactor page-specific visual inventions only when safe.

---

## Priority 2 Output

After Priority 2:

- List inconsistencies found
- List components standardized
- List files changed
- List pages affected
- Note remaining duplicated UI patterns
- Run `npm run build`
- Update `UPDATE.md`

---

# Priority 3 — Polish, Accessibility, And Final QA

## Goal

Improve production readiness without risking RHU functionality.

---

## Phase 3.1 — Accessibility Pass

Audit and safely improve:

- Keyboard navigation
- Focus-visible styles
- Modal focus behavior
- Escape behavior for dialogs
- Input labels
- Form error messaging
- Toast/async announcements where possible
- Reduced motion support
- Color contrast
- Icon accessibility

Do not over-engineer. Prioritize safe visible improvements.

---

## Phase 3.2 — Responsive PWA QA

Test layouts across:

- Desktop
- Laptop
- Tablet
- Mobile
- Narrow mobile viewport
- iPhone-sized viewport

Check:

- No unwanted horizontal scrolling
- Tables degrade properly
- Forms remain usable
- Modals fit small screens
- Navigation remains accessible
- Touch targets are usable
- Content uses available space properly

---

## Phase 3.3 — Final Role QA

Review every role:

- Admin
- BHW
- Nurse
- Doctor
- Laboratory
- Pharmacist
- Midwife

Inspect:

- Dashboard
- Main workflow pages
- Tables
- Forms
- Modals/dialogs
- Patient details
- Status indicators
- Empty/loading/error states

Every role must feel like part of the same MEDISENS healthcare system.

---

## Phase 3.4 — Safe UI Cleanup

Clean only safe UI-related debt.

Allowed:

- Remove unused visual classes
- Remove duplicate UI fragments
- Consolidate repeated constants
- Remove unused imports
- Remove confirmed dead UI-only files
- Clean completed UI TODOs

Not allowed:

- Deleting active workflow code
- Changing Supabase queries
- Changing database logic
- Removing docs
- Removing compatibility wrappers unless verified safe
- Changing role behavior

---

## Priority 3 Output

After Priority 3:

- Give final UI quality score
- List accessibility improvements
- Give responsive QA notes
- Give per-role QA summary
- List files changed
- List remaining recommendations
- Run `npm run build`
- Update `UPDATE.md`

---

# Token-Saving Execution Prompts

Use one priority at a time.

## Prompt for Priority 1

```txt
Read REFACTORING.md. Implement Priority 1 only. Use every senior design/frontend skill available. Preserve all RHU functionality, Use Case Diagram, workflows, role permissions, Supabase integration, database schema, and business logic. Run npm run build and update UPDATE.md.