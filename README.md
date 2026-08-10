# MEDISENS

**MEDISENS** is a secure, role-based Healthcare Information System and Electronic Medical Record (EMR) prototype designed for the Malvar Rural Health Unit (RHU).

It supports digital patient records, clinical consultations, initial intake, laboratory requests, pharmacy dispensing, census reporting, patient history tracking, healthcare analytics, audit logging, and soft archiving of inactive patient records.

The project was developed as an academic capstone system to help improve manual RHU workflows through a responsive, healthcare-focused, and role-based web application.

---

## Overview

Many Rural Health Unit processes remain paper-based, which can result in:

- Slow patient record retrieval
- Duplicate patient entries
- Difficult monthly and annual report preparation
- Fragmented patient histories
- Increased risk of misplaced or lost records
- Limited visibility into RHU workload and healthcare trends

MEDISENS aims to address these issues through:

- Digital patient records
- Role-based access control
- Patient consultation workflow support
- Initial consultation and vital signs recording
- Laboratory request and result management
- E-prescription and pharmacy dispensing workflows
- Midwife census, maternal care, vaccination, and reporting support
- Patient history and transaction tracking
- RHU analytics and performance monitoring
- Read-only audit logging for accountability
- Soft archiving of inactive patient records
- Privacy notices aligned with the Philippine Data Privacy Act of 2012
- Responsive and Progressive Web App-ready interfaces
- Content-shaped loading states for improved perceived performance

---

## User Roles

MEDISENS supports the following role-based users:

- Admin
- Barangay Health Worker
- Nurse
- Doctor
- Laboratory Personnel
- Pharmacist
- Midwife

Each role only has access to its approved modules, actions, and workflows based on the system’s configured permissions and use case design.

---

## Core Features

### Patient Records

- Patient registration and profile management
- Patient information preview
- Patient history access
- Consultation and initial consultation tracking
- Laboratory request and result history
- Prescription and dispensing history
- Vaccination and follow-up tracking
- Doctor-only consultation actions where applicable
- Active and archived patient record handling
- Transaction history with non-blocking background refresh states

### Doctor Module

- Patient Records access
- Consultation Room workflow
- Consultation record creation and updates
- Patient history access during consultation
- Follow-up handling
- Audit Log access
- Archive Review visibility where authorized
- Healthcare analytics access where authorized

### Nurse Module

- Initial consultation workflow
- Vital signs recording
- Patient assessment recording
- Patient Records access
- Initial intake queue support

### Laboratory Module

- Requested laboratory test viewing
- Laboratory result and finding management
- Status-based laboratory workflow
- Slide-out patient laboratory detail panel
- Patient and request history visibility

### Pharmacist Module

- Prescription viewing
- Prescription dispensing workflow
- Patient information preview
- Dispensing status handling
- E-prescription history

### Midwife Module

- Census Entry
- Maternal care validation
- Male patient restrictions for Maternal Care entries
- Vaccination support
- Follow-up support
- FHSIS and report generation features
- Midwife record management

### Barangay Health Worker Module

- Patient registration support
- Patient Records access
- Barangay-level patient workflow support
- Patient information collection and verification

### Admin Module

- User management
- Secure account creation
- Audit Log access
- Archive Review workspace
- System oversight
- Role and account management

---

## RHU Analytics

MEDISENS includes an analytics and performance dashboard designed to help authorized RHU personnel review operational and healthcare-related information.

Current analytics capabilities include:

- Summary KPI cards
- Patient and consultation trends
- Laboratory and pharmacy activity
- Role or module activity indicators
- Date and filter-based analysis
- Aggregated database metrics
- Responsive dashboard layouts
- Non-blocking filter and background refresh states

Analytics data is retrieved through controlled database queries and RPC-based aggregation where applicable.

The dashboard follows the MEDISENS UI standards defined in `UI-SKILL.md`.

---

## Loading and Refresh Experience

MEDISENS uses shared clinical skeleton components to improve perceived performance and reduce layout shifting.

### Initial Loading

Initial data loads use content-shaped skeletons that match the final layout of:

- KPI cards
- Tables
- Lists
- Forms
- Patient panels
- History sections
- Dashboard widgets

### Background Updates

During refetches, filters, and tab changes:

- Existing content remains visible
- Filters and active tabs are preserved
- Scroll position is not intentionally reset
- A subtle inline updating indicator is displayed
- The entire page is not unnecessarily blanked or reloaded

Skeleton animations also respect reduced-motion accessibility preferences.

---

## Audit Log

MEDISENS includes a read-only audit trail available to authorized Admin and Doctor users.

The Audit Log tracks important system actions such as:

- Login and logout activity
- Patient creation and updates
- Consultation actions
- Laboratory actions
- Pharmacy and dispensing actions
- Report generation
- Archive and restore activity
- Other sensitive workflow events

Audit records are inserted through a Supabase Edge Function.

Users cannot edit or delete audit entries through the application.

Sensitive clinical information is not intentionally stored inside audit metadata.

---

## Patient Record Archiving

MEDISENS uses soft archiving for inactive patient records.

Patient records are not physically moved or deleted from the database.

The archiving workflow:

- Preserves existing patient relationships
- Preserves consultation and clinical history
- Supports Archive Review
- Requires reasons for archive and restore actions
- Records archive events through `patient_archive_events`
- Integrates with the Audit Log
- Uses a Supabase Edge Function for protected archive and restore operations

---

## Responsive Login Experience

The MEDISENS login page provides:

- Responsive desktop and mobile layouts
- Compact mobile-first sign-in experience
- Clear RHU branding
- Role-based access messaging
- Data privacy notice
- Accessible input and button touch targets
- Security and trust indicators
- Preserved authentication and validation behavior

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vite, React, TypeScript |
| Styling | CSS, custom design system, reusable UI components |
| Backend and Database | Supabase and PostgreSQL |
| Authentication | Supabase Auth |
| Serverless Functions | Supabase Edge Functions |
| Database Changes | Supabase SQL migrations |
| Version Control | Git and GitHub |

---

## Project Structure

```text
MEDISENS/
├── pages/
├── src/
│   ├── app/
│   ├── assets/
│   ├── components/
│   ├── design-system/
│   ├── features/
│   ├── hooks/
│   ├── lib/
│   ├── styles/
│   └── types/
├── supabase/
│   ├── functions/
│   └── migrations/
├── docs/
├── README.md
├── UI-SKILL.md
├── DESIGN_SYSTEM.md
├── UPDATE.md
├── package.json
└── vite.config.ts
```

The `supabase/migrations/` directory contains database schema and function changes and should remain tracked in Git.

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/Pa-keys/thesis-templates.git
cd thesis-templates
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Create the Environment File

Create a `.env` file in the project root.

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Do not commit real API keys, service-role keys, access tokens, or credentials.

### 4. Run the Development Server

```bash
npm run dev
```

### 5. Build the Project

```bash
npm run build
```

---

## Supabase Migrations

Database changes are stored inside:

```text
supabase/migrations/
```

Migrations may include:

- Analytics aggregation functions
- RPC updates
- Access-control changes
- Database function corrections
- Schema changes
- Policy and permission updates

Migrations should be reviewed and committed to Git so database changes can be reproduced across development, staging, and production environments.

---

## Supabase Edge Functions

MEDISENS uses Supabase Edge Functions for privileged and sensitive server-side operations.

Current functions include:

- `create-user` — secure Admin-created user accounts
- `create-audit-log` — secure audit log insertion
- `archive-patient-record` — protected patient archive and restore actions

Deploy the functions using:

```bash
npx supabase functions deploy create-user
npx supabase functions deploy create-audit-log
npx supabase functions deploy archive-patient-record
```

Set the required Supabase secrets:

```bash
npx supabase secrets set PROJECT_URL="your_project_url"
npx supabase secrets set ANON_KEY="your_anon_key"
npx supabase secrets set SERVICE_ROLE_KEY="your_service_role_key"
```

Never expose the service-role key in frontend code.

---

## Data Privacy Notice

MEDISENS handles personal and health information in accordance with the Philippine Data Privacy Act of 2012, or Republic Act No. 10173.

Patient information must only be collected, accessed, stored, and processed for authorized RHU healthcare purposes.

User activity may be logged for:

- Accountability
- Security
- System monitoring
- Investigation of unauthorized activity

---

## Security and Access Control

MEDISENS currently incorporates the following security measures:

- Role-based module visibility
- Role-based workflow restrictions
- Supabase authentication
- Administrator-controlled account creation
- Read-only Audit Log access
- Server-side audit log insertion
- Server-side archive and restore protection
- User-friendly error messages
- Reduced exposure of raw technical errors
- Soft archiving instead of destructive record deletion
- Environment-based frontend configuration
- Database migrations for controlled schema changes

UI-level role visibility is not treated as the only security boundary.

Authorization must also be enforced through:

- Server-side validation
- Supabase Row Level Security
- RPC permissions
- Database policies
- Protected Edge Functions

---

## Development Standards

The project uses the following documentation and standards:

- `README.md` — project overview and setup
- `UI-SKILL.md` — reusable MEDISENS UI/UX standards
- `DESIGN_SYSTEM.md` — visual system and component direction
- `UPDATE.md` — implementation and change tracking
- `SECURITY_ROADMAP.md` — planned security hardening
- `ARCHIVING_ROADMAP.md` — patient record archiving plan
- `ANALYTICS_ROADMAP.md` — analytics development plan

Before committing changes, run:

```bash
npm run build
git diff --check
git status
```

Recommended commit workflow:

```bash
git add .
git commit -m "your commit message"
git push origin your-branch-name
```

---

## Current Development Status

Recent major improvements include:

- Healthcare-oriented UI/UX refinement
- Responsive desktop and mobile login experience
- RHU Analytics and Performance Dashboard
- Analytics aggregation and RPC migrations
- Read-only Audit Log for authorized users
- Patient history and transaction improvements
- System-wide content-shaped skeleton loading
- Non-blocking background refresh states
- Safer error handling
- UTF-8 content cleanup
- Soft patient record archiving
- Archive Review workspace
- Supabase Edge Functions for sensitive operations
- Data Privacy Act notices
- Role-based UI consistency improvements

---

## Remaining Deployment Work

Before production deployment, the remaining recommended work includes:

### Offline and Network Support

- Define the offline and online synchronization architecture
- Add controlled local data storage where appropriate
- Implement pending-sync and conflict states
- Prevent silent overwriting of newer clinical information
- Provide manual or foreground sync fallback
- Validate queued operations again on the server

### Database Protection

- Prevent abusive or unnecessarily expensive queries
- Add pagination and safe result limits
- Review database indexes
- Debounce repeated searches
- Prevent duplicate submissions
- Review Realtime subscriptions and connection usage

### Rate Limiting

- Add request limits for sensitive or expensive actions
- Protect public and unauthenticated endpoints
- Add abuse protection for repeated login and form attempts
- Apply user-based or IP-based throttling where appropriate

### Authorization Hardening

- Complete the final Row Level Security review
- Review RPC execution permissions
- Review `SECURITY DEFINER` functions
- Verify server-side authorization for every protected action
- Test direct database and API access outside the UI

### General Security Hardening

- Review Content Security Policy and security headers
- Review file upload restrictions
- Validate and sanitize all user-controlled input
- Review environment secrets
- Perform dependency and vulnerability scanning
- Conduct penetration testing
- Configure monitoring, backups, and incident recovery

### Final Deployment Validation

- Complete authenticated browser QA for every role
- Complete `last_activity_at` instrumentation
- Test Vercel staging deployment
- Test production Supabase configuration
- Verify migrations in a clean environment
- Validate Edge Function secrets and permissions
- Conduct final role and workflow regression testing

---

## Academic Context

MEDISENS was developed as an undergraduate capstone project to demonstrate how a digital Healthcare Information System can improve:

- Patient record management
- Clinical workflows
- Reporting
- Accountability
- Healthcare data visibility
- Rural Health Unit operations

Although MEDISENS has been designed with security, usability, and healthcare practices in mind, additional security review, penetration testing, infrastructure hardening, and real-world validation are required before deployment in an actual production healthcare environment.

---

## Contributors

- Ivan Joseph V. Jaurigue
- Mark Jerome R. Kinchasan
- Jan Ernest Pacey P. Nario

---

## License

This project is intended for academic and research purposes only.

Unauthorized commercial use, redistribution, or deployment in a production healthcare environment without appropriate authorization, validation, and security assessment is not recommended.
