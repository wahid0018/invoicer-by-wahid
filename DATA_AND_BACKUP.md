# Database, backup, and privacy

The installed prototype stores its local records in a single `.invoicerdb` JSON file selected by the administrator. The desktop app remembers the selected file path on that Windows computer and saves changes to it.

## Backup and restore

- Use **Data & Backup → Database backup & restore** to save a dated backup.
- Store a backup somewhere separate from the active database, such as an external drive.
- Restore replaces records in the currently connected database. Confirm the selection before restoring.
- Test that a backup can be opened before relying on it.

## Important limitations

- Database contents are not encrypted by this prototype. Protect the Windows account and database file.
- Do not open one database file for concurrent editing from multiple computers.
- The local database does not synchronize with Supabase or another cloud service.
- A backup contains the app records in the database. Store and share it with the same care as the original.
