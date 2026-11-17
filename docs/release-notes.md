Media Hub 0.6.0 adds a read-only Immich library. Browse albums, search by filename, filter photos and videos, and open previews from the Media Hub sidebar.

Select media and choose **Insert into note** to add inline previews or links. Media Hub saves references without importing files or syncing the library. In-app video playback loads the selected clip into memory when you press Play; use **Open in Immich** to stream large clips in your browser.

To connect, open **Settings → Media Hub → Immich** and enter your server URL and an API key with `asset.read`, `asset.view`, and `album.read`. Choose **Test and connect**. The key is stored using Obsidian's SecretStorage and stays out of your notes and plugin data file.

Immich requires **Obsidian 1.11.4+**. The local vault gallery still supports **Obsidian 1.7.2+**.
