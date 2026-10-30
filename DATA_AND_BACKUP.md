# Database, backup, and privacy

INVOICER stores business records in a local `.invoicerdb` file selected in the app. The Windows app remembers the selected file path on that computer and saves changes to the file. Database contents are not encrypted, so protect the file and the Windows account that can access it.

## Backup and restore

- Open **Backup & restore** to create a separate backup or restore one.
- Keep backups somewhere separate from the active database, such as an external drive.
- Restoring replaces records in the connected database. Check the selected database and backup before restoring.
- Do not edit the same database file concurrently from multiple computers.

## Data and privacy limits

- The local database does not sync with Supabase or another cloud service.
- A backup contains the app records in the database. Store and share it with the same care as the original.
