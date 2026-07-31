# MediSens — how to build with this library

MediSens is a Rural Health Unit EMR for Malvar, Batangas. Screens built with it should read as
**clinical, calm, and scannable** — never as a generic SaaS dashboard. No gradients, no glows, no
decorative cards, no emojis in the interface.

## Setup

**No provider or theme wrapper is required.** Every component renders correctly on its own — import
it and use it. Styling comes entirely from the stylesheet closure (`styles.css` → `_ds_bundle.css`),
which ships three layers in cascade order:

1. Tailwind preflight + utilities (a static build of the utilities the app loads at runtime)
2. MediSens design tokens (`:root` custom properties)
3. MediSens semantic classes (`clinical-*`, `ops-*`, `doctor-*`)

## Styling idiom

This library styles with **Tailwind utility classes**, and reaches the brand palette through
**CSS-variable arbitrary values** rather than hardcoded colors. That is the house idiom — follow it:

```jsx
<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
  <p className="text-sm text-[var(--text-secondary)]">Barangay Poblacion</p>
</div>
```

Use these tokens, never raw hex:

| Purpose | Tokens |
|---|---|
| Brand | `--brand-primary` `--brand-primary-hover` `--brand-active` `--brand-soft-surface` `--brand-accent-surface` |
| Text | `--text` `--text-2` `--text-secondary` `--text-muted` |
| Surfaces | `--surface` `--surface-subtle` `--surface-muted` `--bg` |
| Borders | `--border` `--border-soft` `--border-strong` |
| Focus | `--focus-color` `--focus-ring` |

**Solid fills that carry white text must use `--brand-primary-hover` or `--brand-active`**, not
`--brand-primary` — the lighter blue falls below 4.5:1 with white.

Semantic classes exist for clinical furniture and are preferred over rebuilding them from utilities:
`clinical-table`, `clinical-primary` / `clinical-secondary` (row title/meta), `clinical-status-badge`
(`.success` / `.warning` / `.error` modifiers), `clinical-filter-button`, `clinical-worklist-row`,
`ops-panel` (+ `ops-panel-header`, `ops-panel-title`), `ops-summary-card` (+ `ops-summary-label`,
`ops-summary-value`).

## Status colour rules (do not violate)

Green = success/completed. Amber = warning/pending/offline. Red = error/destructive/urgent.
Blue-indigo = brand/selection/focus/information. Never signal a clinical status by colour alone —
pair it with text, as `Badge` and `clinical-status-badge` do.

## Where the truth lives

Read `styles.css` and its imports for the real token and class vocabulary, and each component's
`<Name>.prompt.md` + `<Name>.d.ts` for its API. Components are grouped as **general** (Button, Input,
Card, Badge, Modal, ClinicalDrawer, EmptyState, LoadingState, Skeleton, Toast, ClinicalField…),
**layout** (Topbar, PageHeader, Breadcrumbs, UserMenu), **shared** (Icon, NetworkBadge),
**feedback** (OfflineBanner), and **patient** (PatientChartIdentityHeader, PatientHistoryPanel).

## Idiomatic example

```jsx
import { Card, CardHeader, CardTitle, CardBody, Badge, Button } from 'crud-feature';

<Card>
  <CardHeader><CardTitle>Waiting patients</CardTitle></CardHeader>
  <CardBody>
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="clinical-primary">Dela Cruz, Maria L.</p>
        <p className="clinical-secondary">34 / Female · Barangay Poblacion</p>
      </div>
      <Badge tone="amber">Awaiting consultation</Badge>
    </div>
    <Button variant="primary" className="mt-4">Start consultation</Button>
  </CardBody>
</Card>
```

Use library components for controls; use the utility + token idiom above for your own layout glue.

## Not in this library

`Sidebar`, `PatientDetailModal`, and `PatientTransactionHistory` are deliberately excluded — they
depend on the app's Supabase client and cannot render standalone. Build navigation shells with
`Topbar` plus your own layout.
