# MediSens Laboratory Module Redesign Plan

## Purpose

Redesign the current Laboratory area so it no longer behaves like one oversized dashboard containing overview, queue management, result review, and analytics in a single scrolling page.

The redesign must preserve all existing Laboratory functionality and business logic while reorganizing the experience into a clearer, task-based information architecture.

The preferred final structure is:

1. **Dashboard**
2. **Lab Requests**
3. **Results**
4. **Analytics**

The goal is to make the Laboratory workflow easier to understand, faster to scan, more responsive, and more consistent with the MediSens design system.

---

# 1. Core Product Direction

The Laboratory module should answer four distinct user questions:

| Module | Primary Question |
|---|---|
| Dashboard | What needs my attention right now? |
| Lab Requests | Which laboratory requests still need processing? |
| Results | Which results have already been completed and can be reviewed? |
| Analytics | What is happening in the laboratory over time? |

Do not keep all four jobs inside one page.

The redesign should reduce cognitive load, improve scanability, and make the next action obvious.

---

# 2. Non-Negotiable Guardrails

Before editing anything:

- Read and follow the project `CLAUDE.md`.
- Read any existing MediSens UI/design guidance such as `UI-Manual-Check.md`, `SKILL-UI.md`, design tokens, and shared component conventions if present.
- Inspect the current Laboratory implementation completely before changing it.
- Preserve existing MediSens colors, typography, spacing, cards, buttons, icons, forms, layout patterns, and responsive behavior.
- Preserve all current Laboratory business logic.
- Preserve current Supabase queries, permissions, RLS behavior, and role restrictions.
- Preserve current result-encoding flow.
- Preserve completed-result viewing behavior.
- Preserve patient data handling and privacy protections.
- Do not change database schema unless absolutely required. This redesign should primarily be an information architecture and UI/UX refactor.
- Do not rename database fields, RPCs, services, or role strings unless necessary.
- Do not modify unrelated modules.
- Do not redesign the Staff Login, Patient Portal, Nurse, Doctor, Midwife, BHW, Pharmacy, Admin, or shared global layouts unless a shared component change is truly required.
- Avoid introducing new large dependencies.
- Do not introduce new gradients, decorative effects, random colors, or visual patterns outside the current MediSens design language.
- Do not create horizontally scrolling primary layouts on mobile.
- Maintain at least 44px touch targets for interactive controls where applicable.
- Keep accessible keyboard navigation, labels, focus states, contrast, and semantic structure.
- Prefer existing shared components over duplicate custom implementations.
- If existing data semantics are unclear, preserve behavior and report the ambiguity rather than inventing healthcare meaning.

---

# 3. Current UX Problems to Solve

## 3.1 Dashboard overload

The current page contains KPI cards, Work Queue, search, status filtering, pending result actions, completed result actions, pagination-like controls, request volume chart, test distribution chart, and analytics timeframe filters.

### Required fix

Move detailed work and analytics to dedicated modules. The Dashboard should summarize and direct the user to the correct next action.

## 3.2 Repetitive hierarchy

The interface currently repeats variations of Dashboard, Laboratory Dashboard, and Diagnostic Laboratory.

### Required fix

Use a cleaner hierarchy. Recommended pattern:

- Topbar / role context: **Diagnostic Laboratory**
- Page title: **Dashboard**, **Lab Requests**, **Results**, or **Analytics**

Avoid repeating “Laboratory Dashboard” multiple times on one screen.

## 3.3 Sidebar is underutilized

### Required final navigation

```text
DIAGNOSTICS

Dashboard
Lab Requests
Results

INSIGHTS

Analytics
```

If section grouping is too heavy for the existing Sidebar component, a single group is acceptable:

```text
DIAGNOSTICS

Dashboard
Lab Requests
Results
Analytics
```

## 3.4 Work Queue copy becomes inaccurate

The current description says “Pending laboratory requests that need your attention” even when All or Completed is selected.

### Required fix

Use task-appropriate wording.

- Pending: **Requests awaiting laboratory result encoding.**
- All: **Review all laboratory requests.**

Completed requests should primarily live in Results rather than be treated as unfinished work.

## 3.5 Completed results do not belong in a Work Queue

Pending/active requests belong under **Lab Requests**. Completed items belong under **Results**.

## 3.6 Hidden status navigation

All / Pending / Completed are currently hidden inside a dropdown.

### Required fix

For Lab Requests, prefer visible tabs or segmented controls when appropriate:

```text
Pending (6)   All (30)
```

Completed should primarily be a Results module.

## 3.7 KPI time scopes are inconsistent

Current cards mix pending total, completed today, and total requests.

### Required fix

Recommended Dashboard KPI set:

1. **Pending Requests** — current pending count
2. **Completed Today** — results completed today
3. **Requests Today** — requests received today
4. Optional **Total Recorded Requests**, only if useful and clearly scoped

Do not show ambiguous Total Requests without context.

## 3.8 KPI cards should be actionable where useful

Where appropriate:

- Pending Requests → Lab Requests filtered to Pending
- Completed Today → Results filtered to Today
- Requests Today → Lab Requests filtered to Today

## 3.9 Request rows are dense

Current rows contain avatar, patient name, sex, age, request date, requested tests, requested by, status, and action button.

### Required fix

Desktop/tablet should use stable aligned columns or a structured list with clear column behavior.

Primary information:
- Patient
- Requested Test(s)
- Status / age of request
- Action

Secondary:
- Requested date
- Requested by

Mobile should convert cleanly into stacked cards without horizontal scrolling.

## 3.10 Test names truncate poorly

Avoid patterns such as `Clinical Microscopy · Blood Chemistry · Pregn...`.

Prefer:

```text
Clinical Microscopy · Blood Chemistry +2 more
```

Allow the remaining tests to be revealed through an accessible detail interaction.

## 3.11 “General” is unclear

Inspect actual data semantics.

- If General is a real valid category, preserve it.
- If it is merely a fallback, use clearer presentation such as **Test details unavailable**.

Do not alter stored values simply for presentation.

## 3.12 Repeating “Requested by” in every row creates noise

Use a stable column heading on desktop/tablet. Mobile cards may include the label.

## 3.13 Current row design is between a table and a card list

Choose a clearer model:

- Desktop/tablet: structured data list/table with aligned columns
- Mobile: responsive stacked cards

Do not force horizontal scrolling.

## 3.14 “View all requests” is not scalable pagination

Replace unlimited View all behavior with real pagination or controlled incremental loading.

Preferred desktop pattern:

```text
Previous   Page 1 of 6   Next
```

Also show result count, e.g. `Showing 1–20 of 126 requests`.

## 3.15 Filter/search state should survive detail interactions

If a user filters Pending, searches a patient, opens Encode Result, then returns, preserve the relevant search/filter/page state whenever practical.

## 3.16 Analytics is buried below operational work

Move detailed analytics to its own Analytics module. Dashboard may show only a compact snapshot.

## 3.17 Empty charts look broken

For zero-data periods, show an explicit empty state:

> No laboratory requests were recorded during this period.

## 3.18 Red/green trend semantics may be misleading

A decrease in laboratory requests is not inherently negative.

Prefer neutral wording such as:

> 100% fewer requests than the previous 7 days

Do not use positive/negative colors unless the interpretation is operationally meaningful.

## 3.19 Sparse chart axes should adapt

Charts must remain readable with zero, one, low, and high counts.

## 3.20 Test Distribution labels are confusing

If both “Others” and “Other Tests” exist, inspect what each actually means and present clearer labels such as:

- Custom / Specified Tests
- Remaining Categories

Do not change underlying values unless necessary.

## 3.21 Analytics may confuse requests with individual tests

Verify whether each metric counts laboratory requests or individual tests ordered. Use precise labels.

## 3.22 Different time scopes coexist without enough context

Make timeframe explicit for every metric/chart where needed.

## 3.23 Old pending requests lack aging/priority visibility

Without inventing medical urgency, show request age where useful, e.g.:

> Requested Aug 4, 2026 · 23 days ago

Only surface urgency/priority if the system already has that field or rule.

## 3.24 Search scope is unclear

Inspect actual searchable fields and make the placeholder explicit, for example:

> Search patient name, request number, or test

Do not advertise unsupported search fields.

## 3.25 Missing scalable filters

Only implement filters supported by available data:

- Status
- Date requested
- Test category
- Requested by
- Patient/search
- Date completed for Results

Use progressive disclosure through a **Filters** button or compact panel. Provide **Clear filters** when active.

---

# 4. Final Information Architecture

## 4.1 Dashboard

### Purpose

A short operational overview answering:

> What requires my attention right now?

### Recommended content

#### Header
- Page title: **Dashboard**
- Subtitle: **Overview of laboratory workload and recent activity.**

#### Summary metrics
1. Pending Requests
2. Completed Today
3. Requests Today
4. Optional Total Recorded Requests, clearly scoped

#### Pending attention panel
Show a maximum of approximately 5 recent or oldest pending requests.

Suggested information:
- patient
- test summary
- request date
- request age if useful
- Encode Result action

Provide **View all pending requests**.

#### Recent activity / analytics snapshot
Do not place the full analytics dashboard here. Use one compact summary and a **View Analytics** action.

### Avoid on Dashboard
- giant all-request list
- full results archive
- full analytics charts
- complex filters
- unlimited request pagination

---

# 5. Lab Requests Module

## Purpose

Process requests that require Laboratory action.

### Header

**Lab Requests**

Subtitle:

> Review laboratory requests and encode pending results.

### Default state

Default to **Pending** if that best reflects the daily Laboratory workflow.

### Main controls

```text
Pending (6)   All (30)
```

Then:
- Search
- Filters
- Clear filters when active

### Search

Use actual supported fields only, such as patient name, MediSens ID, request/lab number, or test name if the current data/query supports them.

### Filters

Potential supported filters:
- date requested
- test category
- requested by
- status in All view

### Request list

Desktop/tablet columns:
1. Patient
2. Test(s)
3. Requested
4. Requested By
5. Status
6. Action

Mobile card priority:
- Patient
- Test(s)
- Requested date
- Status
- Encode/View action

### Pending action

Primary action: **Encode Result**

### Pagination

Implement real pagination or controlled Load More. Do not expose unlimited View all behavior.

### Empty states

**No pending requests**
> There are no laboratory requests awaiting results.

**No search results**
> No requests match your search or filters.

---

# 6. Results Module

## Purpose

Review completed laboratory results without mixing them into the active work queue.

### Header

**Results**

Subtitle:

> Review completed laboratory results and result history.

### Controls

- Search
- Date completed
- Test type/category
- Requested by if useful
- Clear filters

Potential visible shortcut tabs:

```text
All Results   Today
```

Only use tabs if useful.

### Result list

Recommended columns:
1. Patient
2. Test(s)
3. Requested Date
4. Completed Date
5. Requested By
6. Action

Primary action: **View Result**

Avoid Encode Result in Results unless existing business logic explicitly allows result correction/editing.

### Result detail

Reuse current result detail flow and preserve existing permissions and finalization semantics.

---

# 7. Analytics Module

## Purpose

Show Laboratory operational trends without cluttering daily work.

### Header

**Analytics**

Subtitle:

> Review laboratory request and testing activity over time.

### Global controls

- Date range
- Optional test category filter if supported

Recommended presets:
- Last 7 Days
- Last 30 Days
- This Month
- Custom range only if existing project patterns support it cleanly

## 7.1 Request Volume

Show number of laboratory requests over time.

Use neutral trend wording and a proper zero-data empty state.

## 7.2 Test Distribution

Clarify whether values represent requests or tests ordered. Use clear category names. Show count as primary and percentage as secondary.

## 7.3 Completion Activity

If available data supports it reliably:
- completed results over time
- pending vs completed

Do not invent completion-time KPIs if timestamps are unavailable or unreliable.

## 7.4 Most Requested Tests

If supported by data:
- ranked list
- count
- percentage secondary

### Analytics guardrail

No decorative analytics that cannot be accurately derived from the current database.

Every chart needs:
- clear title
- clear measurement
- clear timeframe
- empty state
- accessible interpretation

---

# 8. Navigation Behavior

Update Laboratory Sidebar navigation to:

```text
Dashboard
Lab Requests
Results
Analytics
```

Follow the existing MediSens routing/navigation conventions.

Requirements:
- active module clearly highlighted
- no unintended full-page reloads
- browser Back/Forward works where applicable
- preserve role protection/auth behavior

---

# 9. Responsive Requirements

The redesign must work on desktop, LGU-provided tablet, and mobile.

## Desktop
- use available width efficiently
- aligned data columns
- avoid excessive empty whitespace
- no oversized dashboard cards

## Tablet
- retain large touch targets
- avoid compressed wide tables
- collapse lower-priority columns when needed
- preserve clear primary actions

## Mobile
- no horizontal scrolling for primary request/result lists
- convert rows into stacked cards
- minimum ~44px interactive targets
- filters may open in a drawer/sheet/modal
- preserve visible status and primary action
- avoid tiny analytics legends
- charts must remain readable or switch to simpler summaries

---

# 10. Accessibility Requirements

Preserve or improve:

- semantic headings
- form labels
- accessible names
- keyboard operation
- visible focus states
- logical tab order
- color contrast
- status communication beyond color alone
- touch target size
- reduced-motion behavior where applicable

Do not make hover the only way to reveal critical information.

---

# 11. Interaction Details

## Search
- debounce only if necessary
- no full-page refresh
- show clear empty state

## Filters
When filters are active:
- indicate active state/count if useful
- provide Clear filters

## Result encoding
Do not redesign the clinical result form unless required for navigation integration.

Preserve:
- validation
- saving guard
- duplicate-submit protection
- existing result loading
- Supabase service calls
- toast/error behavior

## Returning from result encoding
Return the user to the previous Lab Requests context whenever practical:
- previous tab
- search
- filters
- page

---

# 12. Data Semantics Audit Before UI Changes

Before implementing analytics or labels, verify:

1. What exactly counts as a Laboratory Request?
2. Can one request contain multiple tests?
3. What determines Pending vs Completed?
4. Which timestamp represents request date?
5. Which timestamp represents completion/result date?
6. Is General an actual category or fallback?
7. What does `others` represent?
8. Are there existing urgency/priority fields?
9. Which fields are searchable?
10. Is there a stable request/lab number?
11. Can completed results be edited?
12. What existing filtering/query helpers already exist?

Document ambiguity before changing presentation semantics.

---

# 13. Suggested Component Architecture

Do not force exact filenames if repository conventions suggest better locations.

Conceptually separate:

```text
LaboratoryDashboard
LaboratoryRequestsPage
LaboratoryResultsPage
LaboratoryAnalyticsPage
```

Reusable components may include:

```text
LabSummaryCard
LabRequestList
LabRequestRow
LabRequestMobileCard
LabSearchToolbar
LabFilterPanel
LabPagination
LabStatusBadge
LabTestSummary
LabEmptyState
```

Reuse existing MediSens shared components where possible. Avoid one massive `index.tsx`.

---

# 14. Implementation Order

## Phase L1 — Audit and Architecture

Before broad edits:
1. Inspect current Laboratory code.
2. Map current data flow.
3. Map result encode/view behavior.
4. Identify reusable logic.
5. Identify navigation mechanism.
6. Identify current charts.
7. Identify responsive CSS.
8. Identify duplicated code.
9. Confirm data semantics above.
10. Produce a short implementation plan before editing.

Then proceed unless blocked by a genuine product ambiguity.

## Phase L2 — Navigation + Page Separation

Implement the four-module shell:
- Dashboard
- Lab Requests
- Results
- Analytics

Verify sidebar active state, route/hash behavior, and auth/role protection.

## Phase L3 — Dashboard Simplification

Implement:
- scoped KPI cards
- pending preview
- CTA to Lab Requests
- compact activity snapshot if supported

Remove full request list and full analytics section from Dashboard.

## Phase L4 — Lab Requests

Implement:
- Pending/All navigation
- search
- filters
- clear filters
- stable list structure
- test summary handling
- aging display if appropriate
- Encode Result
- pagination
- empty states
- responsive behavior
- state preservation

## Phase L5 — Results

Implement:
- completed result list
- search
- supported filters
- completed date if available
- View Result
- responsive behavior
- empty/error states

Reuse current completed-result detail behavior.

## Phase L6 — Analytics

Implement:
- Request Volume
- Test Distribution
- neutral trend semantics
- zero-data state
- correct requests-vs-tests labeling
- improved chart scaling
- optional completion analytics only if accurately supported
- responsive chart behavior

## Phase L7 — Full UI/UX Polish

Perform consistency pass for:
- spacing
- typography
- alignment
- status badges
- button hierarchy
- wording
- truncation
- loading/skeleton states
- error states
- focus states
- keyboard behavior
- touch targets
- tablet proportions
- no horizontal overflow

---

# 15. Required Loading and Error States

Every module must handle:

- initial loading
- background refresh
- no data
- search with no results
- filter with no results
- backend/load error
- offline state if existing Laboratory behavior exposes it

Use existing MediSens Skeleton and Toast patterns where applicable.

---

# 16. Wording / Content Guidelines

Use user-facing healthcare workflow language.

Prefer:
- Pending Requests
- Completed Results
- Requested By
- Requested Date
- Completed Date
- Encode Result
- View Result
- No requests match your filters

Avoid raw database/internal terminology or ambiguous developer labels.

---

# 17. Visual Hierarchy

Priority order:

1. Current page title
2. Current operational state / pending workload
3. Search/filter controls
4. Data list
5. Secondary information

Analytics should not compete visually with operational work outside the Analytics module.

Avoid oversized KPI cards, too many equally weighted cards, unnecessary borders, repeated labels, and decorative empty space.

---

# 18. Performance Considerations

- Do not render every historical request at once.
- Avoid filtering huge row sets in the DOM unnecessarily.
- Keep chart recalculation controlled.
- Destroy Chart.js instances correctly.
- Do not create duplicate network calls just because modules were separated.
- Reuse fetched data where safe without introducing stale clinical behavior.
- Keep Supabase queries scoped to the module’s real needs where practical.

---

# 19. Security / Privacy

Preserve all existing controls.

Do not:
- expose additional patient data merely because there is more screen space
- log sensitive result values unnecessarily
- store clinical data in localStorage
- bypass RLS
- make result details accessible to unauthorized roles
- weaken existing login/session behavior

Laboratory remains staff-only.

---

# 20. Acceptance Criteria

## Navigation
- [ ] Dashboard exists.
- [ ] Lab Requests exists.
- [ ] Results exists.
- [ ] Analytics exists.
- [ ] Sidebar active state is correct.
- [ ] Navigation does not create unintended full refreshes.
- [ ] Browser navigation behaves reasonably.

## Dashboard
- [ ] No giant all-request queue.
- [ ] No full analytics dashboard.
- [ ] Pending workload is obvious.
- [ ] KPI scopes are understandable.
- [ ] Primary next action is obvious.
- [ ] Dashboard remains compact.

## Lab Requests
- [ ] Pending requests are easy to access.
- [ ] All requests can still be reviewed.
- [ ] Search works.
- [ ] Supported filters work.
- [ ] Clear filters works when needed.
- [ ] Test summaries do not truncate meaninglessly.
- [ ] Encode Result still works.
- [ ] Pagination scales beyond 30 requests.
- [ ] Request context is preserved when practical.

## Results
- [ ] Completed results are separated from unfinished work.
- [ ] Search works.
- [ ] Supported filters work.
- [ ] View Result works.
- [ ] Completed-result detail behavior is preserved.
- [ ] No accidental result editing is introduced.

## Analytics
- [ ] Request Volume is correctly labeled.
- [ ] Test Distribution is correctly labeled.
- [ ] Requests vs tests are not confused.
- [ ] Zero-data periods have a proper empty state.
- [ ] Trend semantics are neutral where appropriate.
- [ ] Sparse data does not create broken-looking charts.
- [ ] Date range is clear.

## Responsive
- [ ] Desktop works.
- [ ] Tablet works.
- [ ] Mobile works.
- [ ] No horizontal overflow in primary content.
- [ ] Touch targets are adequate.
- [ ] Lists transform cleanly on mobile.
- [ ] Analytics remains readable.

## Accessibility
- [ ] Keyboard navigation works.
- [ ] Focus states are visible.
- [ ] Controls have accessible labels.
- [ ] Status is not communicated by color alone.
- [ ] No inaccessible hover-only critical information.
- [ ] Reduced-motion behavior remains intact where applicable.

## Regression
- [ ] Laboratory login/role access remains unchanged.
- [ ] Existing Supabase behavior remains unchanged.
- [ ] Pending request loading works.
- [ ] Result encoding works.
- [ ] Duplicate-submit protection remains intact.
- [ ] Existing completed results load correctly.
- [ ] Result detail opens correctly.
- [ ] Build passes.
- [ ] `git diff --check` passes.

---

# 21. Required Testing

Run at minimum:

```bash
npm run build
git diff --check
```

Perform runtime tests if browser tooling is available.

## Runtime checklist

### Dashboard
- open Laboratory
- verify summary
- click pending CTA
- verify navigation

### Lab Requests
- Pending
- All
- search
- filters
- clear filters
- pagination
- open pending request
- encode result
- save
- return

### Results
- load completed results
- search
- filter
- open result
- close/back

### Analytics
- Last 7 Days
- Last 30 Days
- zero-data range
- test distribution
- responsive resizing

### Responsive widths

Check representative widths:
- desktop ~1440px
- laptop ~1024–1280px
- tablet ~768–900px
- mobile ~390–430px

Do not claim runtime PASS if browser testing is unavailable.

---

# 22. Git / Scope Discipline

Before implementation:

```bash
git status
```

Work only on the intended Laboratory redesign.

Before commit:

```bash
git status --short
git diff --name-status
git diff --check
npm run build
```

Do not commit unrelated files. Do not use destructive Git commands. Do not force-push. Do not merge unrelated branches as part of this task.

---

# 23. Final Report Required From Claude

When finished, report:

1. Final Laboratory information architecture.
2. Files changed.
3. Components created/refactored.
4. Navigation behavior.
5. Dashboard changes.
6. Lab Requests changes.
7. Results changes.
8. Analytics changes.
9. Responsive changes.
10. Accessibility changes.
11. Data-semantic decisions or ambiguities.
12. Build result.
13. `git diff --check` result.
14. Runtime/browser test result.
15. Any deferred improvements.
16. Confirmation that unrelated modules and business logic were preserved.

---

# 24. Final Instruction

Treat this as a **Laboratory information architecture + UI/UX refactor**, not a feature rewrite.

The key outcome is:

> Laboratory staff should immediately understand where to go, what needs attention, and how to process or review laboratory work without scanning one oversized page.

Preserve the strongest parts of the current redesign, especially:

- clean MediSens visual language
- current sidebar/topbar structure
- KPI visual direction
- clear pending/completed status badges
- Encode Result / View Result distinction
- Laboratory Activity visual language

But reorganize them into a coherent four-module workflow.

Do not begin unrelated system work after completing this Laboratory redesign.
