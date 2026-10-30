# App updates

The Windows app checks the public GitHub Releases page for `wahid0018/invoicer-by-wahid` when it starts. When an update is available, it downloads the update and offers to restart now or install it when the app next closes. You can also install an update manually from the [Releases page](https://github.com/wahid0018/invoicer-by-wahid/releases/latest).

Keep a separate backup of the `.invoicerdb` database before updating.

## Build Windows installers

The current build uses Node.js `26.12.1`, Electron `45.1.0`, and electron-builder `26.18.0`. Run `npm install` and then `npm run dist:win` from the application source workspace. The build creates both an offline Setup executable and a smaller Web Setup executable. The Web Setup also needs its matching `.nsis.7z` package beside it for offline distribution or uploaded as a release asset.

Electron includes its own Node.js runtime in the app, so the client computer does not need a separate Node.js installation.

## Publish a release

1. Increase `version` in `package.json` for each release.
2. Set `GH_TOKEN` in the build shell to a GitHub token with permission to publish releases in `wahid0018/invoicer-by-wahid`. Do not commit or package the token.
3. Run `npm run publish:win`. The build creates and uploads both installer types, the Web Setup package, and update metadata.
4. Confirm the release is published and contains both Setup executables, the `.nsis.7z` package, `latest.yml`, and blockmap metadata.

Keep releases public so installed apps can check them without a user-specific GitHub token. Do not replace a published release; publish a higher version number for each update.

## First updater-enabled release

Versions before `1.0.8` do not contain the updater. Install version `1.0.8` or later manually once; those versions can then receive automatic updates.
