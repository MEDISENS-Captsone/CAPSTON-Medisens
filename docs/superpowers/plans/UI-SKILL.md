---
name: medisens-healthcare-ui-ux
description: Use this skill whenever improving, auditing, refactoring, or implementing MEDISENS UI/UX. It prioritizes RHU healthcare workflow efficiency, role-based access preservation, approved Use Case Diagram preservation, clinical clarity, accessible forms, dense readable work queues, reusable components, restrained healthcare visual design, and authenticated role-based QA.
---

# MEDISENS Healthcare UI/UX Skill

## Purpose

Apply this skill whenever working on MEDISENS interface design, UI refactoring, component cleanup, page polish, responsive behavior, accessibility, dashboard/work queue presentation, patient records, clinical forms, modals, drawers, tables, print/report surfaces, or navigation.

MEDISENS is a Healthcare Information System for Rural Health Units, Barangay Health Stations, clinics, laboratories, pharmacies, and thesis demonstrations. Treat the UI as operational healthcare software, not as a marketing site, portfolio, generic SaaS dashboard, or decorative design exercise.

The interface must help health workers complete their assigned work quickly, clearly, and safely while preserving the approved system workflows.

## Non-Negotiable Product Boundaries

MEDISENS UI work must preserve:

- Approved Use Case Diagram behavior.
- Existing role-based access and actor responsibilities.
- Existing role strings, including compatibility values such as `BHW`, `labaratory`, and `midwives`.
- Existing Supabase integration, schema behavior, and business logic unless the user explicitly requests backend changes.
- Existing Vite multi-page architecture unless the user explicitly approves an architecture migration.
- Existing clinical workflow sequence for BHW, Nurse, Doctor, Laboratory, Pharmacist, Midwife, and Admin.
- Existing patient, consultation, laboratory, pharmacy, vaccination, follow-up, report, and admin workflows.

Do not:

- Add undocumented workflows.
- Remove workflows.
- Merge separate role responsibilities.
- Expose actions to unauthorized roles.
- Rename clinical actions in a way that changes meaning.
- Replace functional tables/work queues with decorative cards when scanning data is the priority.
- Introduce native browser alerts, confirms, or prompts.
- Show raw Supabase, SQL, JavaScript, stack trace, or internal implementation errors to users.

## Design Philosophy

MEDISENS should feel:

- Clinical.
- Calm.
- Trustworthy.
- Familiar.
- Efficient.
- Immediately readable.
- Professionally composed.
- Pleasant for long-duration RHU clinical work.
- Information-dense where workflows require it.
- Accessible by default.
- Professional enough for RHU, BHS, clinic, laboratory, pharmacy, and hospital contexts.

Prioritize:

1. Healthcare workflow efficiency.
2. Role clarity and permission safety.
3. Patient record readability.
4. Fast scanning of tables and queues.
5. Form accuracy and error recovery.
6. Accessibility and keyboard usability.
7. Responsive PWA behavior.
8. Reusable component architecture.
9. Visual consistency.
10. Pleasant long-duration use.
11. Maintainability.

Avoid visual novelty that slows work. Familiarity is a feature in healthcare systems.

## Clinical Product Design Language

MEDISENS should follow a clinical product design language: calm, readable, composed, and product-first. Preserve the useful discipline of minimal visual noise, excellent typography, intentional spacing, subtle motion, and polished composition without restoring any portfolio, editorial, or monochrome-only identity.

Design decisions must serve clinical work:

- Information must be readable before it is beautiful.
- Hierarchy should come from typography, grouping, alignment, spacing, and component structure before color.
- Spacing should clarify relationships between data, controls, and sections.
- Visual polish should make repeated daily use more comfortable, not more decorative.
- Motion should communicate state or context, not entertain.
- Every improvement must make RHU tasks easier, faster, clearer, safer, or more consistent.
- Reject any design that looks modern but reduces familiarity, efficiency, consistency, accessibility, or workflow speed.

Do not bring back strict monochrome styling, halftone textures, pixel fonts, editorial layouts, decorative portfolio aesthetics, or sparse composition that hides clinical information.

## Healthcare Design Principles

### Workflow First

Every UI decision must reduce clicks, cognitive load, and task completion time for RHU staff.

- Make the next clinical action obvious.
- Keep frequent actions close to the data they affect.
- Preserve fast paths for daily tasks such as patient lookup, intake, consultation, lab review, dispensing, census entry, and report generation.
- Remove decorative steps, unnecessary confirmations, or redundant navigation when they do not protect data or clarify the workflow.
- Visual polish must never come at the expense of workflow efficiency.

### Information Density

Prefer useful information density over decorative whitespace.

- Maximize visible clinical and operational information while maintaining readability and accessibility.
- Use compact tables, grouped fields, concise headers, and clear section hierarchy.
- Avoid oversized cards, excessive padding, large empty areas, and sparse dashboard layouts.
- Keep density purposeful: staff should be able to scan the most important information within a few seconds.
- Do not hide essential workflow data just to make the screen look cleaner.
- Do not overcrowd screens: dense layouts still need clear grouping, alignment, line height, and accessible touch/click targets.

### Healthcare Familiarity

Favor interaction patterns that healthcare workers already understand.

- Use patient lists, work queues, compact tables, grouped forms, clinical summaries, chart-like sections, drawers, modals, and side panels.
- MEDISENS should resemble professional Healthcare Information Systems, not consumer apps or generic SaaS dashboards.
- Familiar healthcare patterns are preferred over novel layouts, playful interactions, or marketing-style composition.
- Design for repeated daily use by RHU staff, not one-time visual impression.

### Consistency Over Creativity

Reuse existing MEDISENS interaction patterns whenever possible.

- Do not invent a new UI pattern when an established MEDISENS pattern already exists.
- Keep button placement, table actions, filter bars, detail views, dialogs, drawers, and form grouping consistent across roles.
- New components should extend the design system instead of creating page-local variants.
- Creativity is useful only when it improves clarity, speed, safety, or maintainability.

### One Interaction, One Pattern

Similar actions should behave consistently across MEDISENS.

- Patient Details, History, Laboratory request details, Audit Log details, prescription details, and similar review surfaces should consistently use the same interaction pattern where practical.
- Choose drawer, modal, full page, tab, accordion, or inline expansion based on task depth, data density, and context preservation.
- Do not mix interaction patterns for the same kind of task unless there is a strong usability reason.
- If a different pattern is necessary, document the reason and preserve user orientation.

### Clinical Language

Use terminology familiar to healthcare professionals.

- Buttons, labels, headings, and actions should describe the clinical task clearly.
- Prefer task-specific wording such as `Initial Intake`, `Consultation`, `Lab Request`, `Dispense`, `Census Entry`, `Patient Records`, and `Encounters` over vague wording such as `Open`, `Manage`, `Process`, or `Submit` when specificity helps.
- Avoid technical implementation terms in the UI.
- Do not rename clinical actions in a way that changes actor responsibility or workflow meaning.

### Progressive Disclosure

Show the information required for the current task first.

- Reveal secondary details through drawers, tabs, accordions, expandable sections, or side panels when this keeps the user in context.
- Use progressive disclosure to reduce cognitive load, not to hide required clinical information.
- Prefer in-context detail expansion over unnecessary route changes when the user needs to compare or return to a queue.
- Keep critical patient identity, status, warnings, and primary actions visible.

## Visual Direction

Use a restrained clinical neutral palette:

- White and off-white surfaces for primary content.
- Cool-gray backgrounds for page structure.
- Charcoal and slate text for readable hierarchy.
- Subtle gray borders for separation.
- Muted medical navy or deep slate for navigation, headers, and structural emphasis.
- Muted green or teal only for positive, completed, online, or healthcare-related emphasis.
- Amber only for warnings, pending states, attention, or offline states.
- Red only for errors, failed states, destructive actions, urgent risk, or critical warnings.
- Blue only as a sparse informational color, not the dominant interface identity.
- Indigo, purple, or other colors only when they carry a clear semantic category and remain restrained.

Do not use strict monochrome styling. Do not make MEDISENS look like a generic bright blue/cyan SaaS dashboard. Avoid cyan-heavy chrome, neon accents, loud gradients, glassmorphism, decorative glow, rainbow badge systems, or color used only for style.

Gradients should be rare and extremely subtle. They must not compete with clinical data, labels, forms, or status indicators.

## Typography

Use typography-first readability. Information must be readable before it is beautiful:

- Prefer Inter, system UI, or the existing project font stack.
- Keep body text readable at normal browser zoom.
- Use semibold weight for labels, table headers, section titles, and primary actions.
- Use normal weight for body copy and clinical details.
- Use tabular numerals for counts, dates, vitals, quantities, and table-heavy data when useful.
- Keep headings proportional to the surrounding surface. Dashboard panels and modal sections should not use hero-scale type.
- Use uppercase labels sparingly and only when still readable.
- Do not use pixel display fonts, decorative fonts, tiny signature labels, or editorial typography patterns.

Hierarchy should come from type scale, weight, grouping, alignment, spacing, and proximity before relying on color. Important clinical text should never be tiny, faint, overly stylized, or dependent on color alone.

## Layout And Density

MEDISENS is desktop-first for RHU operations, with tablet and mobile usability for PWA access.

Use intentional whitespace. Do not maximize whitespace and do not overcrowd screens. Every spacing decision should separate, group, or clarify information.

Use:

- Fixed or persistent desktop navigation where appropriate.
- Mobile drawer navigation that does not obscure or duplicate content.
- Compact page headers with clear title, subtitle, role context, and primary action.
- Dense but readable panels for daily work.
- Full-width clinical tables and work queues.
- Responsive grids only when they improve scanning.
- Contained horizontal scrolling for wide tables, never page-level overflow.
- Sticky or persistent actions only when they improve long-form workflow completion.
- Clear grouping for patient identity, demographics, vitals, complaints, diagnosis, prescriptions, lab requests, follow-ups, and reports.
- Side panels, drawers, tabs, accordions, or expandable sections when progressive disclosure keeps the user in workflow context.
- Alignment and spacing rhythm that make dense information easier to scan.
- Moderate padding that supports readability without creating empty dashboard space.

Avoid:

- Excessive whitespace that hides operational data.
- Oversized cards, excessive padding, and large empty areas that reduce useful clinical visibility.
- Narrow editorial content columns for tables, forms, queues, records, dashboards, or chart views.
- Full-screen takeovers when a drawer or modal is safer.
- Nested cards inside cards.
- Decorative empty space that makes RHU staff scroll more.
- Layout changes that make role workflows harder to compare.
- Consumer-app layouts when a healthcare work queue, grouped form, or clinical summary would be more familiar.
- Crowded panels where labels, values, controls, badges, and actions compete for attention.

## Navigation And Role Workflows

Navigation must communicate role boundaries clearly.

Requirements:

- Each role should see only the modules/actions allowed for that role.
- Active navigation state must be obvious and expose `aria-current` where applicable.
- Role labels and action labels must be clinically accurate.
- Doctor-only consultation actions must not appear for BHW, Nurse, Midwife, Laboratory, Pharmacist, or Admin unless explicitly allowed by the approved workflow.
- Registration actions must remain limited to the roles/workflows already authorized.
- Laboratory and Pharmacy should present work queues, not generic dashboards.
- Admin screens should emphasize user management clarity and permission safety.
- Back paths, breadcrumbs, drawers, and modals must not trap users or hide the current patient context.
- Similar navigation and detail-review actions should use one consistent interaction pattern across roles unless a specific workflow requires otherwise.
- Clinical task labels should be specific enough that staff understand the action before clicking.

Before changing navigation, verify that the change does not alter the approved Use Case Diagram or role responsibilities.

## Patient Records And Clinical Charts

Patient information must be easy to verify and hard to confuse.

Patient detail surfaces should:

- Keep patient identity visible: name, sex, age/date of birth, barangay/address, contact, and relevant identifiers.
- Separate demographics, coverage/category, emergency contact, vaccination records, encounters, lab results, prescriptions, follow-ups, and history.
- Use clinical chart sections with clear titles and readable field-value pairs.
- Keep Doctor consultation entry explicit and role-scoped.
- Use transaction timelines only when they improve chronological understanding.
- Keep long clinical text readable with wrapping, itemization, or expandable detail when needed.
- Avoid truncating medically relevant content without a way to inspect it.
- Use progressive disclosure for secondary history, encounter details, vaccination details, and transaction metadata when it preserves patient context.
- Keep similar patient-detail and history interactions consistent across BHW, Nurse, Doctor, Midwife, Laboratory, and Pharmacist entry points.

Do not show patient data in purely decorative cards when a structured chart or table would be clearer.

## Tables And Work Queues

Tables are first-class UI for MEDISENS.

For patient registries, laboratory requests, prescriptions, intake lists, reports, and admin records:

- Use clear column hierarchy.
- Make patient identity and status easy to scan.
- Keep row actions consistent and predictable.
- Provide loading, empty, error, and filtered-empty states.
- Provide search and filters where already supported or explicitly requested.
- Use compact row density without crowding.
- Contain overflow within the table region.
- Keep status badges semantic and readable.
- Do not rely on color alone for status.
- Preserve row click behavior and existing action handlers.
- Keep important columns visible before secondary metadata.
- Prefer side panels, drawers, or detail modals for row inspection when staff need to return quickly to the queue.

Prefer a table/worklist over a decorative card grid when users need to compare many records.

## Forms

Clinical forms must be clear, structured, forgiving, and keyboard-friendly.

Requirements:

- Visible labels for every field.
- Required indicators where needed.
- Logical grouping by clinical task.
- Helpful helper text for complex fields.
- Inline validation near the field.
- Error summary for long forms when multiple errors are possible.
- Clear save/cancel/back actions.
- Disabled/loading states during async operations.
- Distinct read-only vs disabled styling.
- Semantic input types for dates, times, numbers, phone, and email.
- Safe wrapping for long labels and values.
- No placeholder-only labels.
- No raw technical error messages.
- Clinical wording for field labels and actions.
- Progressive disclosure for advanced, secondary, or rarely used fields when it reduces clutter without hiding required information.

Long clinical forms should protect users from accidental data loss where feasible through confirmation, draft behavior, or explicit cancel paths.

## Error, Feedback, And Offline Behavior

User-facing messages must be plain-language and action-oriented.

Use messages like:

> Unable to save changes. Please try again. If the problem persists, contact the system administrator.

Avoid messages like:

- Supabase error text.
- SQL errors.
- Stack traces.
- JavaScript exception names.
- Internal table or column details.

Feedback rules:

- Use toasts for non-blocking success, warning, and failure feedback.
- Use inline errors for field-level problems.
- Use modals only for important decisions or destructive confirmation.
- Show loading states for async actions.
- Disable buttons during duplicate-submission risk.
- Preserve offline warnings and online/offline status visibility.
- Do not silently fail.

## Components And Architecture

Prefer reusable, typed, composable frontend code.

Use existing MEDISENS primitives and token layers first:

- `src/design-system/*`
- `src/components/ui/*`
- `src/components/shared/*`
- `src/components/layout/*`
- `src/components/feedback/*`
- `src/styles/dashboard.css`
- `src/styles/template.css` for legacy/static pages

Create or improve shared components for repeated patterns:

- Button.
- Icon button.
- Input.
- Select.
- Textarea.
- Checkbox/radio/switch.
- Search and filter toolbar.
- Badge/status badge.
- Card/panel.
- Modal/dialog.
- Drawer.
- Toast.
- Alert.
- Table/work queue.
- Pagination.
- Tabs.
- Page header.
- Section header.
- Empty state.
- Loading state.
- Error state.

Do not add new dependencies, icon libraries, UI frameworks, routing systems, or styling systems unless clearly justified and approved.

Avoid duplicated page-local styling. If a pattern appears across multiple role dashboards or workflows, move it toward the shared design system when safe.

Interaction consistency rules:

- One action type should have one default pattern across MEDISENS.
- Detail inspection should not alternate randomly between drawer, modal, full page, and inline expansion.
- Search/filter toolbars should remain consistent across patient records, laboratory, pharmacy, audit logs, and reports.
- Primary and secondary actions should appear in predictable locations.
- Existing MEDISENS patterns win over new ideas unless the current pattern is demonstrably hurting workflow efficiency, accessibility, or maintainability.

## Icons And Visual Elements

Use consistent, professional SVG icons through the shared icon system or existing approved primitives.

Do not use emoji as structural UI icons.

Decorative visuals must not reduce clinical clarity. Keep the interface calm and easy on the eyes during long RHU sessions. Do not use:

- Halftone motifs.
- Decorative image zoom effects.
- Editorial numbered section headers.
- Pixel-display visual branding.
- Large decorative gradients.
- Glow effects.
- Illustration-heavy dashboard chrome.
- Excessive shadows.
- Overly decorative cards.
- Rainbow badge palettes.
- Visual treatments that compete with patient data or workflow controls.

Icons must have accessible labels when icon-only and should be decorative when visible text already provides meaning.

## Motion

Motion should clarify state or context, not entertain.

Use:

- Short hover/focus/pressed transitions.
- Drawer and modal transitions that preserve spatial orientation.
- Loading indicators that respect reduced motion.
- Subtle state changes for row hover, selected state, disabled state, and active navigation.
- Subtle transitions for drawers, modals, loading, row expansion, and toasts.

Avoid:

- Page entrance animations.
- Staggered dashboard reveals.
- Decorative card lifts that distract from data.
- Image zoom effects.
- Bouncy or playful motion.
- Animation required to understand the UI.
- Motion that delays task completion or makes repeated clinical work feel busy.

Always respect `prefers-reduced-motion`.

## Accessibility

Accessibility is part of production readiness.

Check:

- Color contrast for text, badges, borders, focus rings, and status indicators.
- Keyboard navigation through sidebars, tables, forms, modals, drawers, and toasts.
- Visible focus states.
- Semantic buttons and links.
- Proper labels and descriptions for form fields.
- Modal focus behavior and Escape dismissal.
- `aria-current`, `aria-modal`, `aria-live`, `role="status"`, and `role="alert"` where appropriate.
- Touch targets of at least 44px for mobile/PWA interactions.
- Browser zoom support.
- High contrast and reduced motion behavior.
- Screen-reader-friendly names for icon-only controls.

Never remove focus rings without replacing them with an equally visible accessible focus style.

# Anti-Patterns

Never introduce these unless there is a strong, documented usability reason.

Avoid:

- Generic AI-generated dashboard layouts.
- Decorative cards replacing efficient tables.
- Oversized whitespace that reduces information density.
- Overcrowded screens that sacrifice readability.
- Full-page navigation when a drawer or modal is more appropriate.
- Inconsistent interaction patterns for the same workflow.
- Hidden primary actions.
- Color-only indicators without text or icons.
- Decorative gradients or glassmorphism that reduce readability.
- Strict monochrome-only styling.
- Bright cyan-heavy SaaS styling.
- Rainbow badges, excessive shadows, and overly decorative card treatments.
- Excessive animations or motion during clinical workflows.
- Duplicate components or page-specific styling when reusable components exist.
- Long forms without logical grouping or sectioning.
- Tiny fonts or low-contrast text.
- Fixed-width layouts that waste desktop space or break on smaller screens.
- Generic labels such as "Save", "Continue", or "Submit" when a clinical action is more descriptive.
- UI decisions that increase the number of clicks required to complete an RHU task.

## Responsive PWA Behavior

MEDISENS should work well on desktop, tablet, and mobile PWA contexts.

Requirements:

- Desktop remains optimized for full clinical workflows.
- Tablet layouts should preserve work queue readability.
- Mobile layouts should allow essential review, navigation, and lightweight actions without horizontal page overflow.
- Fixed headers, sidebars, drawers, and action bars must not cover content.
- Content should wrap or scroll inside controlled regions.
- Touch targets must remain usable.
- Long patient names, addresses, role labels, and clinical text must not break layout.
- Print/report surfaces may keep fixed report dimensions when needed, but app screens should remain responsive.

## Authenticated Role-Based QA

Do not claim final UI completion from static inspection alone.

When UI work is implemented, verify with:

- `npm.cmd run build` in this Windows PowerShell environment.
- Static checks for native `alert`, `confirm`, and `prompt` usage when relevant.
- Structural emoji/icon scan when icon cleanup is in scope.
- Role-by-role authenticated browser QA when credentials are available.
- Desktop, tablet, and mobile viewport checks.
- Keyboard navigation through role shells and critical workflows.
- Modal/drawer focus and dismissal behavior.
- Loading, empty, error, success, disabled, offline, and filtered-empty states.

Enterprise healthcare quality checklist:

- Would this feel natural to an RHU healthcare worker?
- Does it resemble professional healthcare software?
- Can important information be scanned within a few seconds?
- Is the workflow simpler than before?
- Are primary actions immediately obvious?
- Is the interface consistent across MEDISENS?
- Does it work well on desktop, tablet, and mobile?
- Is the typography readable before it is visually stylish?
- Does spacing clarify information without wasting space?
- Is the interface calm enough for long-duration clinical work?
- Are colors semantic and restrained instead of decorative?
- Does motion communicate state or context without slowing work?
- Would it pass a senior frontend/UI/UX design review?

Role QA should include:

- Admin user management.
- BHW patient records/new record/OCR workflows.
- Nurse initial consultation/intake workflows.
- Doctor patient details and consultation room workflows.
- Laboratory request queue and drawer/details workflows.
- Pharmacist prescription queue and dispensing workflows.
- Midwife patient records, census entry, and OCR/report workflows.

If authenticated QA is blocked by missing or invalid credentials, state that clearly and keep release status conditional.

## Applying This Skill

When improving MEDISENS UI:

1. Read the current source-of-truth docs first, especially `docs/superpowers/plans/DESIGN_SYSTEM.md` and any task-specific plan/spec named by the user.
2. Confirm the requested scope and phase boundaries.
3. Identify the affected role, workflow, and data surface.
4. Preserve business logic, role access, routes, Supabase calls, and database behavior unless explicitly in scope.
5. Prefer shared components and tokens over page-local styling.
6. Choose the established MEDISENS interaction pattern before inventing a new one.
7. Use clinical product design decisions: typography-first readability, intentional spacing, calm composition, semantic color, and purposeful motion.
8. Improve workflow speed, clinical clarity, scan speed, accessibility, responsiveness, and maintainability.
9. Verify with build/static checks, the enterprise healthcare quality checklist, and authenticated role QA when applicable.
10. Report what changed, files changed, UI/UX improvements, functionality preserved, and testing results.

The right MEDISENS UI should feel quiet, clinical, immediately readable, professionally composed, efficient, and reliable. It should not feel like a generic template, a bright SaaS dashboard, an editorial design system, or decorative portfolio work.
