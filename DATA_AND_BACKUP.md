# Database, backup, and privacy

INVOICER can store business records in the local `.invoicerdb` file or in the configured Supabase project. Cloud sync is disabled until a project is configured and the schema and migration are applied. Desktop builds can keep their local file as a cache; the browser build uses Supabase for online data.

## Backup and restore

- Open **Backup & restore** to create a separate backup or restore one.
- Keep backups somewhere separate from the active database, such as an external drive.
- Restoring replaces records in the connected database. Check the selected database and backup before restoring.
- Keep a local database file as a backup before enabling cloud sync.

## Data and privacy limits

- Cloud records are protected by company membership policies and version checks. If another device changes a record first, the later save reports a conflict rather than silently replacing it.
- The current compatibility layer still stores some related accounting records as app-level company records. It is a transition step, not the final normalized accounting write model; invoice numbering, audit history, and accounting backups need additional production review.
- Existing local accounts and `.invoicerdb` files are not automatically imported to a Supabase account. Keep the local file and perform a deliberate migration before relying on the cloud workspace.
- A local backup contains app records in the file. Store and share it with the same care as the original.
