# Media Hub

![Media gallery with folders and filters](docs/images/gallery.jpg)

Media Hub brings your vault's images, GIFs, videos, audio, and PDFs into one searchable media library. Browse by folder, filter by type or tag, and adjust the grid to see your media the way you prefer.

![Expanded preview with editable filename, tags, and description](docs/images/details.jpg)

Select any item for a larger preview and file details. Zoom into images, play video and audio, rename files, and add tags or descriptions without leaving the gallery. Tags stay attached when files are renamed while the plugin is running.

Screenshots use sample media in the browser preview. The plugin follows your Obsidian theme.

![Import destination and layout settings](docs/images/settings.jpg)

Choose a default folder for added media from the gallery's gear button or **Settings → Media Hub**. Pick an existing vault folder, enter a new folder path, or leave the path empty to use the vault root. The folder pane can be collapsed to give your media more room.

## Manual installation

Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/sahandps/obsidian-vault-gallery/releases/latest), place them in `<vault>/.obsidian/plugins/vault-gallery/`, reload Obsidian, and enable **Media Hub** under Community plugins.

## Build and install from source

1. Run `npm ci` and `npm run package` in this project (Node.js 22 or newer).
2. In your vault, create `.obsidian/plugins/vault-gallery/`.
3. Copy `main.js`, `manifest.json`, and `styles.css` from `release/vault-gallery/` into that folder.
4. Reload Obsidian. In **Settings → Community plugins**, enable **Media Hub**. Community plugins must be enabled.
5. Click the images icon in the left ribbon, or run **Media Hub: Open gallery** in the command palette.

Use a test vault for your first run. This plugin has automated tests but has not yet been verified inside a running Obsidian app.

## Features

- **Add media:** select one or several files to copy into your vault. The default import folder is `Media`; change it in **Settings → Media Hub** or with the gallery gear button. Nested folders are created on the first import. Existing files are preserved, and duplicate names get numbered suffixes such as `photo (1).png`. Originals remain where they are.
- **Collapsible folder pane:** use the panel button beside the title. The choice is saved across sessions.
- **Gallery settings:** choose an existing folder or enter a new vault-relative path, set thumbnail size, and control pane visibility. On Obsidian 1.13+, the settings are also searchable.

- Discovers media files already in the vault and updates after files are added, modified, renamed, moved, or deleted.
- Separate All media, Images, GIFs, Videos, Audio, and PDFs tabs.
- Folder filters include nested folders; “Vault root” shows files directly at the root.
- Search across paths, tags, and descriptions. Every search word must match.
- Tag filter and sorting by modified date, name, or file size.
- Adjustable thumbnail sizes, saved across sessions.
- Expanded image/GIF preview with zoom, and video/audio playback controls.
- Editable filename in the details panel: change the name and click **Rename file**, or press Enter. The extension and folder stay the same. Duplicate and invalid names are rejected. Obsidian manages updates to linked notes according to your vault settings. Gallery tags and unsaved detail edits stay attached when you rename from this panel.
- File path, format, size, file-system dates, image dimensions, or playback duration in the details panel.
- Editable comma-separated tags and descriptions. Click **Save details** before switching files. Tags are normalized to lowercase and duplicate tags are removed.
- Previous/next buttons and left/right arrow navigation; Escape closes the preview when outside a form or player.
- Opens the original file in a separate Obsidian tab. PDFs open in Obsidian's reader.
- Theme-aware styles and a stacked preview on narrow panels.

## Media and performance

Recognizes common image, video, audio, GIF, and PDF extensions, including HEIC, TIFF, AVI, and MKV. Recognition does **not** guarantee a preview: decoding depends on Obsidian and your device. Unsupported formats show a fallback. No transcoder, external service, or AI categorization is included.

To discover media, the gallery enumerates vault file paths locally; it does not upload file paths or media. It lists files exposed by Obsidian's Vault API, not hidden system folders or remote media embedded in notes. Images use browser lazy loading; videos and audio are loaded only in the selected preview. GIF thumbnails animate when loaded. The initial grid renders 80 items, then loads more as you scroll (with a manual button as fallback). The grid is incremental rather than fully virtualized; thumbnails are not pre-generated or cached separately, so very large original images can still use significant memory.

## Where tags are stored

Tags and descriptions are saved in `.obsidian/plugins/vault-gallery/data.json` using Obsidian's plugin storage. They do not modify embedded EXIF/IPTC metadata or appear in Obsidian's native tag search. File moves and renames observed while the plugin is running preserve the associated details, including folder moves. Moves made while the plugin is disabled cannot be reconciled automatically. Sync the plugin's `data.json` if you need these details on another device; plugin data is not merged across simultaneous edits on multiple devices.

The dates shown are file-system created/modified dates, not camera capture dates. Gallery details are saved explicitly and unsaved form edits are discarded when you change selection or close the preview.

## Development and checks

```sh
npm install
npm run dev      # rebuild main.js on changes
npm run lint     # official Obsidian guidelines and TypeScript lint checks
npm run build    # TypeScript check + production bundle
npm test         # model and DOM integration tests
npm run package  # installable folder under release/vault-gallery
```

The runtime uses only Obsidian's API and native browser elements, without Node APIs, to support desktop and mobile. Mobile behavior still requires device testing.

Before publishing: test in Obsidian with light/dark themes, a large vault, unavailable codecs, file sync, and mobile. This is an initial local version, not a published community plugin.

## Browser preview

Run `npm run preview`, then open **http://127.0.0.1:4173/**. This runs the production gallery view with an Obsidian adapter and a sample vault, served only on your computer. Try the folder/type/tag filters, image zoom, animated GIF, audio/video playback, and editable details. Sample illustrations, animation, audio, PDF, and video are generated locally; no external media requests are needed.

**Add media** lets you preview your own files in a simulated import folder for the current session; those files stay in the browser and are not uploaded. Tags and thumbnail size persist in browser local storage separately from Obsidian's plugin data. **Reset demo** clears the preview's saved details and reloads the sample vault. **Open in Obsidian** opens the original media in a browser tab in this preview. Renaming in the preview changes only its simulated vault, not the files on your disk, and lasts until you reload. Real vault discovery and file-change events require Obsidian.


## Releases and license

Copyright © 2026 Sahand (sahandps). Licensed under the [GNU General Public License v3.0](LICENSE) (`GPL-3.0-only`). Continuous integration builds the plugin and runs its tests. To publish a new version, update `package.json`, `manifest.json`, `versions.json`, and `docs/release-notes.md`, then push a matching numeric Git tag (for example, `0.1.1`). GitHub Actions builds and attaches `main.js`, `manifest.json`, and `styles.css` to the release for installation in Obsidian.


## Support

If Media Hub is useful to you, you can [buy me a coffee](https://buymeacoffee.com/sahandprs).

## Updates

### 0.2.0

- Add multi-file media import with configurable destination folders, progress, duplicate-name handling, and failure reporting.
- Add a collapsible folder pane with persistent visibility.
- Add Media Hub settings for the import folder, thumbnail size, and pane visibility, available in Obsidian settings and from the gallery gear button.
- Migrate saved settings while preserving existing tags and descriptions.
- Expand automated coverage for imports, destination validation, settings, and pane collapse.

### 0.1.3

- Rename the plugin to Media Hub to resolve the Media Gallery directory name conflict.
- Keep the internal plugin ID and existing data unchanged.
- Refresh the gallery branding and documentation.


### 0.1.2

- Rename the plugin's display name from Vault Gallery to Media Gallery.
- Keep the plugin ID, repository URL, and saved data unchanged for existing installations.
- Add the Buy Me a Coffee link to the plugin manifest, repository funding links, and this README.

### 0.1.1

- Require Obsidian 1.7.2, matching the workspace API used to open the gallery.
- Replace direct styles with CSS properties and classes; remove `!important` and `:has` selectors.
- Use Obsidian element helpers, window timers, typed metadata snapshots, and portable filename validation.
- Add official Obsidian lint checks to continuous integration.
- Attest release assets through GitHub and publish only `main.js`, `manifest.json`, and `styles.css`.
- Put product descriptions under the screenshots and simplify installation documentation.

### 0.1.0

- Initial gallery with folders, media filters, search, resizable thumbnails, previews, tags, descriptions, and filename editing.
