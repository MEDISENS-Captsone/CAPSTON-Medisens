# PWA-OFFLINE-TARGET.md — MediSens Future Offline and Synchronization Direction

**Project:** MediSens  
**Version:** 1.0  
**Status:** TARGET-STATE planning document  
**Important:** Do not implement these capabilities during ordinary UI work

---

## 1. Purpose

This file records the desired future offline and synchronization experience for MediSens as a Progressive Web App.

It is intentionally separated from `SKILL-UI.md` because offline capability is not merely visual. It may require:

- service worker strategy
- local storage or IndexedDB
- background synchronization
- server conflict rules
- authentication changes
- idempotency
- encryption and privacy controls
- database and audit behavior
- deployment configuration

A UI agent must not treat this file as proof that these capabilities currently exist.

Before any offline implementation:

1. inspect the current PWA and service worker configuration
2. inventory current cached routes and data
3. inspect authentication behavior while disconnected
4. inspect Supabase usage and current mutation patterns
5. confirm which workflows are approved for offline use
6. complete a security and privacy review

---

## 2. Scope labels

Every offline-related task should classify behavior as one of:

- **CURRENT:** already implemented and verified
- **PARTIAL:** implemented for some routes or states, not safe to generalize
- **TARGET:** approved direction, not implemented
- **OUT OF SCOPE:** not approved for the current capstone release

Never present a TARGET capability as working in the UI.

---

## 3. Target experience

When offline support is eventually approved, MediSens should answer four questions clearly:

1. Am I online or offline?
2. Is my current work saved on this device?
3. Has it reached the server?
4. Is it safe to close or leave this screen?

The visual treatment should match the main MediSens style:

- compact
- white/soft-grey surfaces
- restrained status tints
- navy structural accents
- clear icon plus text
- no large warning panels unless action is required

Offline is a normal operational state for selected field workflows, not a catastrophic error.

---

## 4. Recommended delivery phases

### Phase 0 — Audit and definition

Before implementation:

- list all routes and mutations
- identify existing PWA manifest and service worker behavior
- identify all data stored in the browser
- identify sensitive data risks
- classify each workflow as online-only, read-only offline, draft-only offline, or queued-write offline
- define audit and conflict requirements
- create test accounts and dummy records

Output should be a written implementation plan, not code.

### Phase 1 — Installability and stable shell

Target capabilities:

- valid web app manifest
- correct icons and theme color
- stable standalone layout
- safe-area support
- shell available after an initial successful load
- explicit offline fallback for unavailable routes
- no claim that patient records are cached unless verified

### Phase 2 — Read-only cached access

For explicitly approved data only:

- previously loaded non-sensitive or approved patient summaries may remain readable
- cached timestamp is shown
- stale data is labelled
- edit actions requiring the server are disabled with a reason
- restricted data is not cached merely for convenience

### Phase 3 — Local drafts

Target for selected long forms:

- local draft save
- visible `Draft saved on this device` state
- restore/discard prompt
- draft remains separate from a completed clinical record
- local draft is removed only after confirmed save or explicit discard

Do not sync drafts as completed records.

### Phase 4 — Queued writes for approved workflows

Potential candidates require explicit approval. Examples may include:

- selected BHW registration or patient update workflows
- selected Nurse intake/vital workflows
- selected Midwife field entry workflows

Each candidate must be separately evaluated. The statement “BHW is mobile-first” does not automatically mean every BHW screen is safe offline.

### Phase 5 — Attachments and conflict handling

Only after structured text writes are stable:

- queued attachment uploads
- resumable progress
- duplicate prevention
- conflict review
- failed item recovery
- clear audit trail

---

## 5. Workflow capability matrix template

Complete this before implementation.

| Role | Workflow | Current state | Target state | Offline action allowed | Security notes |
|---|---|---|---|---|---|
| BHW | Patient registration | To inspect | Target candidate | Not approved yet | Sensitive demographic data |
| Nurse | Vital signs | To inspect | Target candidate | Not approved yet | Clinical data and duplicate prevention |
| Doctor | Consultation | To inspect | Later target | Not approved yet | High clinical risk |
| Midwife | Maternal care entry | To inspect | Target candidate | Not approved yet | Sensitive maternal data |
| Laboratory | Release result | To inspect | Online-only target | No | Must verify server state |
| Pharmacist | Dispense medicine | To inspect | Online-only target | No | Inventory and audit dependency |
| Admin | User management | To inspect | Online-only target | No | Authentication and authorization |

This table is a starting template, not an approved capability list.

---

## 6. Connection indicator target

When implemented, a persistent connection indicator should remain discoverable without dominating the header.

| State | Suggested label | Meaning |
|---|---|---|
| Online and synced | `Online` | No local changes waiting |
| Online, synchronizing | `Syncing 2 of 5…` | Active sync progress |
| Online, waiting | `3 changes waiting` | Queued but not yet sent |
| Reconnecting | `Reconnecting…` | Network recovery in progress |
| Offline | `Offline — changes stay on this device` | No connection |
| Sync failed | `3 changes couldn't sync` | User attention required |

Rules:

- icon plus text
- never color only
- offline state must not auto-dismiss
- do not show `Synced` if the server has not acknowledged the mutation
- tapping the indicator opens sync details when that screen exists

---

## 7. Save and sync states

The UI must distinguish these states:

### Unsaved

`Unsaved changes`

The user may lose current edits if they leave and no draft exists.

### Draft saved locally

`Draft saved on this device · 10:42`

This is not a completed record and not yet part of official clinical history.

### Completed record saved locally and queued

Only for explicitly approved queued-write workflows:

`Saved on this device. Waiting to sync.`

### Syncing

`Syncing…`

### Synced

`Saved to MediSens · 10:43`

### Failed

`Couldn't sync · View details`

Do not reduce these to one generic word such as `Saved`.

---

## 8. Sync queue target

When queued writes are approved, provide a dedicated sync queue reachable from the global connection indicator.

### 8.1 Groups

1. Needs attention
2. Waiting to sync
3. Synced today, collapsed by default

### 8.2 Item contents

- record type
- patient name and ID where permitted
- local action: created or updated
- local timestamp
- current state
- failure reason in plain language
- `Retry`
- `Open record`

### 8.3 Discarding

Do not offer silent removal.

A discard action must:

- require confirmation
- name the record
- explain that local changes will be permanently lost
- create an audit event where the architecture supports it

---

## 9. Actions that should remain online-only

Unless a later architecture review explicitly approves otherwise, keep these online-only:

- user provisioning and role changes
- permission changes
- archive approval or restoration
- laboratory result release
- medicine dispensing that changes shared inventory or authoritative status
- report generation requiring complete server data
- destructive or irreversible administrative actions
- anything requiring a current server lock or conflict check

The disabled control should remain visible only when the user normally has permission, with a clear reason:

`Available when back online.`

Do not show controls for actions the role never has permission to perform.

---

## 10. Local draft target

### 10.1 Suitable forms

Long forms with expensive typed content may benefit from drafts once approved.

Potential candidates:

- patient registration
- consultation narrative
- initial consultation
- selected maternal care forms

### 10.2 Draft behavior

- save on a safe interval and meaningful blur/navigation events
- show last draft time
- preserve drafts across refresh and app restart
- associate draft with user, route, and patient context
- prevent a draft from opening under the wrong patient
- restore only after explicit confirmation when ambiguity exists
- remove after confirmed server save

### 10.3 Draft restore

Example:

`You have an unsaved draft from 14 Aug, 10:42.`

Actions:

- `Restore draft`
- `Discard draft`

### 10.4 Draft privacy

- encrypt or otherwise protect sensitive local data according to approved architecture
- clear drafts on explicit sign-out according to security policy
- do not leave readable sensitive data in simple localStorage
- define device-sharing behavior for RHU workstations

---

## 11. Queued-write target

### 11.1 Requirements before enabling

Every queued mutation needs:

- client-generated stable identifier or idempotency key
- schema version
- user and device context according to security design
- local timestamp
- server acknowledgement
- retry strategy
- failure handling
- duplicate prevention
- audit plan
- conflict rule

### 11.2 UI behavior

- form remains visible while saving locally
- success wording states `saved on this device`, not `saved to MediSens`
- queued records show a small `Waiting to sync` badge in lists
- status persists across app restart
- failed sync remains visible until resolved

### 11.3 Clinical caution

A queued write should not immediately trigger downstream authoritative actions that depend on server state.

Example:

An offline-captured vital-sign record may be queued, but it must not make a server-side consultation appear complete until the server accepts it.

---

## 12. Conflict handling target

Automatic last-write-wins is unsafe for many clinical records.

### 12.1 When a conflict occurs

Show:

- who changed the server record, when available
- which fields differ
- local value
- server value
- safe actions according to workflow

Possible actions:

- `Keep my version`
- `Use server version`
- `Review changes`

These labels require backend support and must not be added before the conflict API exists.

### 12.2 Prohibitions

- no silent overwrite
- no silent discard
- no automatic field merge for clinical narratives
- no generic `Sync error` without details
- no conflict dialog that hides the patient identity

---

## 13. Attachment queue target

Attachments are a later phase because they involve size, storage, connectivity, and privacy.

When implemented:

- validate file type and size before queuing
- show local preview carefully
- display `Waiting to upload`
- allow retry
- support resumable upload where practical
- preserve association with the correct patient/record
- avoid duplicate upload on retry
- do not claim upload success until server acknowledgement

Clinical images must not be compressed so aggressively that relevant detail is lost.

---

## 14. Authentication target

Offline authentication is security-sensitive and is not implied by PWA installability.

Before supporting offline sign-in or session continuation, define:

- allowed device types
- device sharing policy
- credential/token storage
- session expiry
- revocation behavior
- lost device response
- local data clearing
- role and permission freshness

Until reviewed, the UI must not promise that users can sign in offline.

---

## 15. Privacy and security requirements

Any offline implementation must address:

- Data Privacy Act obligations
- encryption at rest for sensitive local data
- browser storage inspection risk
- logout and account switching
- shared RHU devices
- cache expiry
- remote revocation limitations
- local database migration
- attachment privacy
- audit attribution
- backups and corruption recovery

Do not cache “everything” for convenience.

Store the minimum data required for the approved offline workflow.

---

## 16. Service worker and update UX target

When a new app version is available:

- do not force a reload while a form has unsaved or queued work
- show a quiet update notice
- allow `Update when safe`
- complete or preserve queued work before activating an incompatible version
- version local data schemas

Example:

`A MediSens update is ready. Finish or save your current work before updating.`

Actions:

- `Update later`
- `Update now` when safe

---

## 17. Error copy target

Use plain language.

### Network unavailable

`You're offline. This information is not available on this device yet.`

### Local save succeeded

`Saved on this device. It will sync when you're back online.`

### Sync failure

`This change couldn't sync. Your saved copy is still on this device.`

### Server rejected change

`MediSens could not accept this change because the record was updated elsewhere.`

Do not show raw HTTP, Supabase, IndexedDB, or service-worker errors to users.

---

## 18. Visual treatment

Offline and sync UI should preserve the approved MediSens visual direction:

- slim status bar or compact header indicator
- soft amber/offline tint
- concise icon and text
- white sync queue cards or rows on a light grey canvas
- subtle border and shadow
- no flashing, pulsing, or constant animation
- no large red full-page state unless data loss is imminent

The visual language should feel like part of the same compact operational dashboard, not a separate technical console.

---

## 19. Testing requirements

Before calling an offline capability complete, verify:

### Connectivity

- starts online, goes offline, reconnects
- unstable connection and repeated disconnects
- server unavailable while internet remains connected
- sync retry after app restart

### Data integrity

- no duplicate records after retry
- correct patient association
- correct user attribution
- queue persists after refresh and device restart
- failed items remain recoverable
- server acknowledgement clears the right queue item

### UX

- state labels remain accurate
- offline indicator is not color-only
- controls explain why they are unavailable
- no typed input lost
- drawer, dialogs, and forms remain keyboard accessible
- mobile keyboard does not cover status or save controls
- 200% zoom remains usable

### Security

- account switch does not expose another user’s queued data
- sign-out behavior matches policy
- cached data expires or clears as designed
- local data is not stored in plain localStorage when sensitive
- restricted data is not cached without approval

### Deployment

- service worker update does not corrupt queued data
- old and new schema versions migrate safely
- production environment uses the intended caching strategy

---

## 20. Implementation guardrail for agents

When a task says “make MediSens PWA-ready,” do not interpret it as permission to implement all offline behavior.

First produce:

1. current-state audit
2. capability matrix
3. risk list
4. phased plan
5. requested approval points

Only implement the explicitly approved phase.

*End of `PWA-OFFLINE-TARGET.md`.*
