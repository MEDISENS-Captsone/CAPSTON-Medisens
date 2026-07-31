# MediSens UI Manual Verification Checklist

## Purpose

Use this checklist to manually verify the visible UI refinements completed from Phase 1 through Phase 4C before database cleanup, synthetic repopulation, internal QA, and deployment.

This is a runtime visual and interaction smoke test, not the official UAT. Use only dedicated test accounts and synthetic records.

---

## Test Setup

### Viewports

- [ ] 1440 × 900 desktop
- [ ] 1024 × 768 small laptop
- [ ] 768 × 1024 tablet
- [ ] Approximately 390 × 844 mobile
- [ ] 200% browser zoom
- [ ] Keyboard-only pass
- [ ] Safe online/offline pass

### Roles

- [ ] Admin
- [ ] BHW
- [ ] Nurse
- [ ] Doctor
- [ ] Midwife
- [ ] Laboratory
- [ ] Pharmacist

### Result Codes

Use: `PASS`, `FAIL`, `BLOCKED`, `NOT TESTED`, or `NOT APPLICABLE`.

For every issue, record the role, screen, viewport, steps, expected result, actual result, screenshot, severity, and notes.

---

# 1. Login Page

## Visual

- [ ] Login card remains centered
- [ ] “AUTHORIZED ACCESS” is readable against white
- [ ] Sign In button uses the darker navy fill
- [ ] Input, label, logo, and trust-content spacing remain aligned
- [ ] Mobile layout fits at approximately 390px
- [ ] No horizontal overflow
- [ ] Touch targets remain comfortable
- [ ] Decorative background does not reduce readability
- [ ] Reduced-motion preference does not leave broken states

## Form and Accessibility

- [ ] Email and password have visible labels
- [ ] Both fields are required
- [ ] Enter submits only from the form
- [ ] Empty submission shows an error
- [ ] Invalid credentials show an error
- [ ] Error is announced by a screen reader when available
- [ ] Error is associated with the fields
- [ ] `aria-invalid` updates correctly
- [ ] Tab order is email → password → submit
- [ ] Sign In has a visible focus indicator

Notes:

---

# 2. Shared Application Shell

Test for all roles.

## Sidebar

- [ ] Correct navigation items appear per role
- [ ] Unauthorized modules are absent
- [ ] Active item uses the darker accessible brand fill
- [ ] Active item text remains readable
- [ ] Role-group headings remain compact
- [ ] Logo and user identity remain aligned
- [ ] Mobile sidebar opens and closes correctly
- [ ] Escape closes mobile dialogs/sidebar
- [ ] Focus is trapped when appropriate
- [ ] Focus returns to the trigger
- [ ] Logout confirmation initially focuses Cancel
- [ ] Logout confirmation traps Tab and Shift+Tab
- [ ] No horizontal overflow at 390px

## Topbar and User Menu

- [ ] Topbar height and spacing are consistent
- [ ] Page title does not wrap awkwardly
- [ ] Only one logical page H1 exists
- [ ] Avatar initials remain readable
- [ ] User menu opens and closes correctly
- [ ] Menu has visible hover and focus states
- [ ] Menu does not clip on tablet/mobile

## Online and Offline

- [ ] Online indicator is correct
- [ ] Offline status includes text or icon-plus-text
- [ ] Offline indicator remains visible below 640px
- [ ] Status does not rely on color alone
- [ ] Returning online updates correctly

## Shared Controls

- [ ] Primary buttons use the darker accessible brand fill
- [ ] Hover states deepen consistently
- [ ] Secondary and destructive actions are distinct
- [ ] Disabled controls remain understandable
- [ ] Solid focus indicators are visible
- [ ] Inputs, selects, tabs, filters, and badges are consistent
- [ ] Panels use consistent borders, spacing, radii, and shadows
- [ ] No unexpected gradients, glass effects, or oversized cards
- [ ] Error toasts are assertive
- [ ] Success/information toasts remain polite
- [ ] Skeletons resemble their content
- [ ] Background refresh retains content

Notes:

---

# 3. Admin

## Dashboard

- [ ] Administrative priorities are clear
- [ ] Summary areas are easy to scan
- [ ] Panels use the shared visual system
- [ ] No duplicated or decorative metric remains
- [ ] Loading, empty, and error states are consistent
- [ ] Mobile layout stacks cleanly

## User Management

- [ ] Desktop table is readable
- [ ] Mobile rows are usable
- [ ] Search and role filters have visible focus
- [ ] Create User dialog works
- [ ] Edit User dialog works
- [ ] Delete dialog clearly separates destructive and safe actions
- [ ] Cancel remains neutral
- [ ] Dialog traps focus
- [ ] Escape closes
- [ ] Focus restores to the trigger
- [ ] Validation remains readable
- [ ] Unauthorized role options do not appear

## Archive Review

- [ ] Table and filters are consistent
- [ ] Archive action remains red
- [ ] Archive reason field is readable
- [ ] Confirmation flow is clear
- [ ] Archived records are distinguishable
- [ ] Empty and error states are honest

## Audit Log

- [ ] Audit Log remains read-only
- [ ] Search and date filters are usable
- [ ] Expanded rows align correctly
- [ ] Long details wrap
- [ ] No editing action appears
- [ ] Mobile/tablet layout remains usable

Notes:

---

# 4. BHW

## Dashboard

- [ ] Register Patient remains the primary action
- [ ] Recent Registrations is easy to scan
- [ ] “View Patient Registry” looks interactive
- [ ] Footer link has hover and focus states
- [ ] Recent-registration rows are real buttons
- [ ] Accessible names identify the patient
- [ ] Patient preview opens once per activation
- [ ] No double navigation
- [ ] Mobile layout remains readable

## Patient Registration

- [ ] Form grouping and spacing are consistent
- [ ] Radio-pill options are reachable with Tab
- [ ] Arrow keys move between options
- [ ] Selected state remains visible
- [ ] Focus appears on the styled label
- [ ] Validation remains intact
- [ ] Long names and addresses do not break layout
- [ ] Form stacks at 390px
- [ ] Submit and cancel stay visible

## Patient Records

- [ ] Search and filters remain usable
- [ ] Table is readable
- [ ] Mobile rows remain usable
- [ ] Empty, no-match, loading, and error states differ
- [ ] Patient preview opens correctly
- [ ] Role restrictions remain intact

Notes:

---

# 5. Nurse

## Dashboard and Intake Queue

- [ ] “Ready for Vitals” is the clearest decision metric
- [ ] Nursing Intake Queue appears first
- [ ] Patient rows are easy to scan
- [ ] “Initial Intake” is a real button
- [ ] Click-through opens the intended workflow
- [ ] Search has an accessible name
- [ ] Loading and empty states are correct
- [ ] Mobile keeps the main action visible

## Initial Consultation and Vital Signs

- [ ] Patient identity and current task are clear
- [ ] Section headings use sentence case
- [ ] Transaction, transfer, and survey radio pills are keyboard accessible
- [ ] Arrow-key behavior works in each group
- [ ] Focus ring appears on choice labels
- [ ] Patient search has an accessible name
- [ ] Labels focus their fields
- [ ] BMI and Nutrition Status fields remain readable
- [ ] Role-restricted fields remain non-editable
- [ ] Validation survives errors
- [ ] Mobile stacking does not hide actions
- [ ] Long text does not cause horizontal overflow

Notes:

---

# 6. Doctor

## Dashboard

- [ ] Summary order remains Waiting → Follow-ups Due → Visits Today → Total Patients
- [ ] Waiting Patients appears before lower-priority content
- [ ] “Top Morbidities” label appears
- [ ] Due-today follow-ups are amber
- [ ] Future follow-ups are neutral
- [ ] Queue numbers and times align
- [ ] Waiting and follow-up rows are keyboard-accessible buttons
- [ ] Accessible names identify the patient and action
- [ ] “View all” uses the shared action style
- [ ] Charts have useful accessible names
- [ ] Axis text is readable
- [ ] Long names truncate safely
- [ ] Period controls do not overflow at 390px
- [ ] Follow-ups modal traps and restores focus

## Consultation Room

- [ ] Patient context remains prominent
- [ ] Workflow tabs use consistent brand treatment
- [ ] Tabs remain usable at narrow widths
- [ ] Radio and option chips are keyboard accessible
- [ ] Lab-test checkboxes remain reachable
- [ ] Labels focus the correct fields
- [ ] Repeated medication fields have no duplicate IDs
- [ ] Medication labels use restrained weight
- [ ] Remove Medication remains reachable
- [ ] OBGyne/pregnancy panels remain correctly styled
- [ ] Doctor-only fields remain editable
- [ ] Nurse-restricted fields remain disabled
- [ ] Signature canvas remains intact
- [ ] Save/complete actions remain visible at 390px

## Patient Details and History

- [ ] Header matches the shared Topbar language
- [ ] Back button uses the standard secondary style
- [ ] Patient names use restrained typography
- [ ] Identity block remains readable
- [ ] Edit fields use consistent focus states
- [ ] Transaction-history marks keep their intended weight
- [ ] Timeline rows align
- [ ] Status badges are readable
- [ ] Long entries wrap
- [ ] Empty and failure states differ

Notes:

---

# 7. Midwife

## Dashboard

- [ ] Topbar supplies the page H1
- [ ] Work Queue is presented as H2
- [ ] Main daily tasks are clear
- [ ] Census, maternal, vaccination, and reports are easy to find
- [ ] Patient-directory rows are real buttons
- [ ] Accessible names identify patients
- [ ] Mobile layout remains readable

## Census and Maternal Care

- [ ] Search has visible focus
- [ ] Male patient entry into Maternal Care is blocked
- [ ] Rejection message explains why
- [ ] Controls remain readable
- [ ] Mobile dropdowns do not clip
- [ ] Validation remains intact

## OCR Reports and FHSIS

- [ ] Selectors use the shared design system
- [ ] Loading state appears
- [ ] Export disables during processing
- [ ] Failure re-enables Retry
- [ ] Preview scrolls horizontally on mobile
- [ ] Official FHSIS subtree looks unchanged
- [ ] Government headings and borders remain intact
- [ ] Export one sample of each report type
- [ ] PDFs match the preview

## Patient Modal

- [ ] Back button is 40px and aligned
- [ ] Back button announces “Back to patient details”
- [ ] Close button remains reachable
- [ ] Modal traps and restores focus
- [ ] Header works at 390px

Notes:

---

# 8. Laboratory

## Dashboard and Queue

- [ ] Pending / Completed / Total summaries are clear
- [ ] Filter selected states are consistent
- [ ] Redundant inline stats are gone
- [ ] Search and filters wrap at 390px
- [ ] Statuses remain distinct
- [ ] Completed actions are disabled
- [ ] “Review” is a real button
- [ ] Review triggers exactly once
- [ ] Row click and button click do not double-fire
- [ ] Focus is visible
- [ ] Empty/loading states are correct

## Request Preview and Result Entry

- [ ] Drawer width is correct
- [ ] Drawer becomes full viewport below 640px
- [ ] Close button has a 40px target
- [ ] Drawer traps focus
- [ ] Escape closes
- [ ] Focus returns to Review
- [ ] Request context remains non-editable
- [ ] Lab role cannot alter doctor-requested tests
- [ ] Result fields use shared focus styles
- [ ] Pending → in-progress → completed remains clear
- [ ] Errors do not erase entered values

## Laboratory Request Document

- [ ] Official heading remains intact
- [ ] Underline fields look correct
- [ ] Border and print styling are unchanged
- [ ] Surrounding controls match the system
- [ ] Print one sample

Notes:

---

# 9. Pharmacist

## Dashboard and Queue

- [ ] Redundant summary metric remains removed
- [ ] Remaining metrics are meaningful
- [ ] Search and queue hierarchy are clear
- [ ] Prescription rows are readable
- [ ] “Review” is a real button
- [ ] Review triggers exactly once
- [ ] Row click and button click do not double-fire
- [ ] Status badges remain clear
- [ ] Empty/loading states are honest
- [ ] Mobile queue remains usable

## Preview and Dispensing

- [ ] Drawer width is appropriate
- [ ] Mobile preview does not overflow
- [ ] Medication details are readable
- [ ] Dispensing checkbox is at least 24px
- [ ] Checkbox does not distort the column
- [ ] Individual checks work
- [ ] Dispense stays disabled until all required items are checked
- [ ] Check-all → dispense runs once
- [ ] Completed prescriptions cannot be dispensed again
- [ ] Flag/undo semantic color remains intact
- [ ] Drawer traps and restores focus

## Prescription and Signature

- [ ] Official Rx heading remains intact
- [ ] Indigo accent band is acceptable
- [ ] Doctor signature canvas remains readable
- [ ] Draw and Clear actions work
- [ ] Non-doctors cannot alter the doctor signature
- [ ] Print CSS remains unchanged
- [ ] Print one sample prescription

Notes:

---

# 10. Follow-Up Visitation

- [ ] Header matches shared Topbar language
- [ ] Back button uses the standard style
- [ ] Only one logical H1 exists
- [ ] Patient context remains visible
- [ ] Fields use consistent labels and spacing
- [ ] Nurse-restricted fields remain disabled
- [ ] Signature area remains usable
- [ ] Labels use restrained typography
- [ ] Close/back targets are large enough
- [ ] Form works at 390px
- [ ] Print one sample
- [ ] Official form layout remains unchanged

Notes:

---

# 11. Patient Records and Patient Detail Modal

## Records

- [ ] Header, filters, search, and actions align
- [ ] Primary actions use darker brand fill
- [ ] Desktop columns are readable
- [ ] Mobile pattern is usable
- [ ] Error differs from empty state
- [ ] No-match differs from no-records
- [ ] Long names and identifiers do not break layout
- [ ] Row-action focus is visible

## Detail Modal

- [ ] Identity, details, and actions have clear hierarchy
- [ ] Primary actions use brand-active treatment
- [ ] Hover borders use tokens
- [ ] Close/back controls are 40px
- [ ] Focus is trapped
- [ ] Focus restores after close
- [ ] Remove action does not overlap
- [ ] Mobile modal remains usable
- [ ] No horizontal overflow

Notes:

---

# 12. Analytics Workspace

## Access

- [ ] Doctor sees Clinical
- [ ] Doctor sees Geographic
- [ ] Doctor sees Staff Operations
- [ ] Midwife sees Clinical
- [ ] Midwife sees Geographic
- [ ] Midwife does not see Staff Operations
- [ ] Direct unauthorized access does not reveal Staff Operations

## Workspace Tabs

- [ ] Tablist is one Tab stop
- [ ] Left/Right arrows switch tabs
- [ ] Navigation wraps
- [ ] Home selects first
- [ ] End selects last
- [ ] Focus follows active tab
- [ ] Mouse clicks still work
- [ ] `?view=` updates
- [ ] Back/Forward restore tab state
- [ ] Tablist does not overflow at 390px
- [ ] Active underline remains aligned

## Period Controls

- [ ] Presets are readable
- [ ] Custom dates work
- [ ] Reset returns to Month
- [ ] URL state persists
- [ ] Focus rings are not clipped
- [ ] Background refresh retains content
- [ ] “Updating” appears subtly
- [ ] No full-page blank during refresh

## Clinical Analytics

- [ ] KPI values load
- [ ] Failed KPI says “Unavailable,” not zero
- [ ] Largest backlog appears only when valid
- [ ] Service Trend legend is correct
- [ ] Follow-Up, Lab, and Prescription share one status-bar pattern
- [ ] Segments remain proportional
- [ ] Operational workload is three columns on desktop
- [ ] Detailed Records appears only in Clinical
- [ ] Lab and Prescription filters work
- [ ] Diagnosis has no irrelevant filters
- [ ] “Showing X of Y” updates
- [ ] No-match state is distinct
- [ ] Detail tabs support arrows
- [ ] Long ranges do not overflow
- [ ] Axes and points align

## Geographic Analytics

- [ ] Registered Patients uses all-time data
- [ ] Other metrics use the selected period
- [ ] Scope labels are honest
- [ ] No silent fallback
- [ ] Map fits the panel
- [ ] Barangays are keyboard focusable
- [ ] Enter/Space selects a barangay
- [ ] Tooltip appears on focus
- [ ] Focus stroke is visible on dark fills
- [ ] Ranking rows are keyboard focusable
- [ ] Tiny non-zero values have a truthful marker
- [ ] Zero values remain visible numerically
- [ ] Bars are proportional
- [ ] Legend wraps at 390px
- [ ] Scope tag gets its own row when needed
- [ ] Drill-down only runs while Geographic is active
- [ ] Drill-down retry works
- [ ] Previous rows remain on failure
- [ ] Privacy suppression is clearly worded
- [ ] No page-level overflow

## Staff Operations

- [ ] Role selector works
- [ ] Staff remains Doctor-only
- [ ] Doctor count works
- [ ] Lab supports count and turnaround
- [ ] Pharmacy supports count and turnaround
- [ ] Count uses count scaling
- [ ] Turnaround uses duration-aware intervals
- [ ] Exact median and average appear correctly
- [ ] Role totals and period totals are not confused
- [ ] No staff names or rankings appear
- [ ] Attribution is understandable
- [ ] Reliability note is visible
- [ ] Controls wrap on mobile
- [ ] Focus survives horizontal scrolling

## Chart Interaction

- [ ] Chart announces a summary
- [ ] Individual points remain exposed to screen readers
- [ ] Tab reaches points
- [ ] Focus shows the value
- [ ] Touch selects the intended point
- [ ] Dense charts do not let neighbours steal taps
- [ ] Dots stay centered
- [ ] X-axis labels align
- [ ] First/last labels do not clip
- [ ] Intermediate labels do not collide
- [ ] Tooltips do not clip
- [ ] Chart remains usable at 200% zoom

## States

- [ ] Initial load uses the correct tab skeleton
- [ ] Background refresh keeps content
- [ ] One failed RPC does not blank successful sections
- [ ] Local failures stay local
- [ ] Retry re-runs the current period
- [ ] Retry disables while running
- [ ] Permission-denied has no pointless Retry
- [ ] Stale retained data is labelled
- [ ] Full-page failure appears only when no usable data exists
- [ ] Empty, filtered-empty, failed, stale, and suppressed states differ

Notes:

---

# 13. Modal, Drawer, and Dialog Accessibility

- [ ] Initial focus enters
- [ ] Tab cycles inside
- [ ] Shift+Tab cycles backward
- [ ] Focus cannot move behind the dialog
- [ ] Escape closes only the topmost dialog
- [ ] Nested dialogs behave correctly
- [ ] Focus restores to the trigger
- [ ] Close buttons have accessible names
- [ ] Icon-only Back controls have accessible names
- [ ] Dialog title is announced
- [ ] Mobile full-screen drawers remain usable
- [ ] No content is unreachable

Notes:

---

# 14. Keyboard-Only Route

Complete without a mouse:

- [ ] Log in
- [ ] Open sidebar navigation
- [ ] Open Patient Records
- [ ] Search for a patient
- [ ] Open a patient
- [ ] Navigate radio-pill groups
- [ ] Complete a representative intake field
- [ ] Open and close a modal
- [ ] Trigger a queue action
- [ ] Navigate Analytics tabs
- [ ] Focus a chart point
- [ ] Select a barangay
- [ ] Open and close the user menu
- [ ] Log out

Record the first confusing or blocked step.

Notes:

---

# 15. Responsive and Zoom

## 1440px

- [ ] Page width is balanced
- [ ] Panels are not stretched unnecessarily
- [ ] Tables and charts align
- [ ] Empty whitespace is intentional

## 1024px

- [ ] Sidebar and content fit
- [ ] Summary grids reflow
- [ ] Drawers remain usable
- [ ] Filters do not collide

## 768px

- [ ] Toolbars wrap
- [ ] Tables scroll inside their container
- [ ] Modals remain centered
- [ ] No page-level horizontal scroll

## 390px

- [ ] Mobile navigation works
- [ ] Titles do not collide with badges
- [ ] Forms stack in workflow order
- [ ] Touch targets are large enough
- [ ] Tables remain usable
- [ ] Drawers use the viewport safely
- [ ] Charts and legends remain readable
- [ ] Map controls are reachable
- [ ] Sticky headers do not hide content

## 200% Zoom

- [ ] Navigation remains usable
- [ ] Text does not overlap
- [ ] Controls remain reachable
- [ ] Horizontal scrolling appears only where intended
- [ ] Dialog content remains reachable
- [ ] Focus indicators remain visible

Notes:

---

# 16. Print and Export

Print or export one sample of each:

- [ ] Laboratory Request
- [ ] E-Prescription
- [ ] Follow-Up Record
- [ ] Each FHSIS report type
- [ ] Any other official report

For each:

- [ ] Official headings are unchanged
- [ ] Government/RHU identity is intact
- [ ] Borders and tables are intact
- [ ] App navigation does not print
- [ ] Controls do not print
- [ ] Page breaks are acceptable
- [ ] Signatures remain visible
- [ ] Text does not clip
- [ ] Output matches preview
- [ ] Returning from print leaves usable focus

Notes:

---

# 17. Removed and Retired UI

- [ ] Old `e_prescription.html` is absent from the build
- [ ] No navigation points to it
- [ ] Consultation Room prescription still works
- [ ] Follow-Up page has no stray “Loading / Registered Nurse” row
- [ ] Static shells use the tokenized page background
- [ ] No orphaned Pharmacy preview appears
- [ ] Removing orphaned CSS caused no visible regression

Notes:

---

# 18. Final Cross-Role Consistency

Compare all seven dashboards.

- [ ] Panel borders and radii match
- [ ] Summary cards match
- [ ] Typography hierarchy matches
- [ ] Status badges share semantic meaning
- [ ] Search and filters match
- [ ] Empty/loading states match
- [ ] Primary actions are consistent
- [ ] Destructive actions remain red
- [ ] Dashboards remain purpose-built
- [ ] No role looks like an older product version
- [ ] No raw slate/gray visual island remains
- [ ] No duplicate page title remains

Notes:

---

# 19. Smoke-Test Exit Criteria

- [ ] All roles reach the correct landing page
- [ ] No critical visual or keyboard blocker remains
- [ ] Representative clinical screens pass at desktop and 390px
- [ ] Modal and drawer focus behavior passes
- [ ] Analytics tabs, charts, map, filters, and states pass
- [ ] No unintended page-level horizontal overflow
- [ ] Official print/export outputs remain intact
- [ ] No stale mockup is reachable
- [ ] All issues are logged
- [ ] P0/P1 UI issues are fixed or accepted
- [ ] `npm.cmd run build` passes
- [ ] `npx tsc --noEmit` passes
- [ ] Working tree is clean before database work

---

# Issue Log

| ID | Role | Screen | Viewport | Keyboard? | Severity | Expected | Actual | Reproduction Steps | Screenshot | Status |
|---|---|---|---:|---|---|---|---|---|---|---|
| UI-001 |  |  |  |  |  |  |  |  |  |  |

---

# Final Result

- Overall result:
- Critical issues:
- High issues:
- Medium issues:
- Low issues:
- Blocked checks:
- Print/export result:
- Accessibility result:
- Mobile result:
- Ready to proceed to database cleanup: Yes / No

Final notes:
