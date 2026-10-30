# Cloud and web deployment setup

The same renderer can run in a browser and inside the Electron desktop app. Supabase Auth identifies the user; company membership row-level security scopes cloud records. The web site is a static Netlify deploy from this GitHub repository.

## 1. Create the Supabase project

1. Create a Supabase project and save its **Project URL** and **Publishable key** (or legacy anon key).
2. Open **SQL Editor** in the project.
3. Run [`outputs/supabase_schema.sql`](../outputs/supabase_schema.sql) once.
4. Then run [`supabase/migrations/20261030_cloud_records.sql`](../supabase/migrations/20261030_cloud_records.sql).
5. In **Authentication → URL Configuration**, add the Netlify site URL to the allowed redirect URLs. If email confirmation is enabled, users must confirm their address before signing in.

Never use the Supabase secret or service-role key in this app. The browser and desktop app use only the publishable/anon key with RLS.

## 2. Connect GitHub to Netlify

1. In Netlify, create a site by importing the GitHub repository `wahid0018/invoicer-by-wahid`.
2. Keep the build command and publish directory from [`netlify.toml`](../netlify.toml): `pnpm run build:web` and `outputs`.
3. In the Netlify site’s environment variables, add:
   - `SUPABASE_URL` — the project URL.
   - `SUPABASE_PUBLISHABLE_KEY` — the project publishable key. `SUPABASE_ANON_KEY` is accepted for projects that still use the legacy anon key.
4. Trigger a deploy. Netlify builds the browser bundle and embeds only those public client settings. GitHub pushes to the connected branch then trigger redeploys.

The application can be opened locally without cloud settings, but `build:web` intentionally fails when either required cloud value is missing.

## 3. Configure a cloud-enabled desktop build

On the build computer, install Node.js **26.12.1 or newer** and pnpm, then set the same two public Supabase values before building:

```powershell
$env:SUPABASE_URL = "https://your-project.supabase.co"
$env:SUPABASE_PUBLISHABLE_KEY = "your-publishable-key"
pnpm install --frozen-lockfile
pnpm run dist:win
```

The generated installer includes the Supabase browser client and public project configuration. Each desktop user's authenticated session is stored by Supabase Auth, while the app can also use a local `.invoicerdb` file as a cache/backup.

## Current migration and sync limits

- Existing local usernames and `.invoicerdb` files are not automatically converted to Supabase Auth accounts or uploaded. Keep the files and plan the import before moving a business to cloud use.
- A compatibility table stores company-scoped app records and uses compare-and-swap versions to detect concurrent edits. It does not silently replace a newer cloud record, but conflicts need the user to reload before continuing.
- Invoice data is not yet written through the normalized invoice, invoice-line, and payment tables in the starter schema. Transactional invoice numbering, immutable issue history, billing plans, and protected admin functions still need their dedicated implementation before treating the system as a finalized accounting backend.
