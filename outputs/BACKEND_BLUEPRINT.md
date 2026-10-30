# Invoicer: app and backend blueprint

## Current implementation

- `index.html` is the shared browser/Electron renderer. `database.js` supports a local `.invoicerdb` file for local use and desktop cache/backup.
- With `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (or `SUPABASE_ANON_KEY`) configured at build time, `cloud-client.mjs` adds Supabase Auth and company-scoped cloud records. RLS scopes rows through `company_members`; compare-and-swap versions surface concurrent edits instead of silently overwriting them.
- `supabase_schema.sql` defines the account, company, master, invoice and payment tables. `supabase/migrations/20261030_cloud_records.sql` adds the current app compatibility store and first-company bootstrap. `netlify.toml` builds the browser version from this repository.

This sync bridge is a migration step, not the final accounting backend. The current invoice UI still stores related records as company-scoped JSON values instead of issuing invoices through the normalized invoice tables and transactional numbering RPC. Existing local accounts and `.invoicerdb` files are not automatically imported. The app does not yet provide finalized GST compliance or a complete protected licensing/admin service.

The browser prototype now includes a local demonstration of user signup/login, a separate administrator login and panel, email-bound monthly/yearly/lifetime license keys, key redemption, password reset, the two-invoice free allowance, and switching between companies. Two companies are included by default; requesting more records an upgrade request for the administrator, and an issued license can raise the account's company limit. Browser records are namespaced by user ID and company ID, and each company has its own appearance settings. These local controls demonstrate the intended flows only: a device owner can inspect or edit browser storage, so they do not provide production authentication, licensing enforcement or complete privacy. The requested administrator credential is represented by a password hash in the prototype, but it must not be reused as a production credential.

## Recommended deployment

```text
Browser (Netlify static site) ──┐
                                ├── Supabase Auth + Postgres RLS (shared cloud records)
Windows desktop (Electron) ─────┘
        └── optional per-device .invoicerdb cache / backup
```

The same renderer is used by the web and Electron clients. The public Supabase publishable/anon key is not a secret; RLS is the access boundary. Never put a Supabase secret/service-role key in Netlify client output or a desktop installer. The local JSON file is not encrypted and should be protected as sensitive business data.

## Data ownership and privacy

`auth.users` is the login identity; `profiles` carries display/contact fields. A user can own up to two companies, with company membership and roles scoped to each company. All accounting records carry `company_id`. RLS checks company membership on every query, including Storage object paths. The server must validate cross-table company ownership in RPCs as well; UI filtering is not a privacy boundary.

The free-plan two-invoice allowance, company cap, subscription dates, admin actions and license redemption must be enforced in trusted server transactions, not client code. Admin capabilities belong in authenticated Edge Functions with role checks and an audit log. Create the initial administrator through a one-time server-side bootstrap process, require a password reset/MFA, and never ship the supplied password as a default in source code or a desktop installer. Send password resets through Supabase Auth rather than allowing an administrator to view or set a user's existing password.

License keys should be generated from a cryptographically random secret, shown once, stored as a hash, bound to an email and plan, and redeemed once by a server endpoint. Plans include monthly, annual and lifetime. Subscription expiry and invoice quota should be checked by the same transaction that issues an invoice. Renewal/offline grace policy needs an explicit product decision; offline mode can continue local drafts, while issuing beyond a cached entitlement limit should be blocked or visibly queued according to that policy.

## Offline behavior and conflict handling

1. On sign-in, download only the user's companies and records permitted by RLS into that user's encrypted SQLite file.
2. Save every create/edit/delete locally in one SQLite transaction and append an outbox mutation with a stable UUID, entity ID, base version and timestamp. The user can keep drafting and printing previously issued invoices offline.
3. On reconnect, submit mutations in order through authenticated RPCs. RPCs validate access, plan/quota, references, invoice numbering and tax totals, then acknowledge the mutation UUID. Unique mutation IDs make retries safe.
4. Keep issued invoices immutable in accounting fields. Corrections use a revision/credit-note workflow; payment entries are append-only. Concurrent changes to editable masters can use last-write-wins with a visible conflict history; invoice-number allocation is server-owned and transactional.
5. Keep pending offline invoice drafts local until the server assigns their final legal invoice number. Printing an offline draft must clearly identify its draft status. Establish how invoice dates/sequences behave during prolonged disconnection with the accountant before release.

Do not rely on a simplistic whole-database last-write-wins sync. It can silently overwrite a posted invoice or allocate duplicate invoice numbers.

## Business areas covered by the schema

- Company profile, state code, bank/UPI details, per-company print/theme settings and numbering.
- Per-company users and roles; user-level plan/entitlement and hashed license keys.
- Parties, GST identity/type, credit limits, agents, shipping addresses, transports, units, items, barcodes and party-specific last rates.
- Invoice headers with frozen billing/shipping snapshots, tax buckets, expenses, roundoff, transport/e-waybill fields, item lines and version/mutation metadata.
- Payment and agent-commission ledgers to derive due balances instead of overwriting a single paid amount.
- Sync mutation idempotency foundation.

## Invoice calculation contract

Keep a pure, versioned calculation module shared by desktop and server, with the server recalculating the authoritative totals at issue time. In general, place-of-supply and supplier state determine whether tax is split into central/state components or integrated tax; the app must handle exceptions and amendments according to current rules. Preserve item HSN/SAC, tax rate, place of supply, tax components, discount and expense allocation on each issued invoice. Store money as decimal/numeric, never binary floating-point. Build print templates for A4/A5/A6 and copies (customer, office, transport, agent, packing slip) as independent layouts driven by the saved invoice snapshot.

GSTIN checksum/shape validation works offline only as a format check; it cannot establish that a GST registration is currently active or that the taxpayer details match. GSTR-1 and E-way bill exports need current official schemas, mandatory-field rules, representative fixtures, accountant review and ongoing compatibility checks. Verify current requirements with the official GSTN/E-way bill materials before enabling regulatory exports.

## Backups, restore and 100-user scale

- Desktop: provide a consistent SQLite backup (SQLite online backup API), encrypt it, include schema version and checksum, and validate before replacing the live database. Restore must first keep a recoverable copy of the current file.
- Cloud: Supabase/Postgres managed backups and point-in-time recovery depend on the chosen plan/configuration. Add scheduled encrypted logical exports to separate storage for portability; verify restore drills and retention. A browser feature must not claim to back up the whole Supabase database when it only exports one user's company records.
- Store company logos in private object storage and include references in database backups; use signed URLs and RLS-scoped paths.
- 100 users is modest for Postgres. Add pagination, indexes for company/date/party, connection pooling through Supabase, per-tenant storage paths, rate limits for auth and exports, and monitoring for sync backlog and backup/restore health.

## Implementation order

1. Supabase project, migrations, state-code fixture table, signup/profile bootstrap, company creation and reviewed RLS tests.
2. Auth flow, password recovery, admin portal and auditable license/plan endpoints. Rotate the sample admin credential before any deployment.
3. Company setup and masters, with complete CRUD and same-company foreign-key validation.
4. Invoice calculation library, transactional issue-number RPC, print templates, immutable invoice revisions, payment/commission ledgers.
5. SQLite local store, durable outbox, offline drafts, sync conflict UI, encrypted backup/restore.
6. GSTR-1/E-way bill exports against current official schemas and accountant-approved acceptance fixtures.
7. Windows installer signing, update/rollback plan, security review, backup restore drill and release checks.

## Production blockers in the starter schema

Before running against production, add tightly scoped write policies by membership role, composite foreign keys to prevent cross-company references, audited admin/license Edge Functions, transactional company/invoice RPCs, backup scheduling, storage policies, rate limits, logs/retention rules and migration/restore exercises. Review every RLS policy with tests using at least two unrelated accounts. The demo front end and supplied defaults are not production security controls.
