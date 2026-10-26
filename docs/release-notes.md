Media Hub 0.3.2 adds direct Android saves and improves navigation with checked media.

**Download on Android** now copies the selected original files into a new folder inside **Documents/Media Hub**, rather than relying on browser download links. The dialog reports the exact destination and any failed files. Each download creates a new folder; duplicate names receive numbered suffixes. Older Android versions may ask for storage permission. If Obsidian does not expose the required native file bridge, the dialog reports that saving is unavailable.

The **Share** button and all sharing behavior have been removed. Desktop downloads still save individual original files, with no ZIP archive. Vault originals remain unchanged. This Android path has automated tests with a mocked native bridge; physical-device verification is still needed.

Preview navigation now accepts left/right keys while checkboxes have focus, keeps arrow-button focus, and avoids scrolling the preview again on every previous/next action. Checked files remain selected while browsing.

Requires Obsidian **1.7.2+**. Licensed under **GPL-3.0-only**.

[Buy me a coffee](https://buymeacoffee.com/sahandprs)

### Updates

- Direct Android copies to Documents/Media Hub with destination and failure reporting.
- Remove Share button and native sharing calls.
- Improve checked-media preview navigation and focus handling.
- Add permission, duplicate-name, partial-failure, and navigation regression tests.
