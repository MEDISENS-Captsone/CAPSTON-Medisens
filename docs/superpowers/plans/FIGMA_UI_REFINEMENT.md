# FIGMA_UI_REFINEMENT.md

## MEDISENS Figma-Inspired UI Refinement Plan

### Purpose

Use the Figma UI screenshots as **visual inspiration only** to refine MEDISENS into a cleaner, denser, more professional RHU Healthcare Information System.

The goal is to borrow the good UI ideas from the Figma concept while preserving the real MEDISENS workflows, role permissions, modules, routes, Supabase logic, database schema, and approved Use Case Diagram.

---

# Non-Negotiable Rules

Do not change:

- Approved Use Case Diagram
- Role permissions
- Role-based module/sidebar visibility
- Existing workflows
- Existing routes
- Supabase integration
- Database schema
- Business logic
- Authentication flow
- Patient, consultation, laboratory, prescription, vaccination, follow-up, reporting, and admin behavior

The Figma design must **not** be copied 1:1.

The Figma screenshots may show modules that some MEDISENS roles should not access. MEDISENS has strict role-based access. Each role must only see its approved modules/tabs.

Allowed changes:

- UI layout
- Spacing
- Typography
- Tables
- Buttons
- Sidebar/topbar styling
- Search/filter toolbar styling
- Patient registry layout
- Responsive behavior
- Component consistency
- Empty/loading/error states
- Action button placement

If a UI idea requires changing functionality, routes, permissions, or database behavior, do not implement it. Document it as a recommendation only.

---

# Design Direction

Use the Figma screenshots for:

- Compact healthcare dashboard style
- Professional sidebar/topbar
- Dense tables
- Clear search and filter toolbars
- Top-right primary action buttons
- Work-queue dashboard sections
- Clean patient registry layout
- Restrained blue clinical palette
- Reduced decorative styling
- Better information density

Do not copy:

- Figma’s full navigation structure
- Figma’s module list
- Figma’s role assumptions
- Any workflow that does not exist in MEDISENS
- Any access that violates current role permissions

MEDISENS must remain an RHU workflow system, not a generic hospital admin dashboard.

---

# Role Access Preservation

Before and after every phase, verify module visibility per role.

## Admin

Only approved admin modules should appear.

## BHW

BHW must only see approved BHW modules. Rename **Records** to **Patient Records** if still inconsistent.

## Nurse

Nurse must only access nurse-approved modules such as Patient Records, New Record, and Initial Consultation where applicable.

## Doctor

Doctor must only access doctor-approved modules such as Patient Records and Consultation Room where applicable.

Doctor-specific behavior:

- In Patient Records, clicking a patient must show Patient Details first.
- Do not auto-redirect to Consultation Room.
- Show a Doctor-only **Consult** button beside **Edit Profile**.
- Only clicking **Consult** should navigate to Consultation Room for that patient.

## Laboratory

Laboratory must only access lab-approved modules and workflows.

## Pharmacist

Pharmacist must only access pharmacy-approved modules and workflows.

## Midwife

Midwife must only access midwife-approved modules and workflows.

---

# Priority 1 — Safe Visual Foundation

## Phase 1.1 — Sidebar and Topbar Refinement

Use the Figma screenshots as visual reference for a cleaner sidebar and topbar.

Improve:

- Sidebar density
- Sidebar active states
- Sidebar section labels
- MEDISENS logo placement
- Topbar alignment
- User profile area
- Search/status/action alignment
- Consistent spacing

Requirements:

- Do not change role-specific module visibility.
- Do not add unauthorized modules.
- Do not rename routes.
- Keep existing navigation behavior.
- Ensure BHW label says **Patient Records**, not **Records**.

## Phase 1.2 — Shared Page Header Pattern

Standardize page headers across all roles.

Each main page should have:

- Clear page title
- Optional subtitle/context
- Primary action button on the top-right when allowed
- Secondary actions if needed
- Consistent spacing and alignment

Top-right primary action buttons are good, but only show them to roles allowed to perform that action.

Examples:

- **Register Patient** may appear in Patient Records only for roles allowed to create/register patients.
- **New Consultation** may appear only where consultation creation is allowed.
- Do not expose actions to unauthorized roles.

---

# Priority 2 — Patient Records and Tables

## Phase 2.1 — Patient Records Layout

Refine Patient Records using the good parts of the Figma Patient Registry concept.

Improve:

- Full-width responsive table
- Search bar placement
- Filter toolbar
- Top-right action button area
- Table spacing
- Column readability
- Status/badge consistency
- Action column clarity
- Pagination/footer if already supported

Requirements:

- Keep existing Patient Records functionality.
- Do not change data source or Supabase logic unless fixing a UI bug.
- Do not add unauthorized actions.
- Do not show **Register Patient** to roles that cannot register patients.
- Keep Doctor patient-click behavior: open Patient Details first, then Consult button redirects only when clicked.

## Phase 2.2 — Clinical Table System

Make tables feel like healthcare worklists, not decorative cards.

Apply consistent table styling to:

- Patient Records
- Consultation queues
- Lab queues
- Prescription/dispensing lists
- Vaccination records
- Follow-ups
- Reports
- Admin users

Improve:

- Compact row height
- Clear column hierarchy
- Search/filter consistency
- Empty/loading/error states
- Subtle borders
- Readable typography
- Consistent action buttons
- Responsive behavior

Avoid unnecessary card/list hybrids when a table is more appropriate.

---

# Priority 3 — Operational Dashboards

## Phase 3.1 — Replace Generic Dashboard Cards

Use the Figma Operational Dashboard idea, but adapt it to actual MEDISENS roles.

Replace generic dashboard/stat-card feeling with RHU work queues.

Role focus:

- Doctor: waiting patients, patients ready for consultation, follow-ups due, pending lab results, recent consultations
- Nurse: patients needing vitals/initial consultation, patients ready for doctor, recently assessed patients, incomplete records
- BHW: recently registered patients, follow-ups due, barangay/census records, registration tasks
- Midwife: maternal/child records, vaccinations due, follow-ups due, census/reporting tasks
- Laboratory: pending lab requests, results to encode, completed results today
- Pharmacist: prescriptions to dispense, dispensed prescriptions, partially dispensed items if supported
- Admin: user management, role/account status, reports/analytics overview, system activity if available

Requirements:

- Use existing data only.
- Do not invent backend features.
- Use safe empty states if data is unavailable.
- Do not change workflows.

---

# Priority 4 — Patient Details / Clinical Chart

## Phase 4.1 — Refine Patient Details

Use the Figma information density as inspiration, but design Patient Details as a clinical chart.

Patient Details should organize:

- Patient Summary
- Demographics
- Medical History
- Consultations / Encounters
- Vitals
- Laboratory
- Prescriptions
- Vaccinations
- Follow-ups
- Transaction Timeline

Requirements:

- Reduce nested decorative cards.
- Improve scanability.
- Keep patient identity visible.
- Keep existing Edit Profile behavior.
- Add Doctor-only **Consult** button beside **Edit Profile** if not yet implemented.
- Preserve all patient-detail functionality.

---

# Priority 5 — Responsive PWA Layout

## Phase 5.1 — Fluid Viewport Usage

MEDISENS must behave like a professional PWA.

Fix:

- Excessive whitespace
- Fixed widths
- Oversized max-width containers
- Narrow panels trapped on the left
- Large blank right-side areas
- Horizontal overflow
- Poor table responsiveness

Requirements:

- Use fluid containers.
- Use flexible grids.
- Use responsive panels.
- Use available viewport space properly.
- Maintain readability.
- Preserve mobile/tablet usability.

---

# Priority 6 — UI Consistency and Polish

## Phase 6.1 — Component Consistency

Standardize shared UI components.

Prefer one reusable pattern for:

- Buttons
- Inputs
- Selects
- Search/filter toolbars
- Page headers
- Tables
- Modals
- Status badges
- Empty states
- Loading states
- Error states

Avoid one-off page-specific visual inventions unless required.

## Phase 6.2 — Visual Cleanup

Reduce:

- Excessive shadows
- Oversized rounded cards
- Decorative avatars
- Too many pastel badges
- Hover scale effects on clinical surfaces
- Large empty states
- Overly bold typography
- Tiny unreadable metadata

Use:

- Subtle borders
- 6–8px radius
- Medium/Semibold typography
- Compact spacing
- Restrained blue/cyan accents
- Semantic colors only where meaningful

---

# Priority 7 — Final QA

## Phase 7.1 — Role Access QA

Verify every role:

- Admin
- BHW
- Nurse
- Doctor
- Laboratory
- Pharmacist
- Midwife

Confirm:

- Only approved modules appear.
- No unauthorized buttons appear.
- No workflow was changed.
- Sidebar labels are consistent.
- Patient Records behavior is correct.
- Doctor Consult button appears only for doctors.
- Register Patient appears only for roles allowed to register patients.

## Phase 7.2 — Build and Report

Run:

```bash
npm run build