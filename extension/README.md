# Subscription Tracker Browser Extension

A Chrome extension to automatically track time spent on subscription service websites.

## Features

- Automatic time tracking on configured domains
- Visibility API integration (only tracks when page is active)
- User activity detection (pauses when idle)
- Offline support with event queuing
- Quick sync from popup
- Service-specific activity detection (video playback, etc.)

## Setup

### 1. Build the Extension

```bash
# From the extension directory
cd extension

# Install dependencies (if any)
bun install

# Build TypeScript files
bun build background.ts --outdir=. --target=browser
bun build content.ts --outdir=. --target=browser
bun build popup/popup.ts --outdir=popup --target=browser
```

### 2. Create Icons

The extension needs icons in the `icons/` folder:
- `icon16.png` (16x16)
- `icon48.png` (48x48)
- `icon128.png` (128x128)

You can create simple icons or use placeholder ones.

### 3. Load in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `extension` folder
5. The extension should now appear in your toolbar

### 4. Configure Domain Mappings

1. Open the main Subscription Manager app at `http://localhost:3000`
2. Go to the Integrations tab
3. Add domain mappings for your subscriptions
4. Click "Refresh Domains" in the extension popup to load the mappings

## How It Works

### Time Tracking

The extension tracks active time on pages using:
- **Tab focus events**: Detects when you switch tabs
- **Visibility API**: Pauses tracking when the page is hidden
- **User activity**: Detects mouse/keyboard activity and marks as idle after 1 minute of inactivity

### Event Syncing

- Events are batched and synced every 5 minutes
- If the main app is offline, events are queued locally
- You can manually sync from the popup

### Domain Mapping

The extension fetches domain mappings from the main app:
- Maps domains (e.g., `netflix.com`) to subscription IDs
- Supports automatic suggestions based on subscription names
- Can be configured in the web UI

## Development

### File Structure

```
extension/
├── manifest.json      # Chrome extension manifest
├── background.ts      # Service worker (event handling, sync)
├── content.ts         # Content script (page tracking)
├── popup/
│   ├── popup.html     # Popup UI
│   └── popup.ts       # Popup logic
├── icons/             # Extension icons
└── README.md          # This file
```

### Building

```bash
# Build all TypeScript files
bun build background.ts content.ts popup/popup.ts --outdir=. --target=browser
```

### Testing

1. Make changes to the TypeScript files
2. Rebuild with the command above
3. Go to `chrome://extensions/`
4. Click the refresh icon on the extension
5. Test your changes
