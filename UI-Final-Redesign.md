# UI-Final-Redesign.md

## Purpose

This file defines the final system-wide UI refinement plan for **MediSens**.

Claude Code must use it together with the repository-root `CLAUDE.md`.

The redesign applies to the entire MediSens interface **except the Login page**.

The goal is not to rebuild the product. The goal is to make the existing interface feel intentionally designed, clinically trustworthy, consistent, responsive, and defense-ready while preserving all current workflows and functionality.

---

## How to Use This File

The user may give Claude Code a short instruction such as:

```text
Read CLAUDE.md and UI-Final-Redesign.md, then proceed with Phase 1.
```

Claude Code must:

1. Read both files before inspecting or editing.
2. Implement only the requested phase.
3. Inspect the actual repository before changing anything.
4. Ask a focused question when the repository conflicts with this plan or when a choice may affect workflows, permissions, routing, shared components, or accessibility.
5. Stop after completing the requested phase.
6. Never continue automatically to another phase.
7. Report changes, files modified, checks performed, runtime limitations, and remaining risks.

---

# Non-Negotiable Rules

## Preserve Completely

- Existing routes and destinations
- Role permissions and authorization
- Authentication behavior
- Supabase RPCs, migrations, RLS, and Edge Functions
- Clinical calculations and workflow logic
- Patient, consultation, laboratory, pharmacy, follow-up, maternal, vaccination, FHSIS, archive, and audit workflows
- Analytics calculations and privacy protections
- Doctor access to Clinical, Geographic, and Staff Operations Analytics
- Midwife access to Clinical and Geographic Analytics
- Print outputs and clinical document meaning
- Loading, retry, request deduplication, stale-response protection, and localized error behavior
- Current blue-indigo brand direction unless a separately approved design-token change is requested

## Do Not

- Modify the Login page
- Add fake features, fake data, unsupported metrics, or decorative charts
- Add decorative UI without workflow value
- Introduce routes or modules unless explicitly requested
- Duplicate shared components or page implementations
- Change database behavior for a visual redesign
- Weaken security or permissions
- Hide important clinical statuses
- Replace familiar interaction patterns with experimental navigation
- Use excessive gradients, glows, glass effects, large rounded cards, floating pills, or generic AI-dashboard styling
- Turn every section into a card
- Redesign unrelated areas while completing a targeted phase
- Proceed to another phase without approval

---

# Design Direction

MediSens should feel:

- Clinical
- Calm
- Trustworthy
- Modern
- Efficient
- Familiar
- Deliberate
- Easy to scan
- Suitable for a Philippine Rural Health Unit

It should not feel:

- Generated from a dashboard template
- Overdecorated
- Neon
- Futuristic
- Gamified
- Like a generic AI SaaS product
- Like a collection of unrelated cards
- Visually dense without hierarchy

---

# Existing Visual Foundation

Use centralized design tokens.

Core palette:

```css
--brand-primary: #5A81FA;
--brand-active: #2B318A;

--text-primary: #1F1F1F;
--text-secondary: #6A6E83;
--text-muted: #A8B1CE;

--brand-accent-surface: #D1DDFF;
--brand-soft-surface: #F2F3FF;

--page-background: #F7F8FC;
--surface: #FFFFFF;
```

Preserve semantic colors:

- Green: success, online, completed
- Amber: warning, pending, offline
- Red: error, destructive, urgent
- Blue/indigo: brand, information, selection, focus

Use white and neutral surfaces as the visual foundation. Brand color should guide attention rather than flood every component.

---

# System-Wide UI Principles

## Typography

- Use centralized typography tokens.
- Maintain clear hierarchy between page titles, section titles, card titles, labels, values, helper text, metadata, and table content.
- Avoid excessive bold text.
- Avoid uppercase body copy.
- Use restrained letter spacing only for small navigation or category labels.
- Keep clinical text and tables highly readable.

## Spacing

- Use consistent spacing tokens.
- Remove random margins and one-off padding values.
- Preserve breathing room without creating large unused voids.
- Keep related content visually grouped.
- Avoid nested containers with repeated padding.

## Surfaces

- Prefer borders, spacing, and hierarchy over heavy shadows.
- Use subtle shadows only where elevation communicates interaction.
- Avoid nested cards unless each level has a clear purpose.
- Use consistent radii.
- Avoid oversized rounded corners.

## Controls

- Standardize buttons, icon buttons, inputs, selects, filters, tabs, badges, switches, and pagination.
- Maintain clear hover, active, focus-visible, disabled, loading, success, warning, and destructive states.
- Keep touch targets accessible.
- Avoid pills when a standard button, tab, label, or text action is more familiar.

## Tables

- Prioritize scanning and comparison.
- Keep headers visible and clear.
- Use consistent row height, alignment, typography, empty states, and status treatment.
- Avoid unnecessary cell decoration.
- Preserve mobile alternatives where tables cannot fit safely.

## Drawers and Modals

- Maintain clear title, context, actions, and close behavior.
- Avoid excessive width.
- Keep primary and secondary actions predictable.
- Preserve keyboard and focus behavior.

## Responsive Behavior

- Desktop, tablet, and mobile must be intentionally supported.
- Avoid horizontal page scrolling.
- Do not squeeze desktop dashboards into mobile.
- Stack sections in workflow order.
- Preserve safe-area spacing and touch targets.
- Test at approximately 390px mobile width and iPhone 15 Pro Max proportions.

## Loading, Errors, and Empty States

- Initial load: content-shaped skeletons.
- Background refresh: retain content and show a subtle updating state.
- Section failure: localized error, not full-page collapse.
- Empty states must distinguish no data, no filtered results, request failure, privacy suppression, and unavailable features.
- Do not use fake content to fill space.

---

# PHASE 1 — Design System and Shared Application Shell

## Goal

Create one consistent visual foundation across all roles before touching workflow-specific page composition.

## Scope

### Shared shell

Refine:

- Sidebar
- Role-aware navigation groups
- Logo area
- User-profile area
- Topbar
- Page header
- Breadcrumbs
- Network/online badge
- Main content background
- Shared page-width and content-spacing rules

### Shared UI components

Audit and refine:

- Buttons
- Icon buttons
- Inputs
- Selects
- Textareas
- Search fields
- Cards
- Badges
- Tabs
- Filters
- Tables
- Empty states
- Skeletons
- Toasts
- Drawers
- Modals
- Form sections
- Status indicators

### Design tokens

Consolidate and use:

- Colors
- Typography
- Spacing
- Borders
- Radii
- Shadows
- Focus rings
- Disabled states
- Z-index layers where necessary

## Requirements

- Apply consistently to all roles.
- Preserve existing module layouts and workflows.
- Do not redesign individual clinical pages yet.
- Replace confirmed hardcoded visual values with tokens.
- Remove decorative gradients, glows, glass effects, and inconsistent shadows.
- Ensure sidebar categories remain compact and role-appropriate.
- Keep current routes, labels, icons, and permissions.
- Do not touch the Login page.

## Acceptance Criteria

- Shared components feel like one coherent system.
- Sidebar and topbar are consistent across all roles.
- Buttons, forms, cards, tables, and states use centralized tokens.
- No role shell looks like a separate product.
- Desktop and mobile shell behavior remains functional.
- No workflow or backend behavior changes.

## Phase 1 Output

Report:

- Shared components refined
- Tokens consolidated
- Hardcoded styles replaced
- Files changed
- Accessibility improvements
- Remaining page-specific inconsistencies deferred to later phases

---

# PHASE 2 — Clinical and Patient Workflows

## Goal

Refine the main end-to-end patient-care journey without changing business logic.

## Scope

Refine the existing UI of:

- Patient Records
- Patient profile and history
- Patient detail modal or preview
- Initial Consultation
- Vital Signs
- Consultation Room
- Follow-up Visitation
- Laboratory Request
- Laboratory Result workflow
- Electronic Prescription
- Pharmacist dispensing
- Clinical drawers, slide-overs, and forms
- Clinical print-preview surfaces without harming print output

## Workflow Priorities

The interface should make these steps easy to understand:

1. Find or register a patient
2. Review patient context
3. Perform intake and vital signs
4. Conduct consultation
5. Request laboratory work
6. Issue prescription
7. Complete follow-up and related care

## Requirements

- Preserve form fields, validation, state transitions, RPCs, and role ownership.
- Improve hierarchy between patient identity, clinical context, current task, and actions.
- Reduce excessive cards and nested containers.
- Standardize form spacing, field grouping, helper text, validation, buttons, and status labels.
- Keep primary actions easy to locate.
- Preserve slide-over and preview behavior where already used.
- Improve dense tables and mobile layouts.
- Do not simplify away clinically important information.
- Do not modify the Login page.

## Acceptance Criteria

- Patient-care workflows feel connected rather than fragmented.
- Forms are easier to scan and complete.
- Status and next actions are clear.
- Desktop and mobile layouts remain usable.
- Print outputs retain practical formatting.
- No workflow, route, permission, or data changes.

## Phase 2 Output

Report:

- Workflows refined
- Forms and tables standardized
- Interaction patterns improved
- Files changed
- Mobile improvements
- Remaining role-specific issues deferred to Phase 3

---

# PHASE 3 — Role-Specific Modules

## Goal

Refine modules unique to individual roles while keeping the shared system language established in Phases 1 and 2.

## Scope

### Admin

- Dashboard
- User management
- Archive Review
- Audit Log
- Administrative tables, filters, forms, and dialogs

### BHW

- Home/Dashboard
- Patient Records
- Registration-related workflows
- Community-facing tasks

### Nurse

- Home/Dashboard
- Patient intake
- Initial Consultation
- Vital Signs
- Patient Records

### Midwife

- Home/Dashboard
- Patient Records
- Census Entry
- Maternal and vaccination workflows
- OCR Reports
- Clinical and Geographic Analytics access

### Laboratory

- Work queue
- Request preview
- Result entry
- Status transitions
- Search and filters

### Pharmacist

- Prescription queue
- Prescription preview
- Dispensing workflow
- Status transitions
- Search and filters

## Requirements

- Apply the same design system without forcing identical layouts onto different jobs.
- Prioritize each role's most frequent tasks.
- Make pending work, current task, status, and next action easy to identify.
- Preserve all role-specific permissions and routes.
- Do not expose unauthorized information.
- Keep role dashboards purposeful and avoid generic KPI-card grids.
- Do not modify the Login page.

## Acceptance Criteria

- Every role feels part of the same product.
- Each role's primary workflow is immediately clear.
- Tables, filters, queues, previews, and forms are consistent.
- No role receives new permissions or workflow changes.
- Mobile behavior is usable for field and RHU staff.

## Phase 3 Output

Report:

- Role modules refined
- Role-specific hierarchy decisions
- Files changed
- Responsive behavior
- Permission-preservation verification
- Remaining Analytics work deferred to Phase 4

---

# PHASE 4 — Analytics, Responsive Polish, and Final Consistency

## Goal

Finalize Clinical, Geographic, and Staff Operations Analytics, then complete a system-wide responsive and visual QA pass.

## Analytics Scope

### Clinical Analytics

Refine:

- Shared period controls
- Internal Analytics tabs
- KPI strip
- Primary insights
- Service trends
- Operational workload
- Clinical insights
- Detailed Records
- Filters
- Retry, stale, error, and empty states
- Chart legends, axes, labels, and tooltips

### Geographic Analytics

Refine:

- Malvar barangay map
- Barangay ranking
- Metric selector
- Scope labels
- Geographic summary
- Coverage values
- Tooltips
- Legend
- Selected barangay
- Drill-down
- Zero-data and no-activity states
- Touch and keyboard behavior

### Staff Operations

Refine:

- Doctor/Laboratory/Pharmacy selector
- Summary metrics
- Count and turnaround trends
- Attribution
- Reliability notes
- Exact period rollups
- Empty, error, updating, and stale states
- Doctor-only access presentation

## Final System-Wide QA

Review:

- Typography consistency
- Spacing
- Alignment
- Card usage
- Border radius
- Shadows
- Icons
- Buttons
- Forms
- Tables
- Tabs
- Filters
- Drawers
- Modals
- Status colors
- Loading
- Empty states
- Errors
- Keyboard navigation
- Focus states
- Mobile layouts
- Tablet layouts
- Desktop layouts
- Browser zoom
- Overflow
- Print outputs

## Requirements

- Preserve all calculations and Analytics semantics.
- Preserve Doctor and Midwife Analytics access rules.
- Do not add decorative or unsupported charts.
- Keep charts decision-oriented.
- Keep all-time and period-scoped metrics clearly labeled.
- Maintain aggregate-only privacy protections.
- Preserve small-count suppression.
- Do not modify backend logic unless a separately approved bug fix is required.
- Do not modify the Login page.

## Acceptance Criteria

- Analytics tabs feel like one coherent workspace.
- Charts are clear, proportional, and correctly labeled.
- Geographic and Staff Operations remain honest about scope and data limitations.
- No duplicate visual patterns or contradictory states remain.
- System is usable at desktop, tablet, and mobile widths.
- No horizontal overflow or broken interaction state remains.
- No new console errors.
- No permissions or workflows changed.

## Phase 4 Output

Report:

- Analytics refinements
- Responsive fixes
- Accessibility fixes
- System-wide inconsistencies corrected
- Files changed
- Runtime checks completed
- Remaining limitations
- Final recommendation for defense readiness

---

# Required Verification After Every Phase

Run:

```bash
npm.cmd run build
git diff --check
npx tsc --noEmit
```

If TypeScript still reports pre-existing errors:

- List them honestly.
- Confirm whether the requested phase introduced any new errors.
- Do not silently expand the phase to fix unrelated errors.

Also verify affected screens manually when runtime access is available.

---

# Git Discipline

Before Phase 1:

```bash
git add .
git commit -m "checkpoint: before final UI redesign"
git switch -c redesign/final-ui
```

After every phase:

1. Review `git diff`.
2. Test affected roles and breakpoints.
3. Commit the phase separately.
4. Do not mix database cleanup, seed data, or backend security work into UI-redesign commits.

Suggested commits:

```text
refactor(ui): unify design system and shared shell
refactor(ui): refine clinical and patient workflows
refactor(ui): polish role-specific modules
refactor(ui): finalize analytics and responsive behavior
```

---

# Short Claude Code Commands

## Phase 1

```text
Read CLAUDE.md and UI-Final-Redesign.md, then proceed with Phase 1 only.
Ask before changing anything ambiguous or outside the phase.
```

## Phase 2

```text
Read CLAUDE.md and UI-Final-Redesign.md, then proceed with Phase 2 only.
Preserve all clinical workflows and backend behavior.
```

## Phase 3

```text
Read CLAUDE.md and UI-Final-Redesign.md, then proceed with Phase 3 only.
Preserve all role permissions, routes, and workflows.
```

## Phase 4

```text
Read CLAUDE.md and UI-Final-Redesign.md, then proceed with Phase 4 only.
Preserve Analytics calculations, privacy, and access rules.
```

---

# Final Instruction to Claude Code

This is a final visual refinement program, not permission to reinvent MediSens.

Use the existing product as the foundation.

Refine with restraint.

When uncertain, inspect first and ask.
