# DESIGN_SYSTEM.md

## Purpose

The goal of this document is to transform **MEDISENS** into a professional, enterprise-grade Healthcare Information System (HIS) through a complete UI/UX redesign built on a reusable design system.

The current interface relies heavily on generic dashboard layouts and emoji-based navigation, making the application feel AI-generated rather than purpose-built for healthcare. This redesign will establish a consistent visual language, reusable components, and a clinical user experience suitable for Rural Health Units (RHUs), Barangay Health Stations (BHS), clinics, laboratories, and hospitals.

The redesign prioritizes:

* Familiarity over novelty
* Usability over decoration
* Efficiency over unnecessary animations
* Accessibility by default
* Component-driven architecture
* Long-term maintainability and scalability

The end goal is for MEDISENS to feel like commercial healthcare software rather than a student project or dashboard template.

---

# Core Design Principles

## Medical-First

Every interface decision should prioritize healthcare workflows.

## Familiar

Users should immediately recognize navigation patterns, layouts, and interactions.

## Consistent

Every page should share the same spacing, typography, colors, components, and behaviors.

## Reusable

Build reusable components instead of page-specific implementations.

## Accessible

Accessibility is a requirement, not an afterthought.

## Responsive

Desktop remains the primary experience while maintaining usability on tablets and mobile devices.

---

# UI Vision

The new interface should feel like software used daily by:

* Rural Health Units (RHUs)
* Barangay Health Stations
* Clinics
* Hospitals
* Diagnostic Laboratories
* Pharmacies

Avoid flashy consumer-app aesthetics. Instead, aim for:

* Clean
* Calm
* Trustworthy
* Professional
* Information-dense
* Fast to navigate
* Minimal visual clutter

---

# Architecture Philosophy

Do **not** redesign individual pages first.

Instead, build a reusable enterprise healthcare design system that every page consumes.

Target structure:

```text
src/
 ├── design-system/
 │   ├── colors.ts
 │   ├── typography.ts
 │   ├── spacing.ts
 │   ├── radius.ts
 │   ├── shadows.ts
 │   ├── breakpoints.ts
 │   └── theme.ts
 │
 ├── components/
 │   └── ui/
 │       ├── Button
 │       ├── Input
 │       ├── Select
 │       ├── Table
 │       ├── Badge
 │       ├── Card
 │       ├── Modal
 │       ├── Sidebar
 │       ├── Toast
 │       ├── LoadingState
 │       ├── EmptyState
 │       ├── ErrorState
 │       └── ...
```

Pages should compose reusable UI primitives rather than introducing custom styling.

---

# Design Goals

* Remove every emoji-based icon.
* Replace emojis with a professional icon library.
* Integrate the official MEDISENS branding.
* Establish a centralized color palette.
* Standardize typography.
* Standardize spacing.
* Standardize layouts.
* Improve readability.
* Improve accessibility.
* Reduce cognitive load.
* Improve workflow efficiency.
* Preserve all existing medical workflows.
* Preserve Supabase integration.
* Preserve role-based dashboards.
* Preserve Vite multi-page architecture.

---

# Functional Preservation

The UI/UX redesign is strictly visual and usability-focused.

The redesign must preserve 100% of the approved Use Case Diagram.

The redesign SHALL NOT:

* Change existing use cases.
* Add undocumented workflows.
* Remove existing workflows.
* Merge separate workflows into one.
* Change actor responsibilities.
* Modify role permissions.
* Change Supabase integration.
* Change database behavior.
* Change business logic.

The redesign SHALL:

* Improve navigation.
* Improve readability.
* Improve accessibility.
* Improve visual hierarchy.
* Reduce unnecessary clicks where possible without changing workflow.
* Improve consistency across all role dashboards.
* Keep every workflow functionally equivalent to the current implementation.

# Implementation Roadmap

## Phase 0 — UI Audit

* Audit every existing page.
* Identify duplicated components.
* Identify inconsistent layouts.
* Identify inconsistent spacing.
* Identify poor hierarchy.
* Document UX pain points.
* Define redesign priorities.

---

## Phase 1 — Brand Identity

Create the visual identity.

* MEDISENS logo integration
* Color palette
* Clinical icon system
* Semantic colors
* Brand guidelines

---

## Phase 2 — Design Tokens

Create centralized:

* Colors
* Typography
* Spacing
* Border radius
* Shadows
* Breakpoints
* Elevation
* Animation timings

---

## Phase 3 — Component Library

Create reusable UI primitives:

* Button
* Icon Button
* Input
* Textarea
* Select
* Search Input
* Checkbox
* Radio
* Switch
* Date Picker
* Badge
* Chip
* Avatar
* Card
* Modal
* Drawer
* Toast
* Alert
* Table
* Pagination
* Tabs
* Empty State
* Loading State
* Skeleton Loader
* Error State
* Status Indicators

Every component must:

* Be reusable
* Be responsive
* Be accessible
* Follow the design tokens
* Avoid duplicated styling

---

## Phase 4 — Navigation System

Redesign:

* Sidebar
* Top Navigation
* User Menu
* Breadcrumbs
* Mobile Navigation

Improve:

* Active states
* Hover states
* Keyboard navigation
* Role-based navigation
* Information hierarchy

---

## Phase 5 — Dashboard Redesign

Redesign dashboards for:

* Admin
* BHW
* Midwife
* Nurse
* Doctor
* Laboratory
* Pharmacist

Prioritize:

* Pending work
* Daily workflow
* Quick actions
* Patient access
* Reports

---

## Phase 6 — Forms & Medical Workflows

Redesign:

* Registration
* Census Entry
* Initial Consultation
* Consultation
* Laboratory
* Pharmacy
* Vaccination
* Follow-up
* Reports

Improve:

* Validation
* Error handling
* Labels
* Date fields
* Disabled states
* Searchability
* Keyboard efficiency

---

## Phase 7 — Patient Records

Redesign:

* Patient Details
* Medical History
* Timeline
* Vaccination Records
* Laboratory Results
* Prescriptions
* Consultations
* Follow-ups

Group information logically and optimize for quick scanning by healthcare workers.

---

## Phase 8 — Reports

Improve:

* Tables
* Print layout
* PDF generation
* Report hierarchy
* Export workflow

Reports should be suitable for RHU operations and thesis demonstrations.

---

## Phase 9 — Accessibility & Responsiveness

Ensure:

* WCAG-friendly contrast
* Keyboard navigation
* Focus-visible states
* ARIA support
* Screen reader compatibility
* Responsive layouts

---

## Phase 10 — Final Polish

Perform a complete UI audit.

Verify:

* Visual consistency
* Component reuse
* Accessibility
* Responsiveness
* Performance
* Clinical appearance
* Workflow efficiency

---

# Strict Requirements

* Do not redesign workflows unless usability significantly improves.
* Do not break existing functionality.
* Do not remove role-based access.
* Do not expose Supabase secrets.
* Preserve the Vite multi-page architecture.
* Prefer reusable components over page-specific styling.
* Avoid duplicated CSS and component logic.
* Ensure every page consumes the centralized design system.
* Build for long-term maintainability and scalability.

---

# Success Criteria

The redesigned MEDISENS interface must:

* Feel like commercial healthcare software.
* Be intuitive for first-time users.
* Require minimal staff training.
* Improve workflow efficiency.
* Maintain a consistent visual language.
* Be accessible and responsive.
* Eliminate the appearance of a generic AI-generated dashboard.
* Reflect senior-level frontend engineering and UI/UX standards suitable for production deployment.
