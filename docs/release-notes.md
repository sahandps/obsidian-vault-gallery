Media Hub 0.4.0 improves selection, video previews, personalization, and Android saving.

Switching media-type tabs now clears checkbox selection and closes the preview. **Select all** becomes **Deselect all** when all matching files are checked. The sidebar’s **All media** entry resets the type, folder, tag, and search filters.

Video cards display an early thumbnail frame when the codec is supported, without autoplay. Unsupported videos retain an icon fallback. **Gallery settings** now includes crop/fit, compact spacing, filename visibility, card-detail visibility, video thumbnails, and the default sort order for new views.

Android downloads now read bytes using Obsidian’s vault API and write them in chunks to a new folder under **Documents/Media Hub**. This avoids relying on native paths for vaults backed by content URIs. The download dialog shows progress, preserves error messages, times out unresponsive native calls, and verifies output size. The native bridge has an additional compatibility fallback. Automated tests pass; physical Android verification is still needed. Originals stay in the vault, with no ZIP and no Share button.

Requires Obsidian **1.7.2+**. Licensed under **GPL-3.0-only**.

[Buy me a coffee](https://buymeacoffee.com/sahandprs)

### Updates

- Tab switching overrides selection; Select all/Deselect all toggle.
- Video thumbnails with codec fallback and a settings toggle.
- Six additional personalization controls.
- Android vault-byte exports with chunked writes, progress, verification, and actionable errors.
