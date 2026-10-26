Vault Gallery 0.1.1 addresses the automated review findings and keeps the existing gallery and filename editing features.

Requires Obsidian **1.7.2 or newer**. Licensed under **GNU GPL v3.0** (`GPL-3.0-only`); the license and corresponding source are included in the repository and source archives.

To install manually, place `main.js`, `manifest.json`, and `styles.css` in `<vault>/.obsidian/plugins/vault-gallery/`, reload Obsidian, and enable Vault Gallery. Existing installations can check for updates through their repository installer.

### Updates

- Correct the minimum Obsidian version for the workspace API.
- Fix direct style assignments and use CSS classes and properties for image zoom.
- Remove `!important` and `:has` CSS patterns.
- Use Obsidian element helpers and window timers.
- Type metadata snapshots and validate control characters without a regex range.
- Add official Obsidian lint checks to CI and the release build.
- Add GitHub provenance attestations for release assets.
- Limit downloadable release assets to `main.js`, `manifest.json`, and `styles.css`.
- Revise the README with product descriptions beneath screenshots and update notes at the end.
