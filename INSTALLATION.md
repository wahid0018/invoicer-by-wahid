# Install on Windows

1. Open the [latest GitHub release](https://github.com/wahid0018/invoicer-by-wahid/releases/latest) and choose either **Web Setup** or **Setup**.
2. Run **Web Setup** for a small download that fetches the app package during installation. Choose **Setup** to download the full app in one file for offline installation.
3. Start **Invoicer Business Suite** from the Start menu or desktop shortcut.
4. For cloud mode, follow [Cloud setup](docs/CLOUD_SETUP.md) and sign in with your Supabase account. For local-only use, open or create a `.invoicerdb` file on the sign-in screen.

The app does not require a separate system-wide Node.js installation; Electron includes the runtime it uses.

Cloud-enabled desktop installers must be built with `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` set in the build environment. The public client key is safe to include in a browser app; never put a Supabase secret/service-role key in a desktop build.

## Updates

The app checks GitHub Releases for updates when it starts. You can also download and run a newer setup executable manually. Keep a separate backup of the database before updating.
