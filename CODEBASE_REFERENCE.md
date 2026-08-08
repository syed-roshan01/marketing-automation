# Zyqora — Complete Codebase Reference

> Single-document reference for the full Zyqora desktop application.
> Covers architecture, boot flow, data layer, all services, routes, frontend, and utilities.

---

## 1. Product Overview

**Zyqora** is a Windows/Mac desktop application built with:
- **Electron** — desktop shell (main.js, preload.js)
- **Express + Socket.io** — local HTTP/WS server running inside Electron
- **Vite + React** — renderer (frontend UI)
- **Baileys (WhatsApp Web API)** — WhatsApp connectivity via `@fadzzzslebew/baileys` fork

Primary use case: WhatsApp bulk messaging automation, live chat, chatbot flows, auto-reply, cart recovery (Shopify/WooCommerce), and AI-powered lead capturing — all from a local desktop app without cloud dependency.

---

## 2. Project Structure

```
zyqora/
├── electron/
│   ├── main.js          — Electron entry point, window creation, IPC handlers
│   └── preload.js       — Electron preload (contextBridge)
├── renderer/
│   ├── index.html       — Vite HTML entry
│   ├── public/          — Static assets (logos, icons)
│   └── src/
│       ├── main.jsx     — React entry, wraps AppProvider
│       ├── App.jsx      — Root router, splash screen, license gate
│       ├── api.js       — All frontend → backend HTTP calls
│       ├── socket.js    — Socket.io client instance
│       ├── index.css    — Global design system CSS
│       ├── contexts/
│       │   └── AppContext.jsx   — Global state: license, toast, confirms, campaignUpdates
│       ├── components/
│       │   ├── Sidebar.jsx      — Navigation sidebar
│       │   ├── Topbar.jsx       — Top bar with page title
│       │   ├── Toast.jsx        — Toast notification
│       │   ├── Modal.jsx        — Generic modal
│       │   ├── MobileModal.jsx  — Mobile-specific modal
│       │   ├── ConfirmDialog.jsx — Confirm/cancel dialog
│       │   └── integrations/    — Cart recovery / abandoned cart UI components
│       └── pages/
│           ├── Dashboard.jsx
│           ├── Devices.jsx
│           ├── Templates.jsx
│           ├── Campaigns.jsx
│           ├── LiveChat.jsx
│           ├── Integrations.jsx
│           ├── ShopifyIntegration.jsx
│           ├── WooCommerceIntegration.jsx
│           ├── IntegrationManagement.jsx
│           ├── Settings.jsx
│           ├── LicenseGate.jsx
│           ├── LicensePortal.jsx  (/zyq route)
│           ├── Contacts.jsx
│           ├── Groups.jsx
│           ├── AutoReply.jsx
│           ├── ChatbotFlows.jsx
│           ├── SingleMessage.jsx
│           ├── Campaigns.jsx
│           ├── OptOutManagement.jsx
│           ├── TrustBuilder.jsx
│           ├── GroupGrabber.jsx
│           ├── AIAutomation.jsx
│           ├── FeatureLocked.jsx
│           └── Login.jsx
├── server/
│   ├── index.js         — Express + Socket.io boot, all route mounts
│   ├── socket.js        — Socket.io singleton (init/get/emit)
│   ├── license.js       — License engine wrapper (dev source / prod bytecode)
│   ├── constants.js     — DATA_ROOT, IMAGES_DIR, MEDIA_DIR, LICENSE_FILE paths
│   ├── constants/
│   │   └── aiTemplates.js
│   ├── middleware/
│   │   ├── requireLicense.js    — Loads .jsc in prod, _requireLicense.js in dev
│   │   ├── _requireLicense.js   — Actual license guard middleware
│   │   ├── requireFeature.js    — Feature flag middleware
│   │   └── _requireFeature.js   — Actual feature guard
│   ├── routes/
│   │   ├── _license.js          — License activate/status (source, dev only)
│   │   ├── license.js           — Bytecode loader wrapper
│   │   ├── settings.js          — Settings, daily stats, hook numbers, data management
│   │   ├── templates.js         — Template CRUD + image/media uploads
│   │   ├── campaigns.js         — Campaign CRUD + cart-recovery campaign creation
│   │   ├── contacts.js          — Contact CRUD + CSV import
│   │   ├── devices.js           — Device CRUD + QR code endpoint
│   │   ├── groups.js            — Group CRUD
│   │   ├── backup.js            — Export/import backup
│   │   ├── liveChat.js          — Live chat conversations CRUD + send
│   │   ├── integrations.js      — Shopify/WooCommerce config, webhooks, public URL tunnel
│   │   ├── cartRecovery.js      — Cart recovery entries + stats
│   │   ├── mobile.js            — Mobile device endpoints
│   │   ├── autoReply.js         — Auto-reply rules CRUD
│   │   ├── chatbot.js           — Chatbot flows CRUD
│   │   ├── optout.js            — Opt-out records + settings
│   │   ├── singleSend.js        — Single message send
│   │   ├── trustBuilder.js      — Trust builder sessions
│   │   ├── groupGrabber.js      — Group grabber
│   │   ├── aiAutomation.js      — AI assistant CRUD + conversation history
│   │   └── templates.js
│   ├── services/
│   │   ├── campaignService.js     — Campaign send/pause background loop
│   │   ├── autoReplyEngine.js     — Auto-reply on incoming messages
│   │   ├── chatbotEngine.js       — Chatbot keyword flows on incoming messages
│   │   ├── liveChatEngine.js      — Live chat record creation on incoming messages
│   │   ├── cartRecoveryEngine.js  — Cart recovery follow-up scheduler
│   │   ├── hookEngine.js          — Forward messages to hook numbers
│   │   ├── optoutEngine.js        — Handle SUBSCRIBE/UNSUBSCRIBE keywords
│   │   └── aiAutomationEngine.js  — AI chatbot with lead capturing
│   └── utils/
│       ├── dailyStats.js   — In-memory + persisted daily send counter
│       ├── phone.js        — normalizePhone()
│       ├── text.js         — personalizeText(), applyVariables(), spintax
│       └── upload.js       — multer upload configs (images, media, CSV)
├── src/
│   ├── whatsapp.js        — WhatsAppManager class (Baileys wrapper)
│   ├── deviceManager.js   — DeviceManager singleton (EventEmitter)
│   ├── storage.js         — All JSON file read/write helpers
│   ├── licenseEngine.js   — License HMAC + online validation (compiled to .jsc)
│   └── licenseEngine.jsc  — V8 bytecode (production)
├── public/
│   └── index.html         — Production SPA shell
├── scripts/
│   ├── compile-license.js — Compiles licenseEngine.js → .jsc
│   ├── pack-asar.js       — Post-sign ASAR packer with honeypot injection
│   └── test-honeypot.js
├── data/                  — Auto-created at runtime (JSON data files)
├── package.json
└── vite.config.mjs
```

---

## 3. Boot Sequence

### 3.1 Development (`npm run dev`)
```
concurrently:
  node server/index.js   →  Express on :3000
  vite                   →  Vite dev server on :5173  (proxies /api and /socket.io → :3000)
```
Frontend at **http://localhost:5173** — API calls proxied to Express.

### 3.2 Production / Electron (`npm run electron`)
```
electron/main.js
  ├── Sets ZYQORA_DATA = app.getPath('userData')
  ├── require('../server/index.js')   ← starts Express on :3000
  └── createWindow()  →  BrowserWindow loads http://localhost:3000
```
Full app runs as a single Electron process. The React SPA is served from `public/` as static files by Express.

### 3.3 Electron Details (`electron/main.js`)
- **Keep-Awake**: `powerSaveBlocker` via IPC `set-keep-awake`. Restored on boot from saved settings.
- **`ZYQORA_DATA`**: Set to `app.getPath('userData')` in production so user data survives app updates.
- **`CLOUDFLARED_BIN`**: Overrides cloudflared binary path to `.unpacked/` so it can be spawned from outside ASAR.
- **Single instance lock**: `app.requestSingleInstanceLock()` — second launch focuses existing window.
- **Menu**: `Menu.setApplicationMenu(null)` — no native menu bar.
- **Retry loader**: `loadWithRetry()` polls the URL every 800ms for up to 20 retries (handles slow server boot).
- **Boot delay**: `setTimeout(createWindow, 1200)` gives server time to start before window opens.

---

## 4. Data Layer — `src/storage.js`

### Location
```
process.env.ZYQORA_DATA  ||  data/   (relative to project root)
```
In production Electron: `%APPDATA%\zyqora\`

### Data Files
| File | Key | Default |
|------|-----|---------|
| `contacts.json` | contacts | `[]` |
| `templates.json` | templates | `[]` |
| `campaigns.json` | campaigns | `[]` |
| `settings.json` | settings | See SETTINGS_DEFAULT |
| `groups.json` | groups | `[]` |
| `devices.json` | devices | `[]` |
| `trust_builder.json` | trustBuilder sessions | `[]` |
| `optout.json` | opt-out records | `[]` |
| `optout_settings.json` | opt-out messages | See defaults |
| `auto_reply.json` | auto-reply rules | `[]` |
| `auto_reply_log.json` | last-fired timestamps | `{}` |
| `chatbot_flows.json` | chatbot flows | `[]` |
| `chatbot_log.json` | chatbot last-fired | `{}` |
| `live_chats.json` | live chat conversations | `[]` |
| `hook_numbers.json` | hook/forward numbers | `[]` |
| `ai_assistants.json` | AI assistant configs | `[]` |
| `ai_conversations.json` | AI conversation history | `[]` |
| `ai_records.json` | AI lead capture records | `[]` |
| `integrations.json` | Shopify/WooCommerce config | See INTEGRATIONS_DEFAULT |
| `cart_recovery.json` | cart recovery entries | `[]` |
| `daily-stats.json` | today's send count | `{ date, count }` |
| `license.json` | license key + machine ID | — |
| `auth_info/<deviceId>/` | Baileys WA session files | — |
| `images/` | uploaded template images/media | — |
| `media/` | uploaded template media | — |

### SETTINGS_DEFAULT
```js
{
  minDelay: 20,          // seconds between messages (minimum enforced)
  maxDelay: 35,          // seconds (random upper bound)
  batchSize: 15,         // messages before batch pause
  batchPauseMin: 180,    // seconds (3 min)
  batchPauseMax: 300,    // seconds (5 min)
  dailyLimit: 50,        // max messages per day
  delayEnabled: true,
  batchEnabled: true,
  dailyLimitEnabled: true,
  typingEnabled: true,   // show typing indicator
  typingMin: 3,          // seconds
  typingMax: 7,
}
```

### Key storage functions
```js
getContacts()           saveContacts(contacts)
getTemplates()          saveTemplates(templates)
getCampaigns()          saveCampaigns(campaigns)
getSettings()           saveSettings(settings)     ← merged with defaults
getGroups()             saveGroups(groups)
getDevices()            saveDevices(devices)
getOptoutRecords()      saveOptoutRecords(records)
getOptoutSettings()     saveOptoutSettings(settings)
getAutoReplyRules()     saveAutoReplyRules(rules)
getAutoReplyLog()       saveAutoReplyLog(log)
getChatbotFlows()       saveChatbotFlows(flows)
getChatbotLog()         saveChatbotLog(log)
getLiveChats()          saveLiveChats(chats)
getHookNumbers()        saveHookNumbers(hooks)
getAIAssistants()       saveAIAssistants(assistants)
getAIConversations()    saveAIConversations(conversations)
getAIRecords()          saveAIRecords(records)
getIntegrationsConfig() saveIntegrationsConfig(config)  ← deep-merged with defaults
getCartRecoveryEntries() saveCartRecoveryEntries(entries)
```
All exports also include `DATA_DIR` and `FILES` map.

---

## 5. License System

### Flow
```
Frontend boot
  → GET /api/license/status
      → getLicenseData() reads license.json
      → validateOnline(key, machineId) → POST to admin panel
      → returns { valid, machineId, expiry, daysLeft, deviceLimit, isLifetime, plan, features }
  → If valid: show app
  → If invalid: show LicenseGate
```

### Files
| File | Role |
|------|------|
| `server/routes/_license.js` | Express router: `GET /status`, `POST /activate` |
| `server/routes/license.js` | Bytecode loader (loads `.jsc` in Electron, `_license.js` in dev) |
| `server/license.js` | Thin wrapper exporting `getMachineId`, `getLicenseData`, `saveLicenseData`, `validateOnline`, `isLicenseValidOnline`, `resetOnlineCache` |
| `src/licenseEngine.js` | Core: machine ID from MAC address, HMAC key validation, online check cache, file read/write |
| `src/licenseEngine.jsc` | V8 bytecode version of above (ships in production ASAR) |

### Middleware
- `server/middleware/_requireLicense.js` — async middleware, calls `isLicenseValidOnline()`, returns 403 `{ error: 'LicenseRequired' }` if invalid.
- Exception: Shopify and WooCommerce webhook paths bypass license check.

### Machine ID
Computed from the first non-internal MAC address using `os.networkInterfaces()`. Hashed for determinism.

### Admin Panel
Online validation POSTs to `https://zyqora-admin.vercel.app` — **do not change this URL even if the product is rebranded**.
Response: `{ valid, expiry, secondsLeft, daysLeft, deviceLimit, isLifetime, plan, features }`.

### Feature Flags
`license.features` is an object e.g. `{ liveChat: true, autoReply: true, ... }`. Returned from admin panel and cached locally in `license.json`. Used by `requireFeature` middleware and checked in `Sidebar.jsx` for lock icon display.

---

## 6. Device / WhatsApp Layer

### `src/deviceManager.js` — Singleton EventEmitter

```js
deviceManager.get(deviceId)           // → WhatsAppManager | null
deviceManager.getFirstReady()         // → first ready instance | null
deviceManager.init(deviceId)          // create + start WA instance (idempotent)
deviceManager.remove(deviceId)        // logout + delete auth dir
deviceManager.teardownAll()           // close all sockets, clear map (Support Fix)
deviceManager.initSavedDevices()      // called on server boot, restores sessions with saved creds
```

**Auth dir**: `ZYQORA_DATA/auth_info/<deviceId>/`

**Events emitted upward**:
- `device_qr` → forwarded to `io.emit('device_qr', { deviceId, qrDataUrl })`
- `device_ready` → updates devices.json, `io.emit('device_connected')` + `'devices_updated'`
- `device_disconnected` → updates devices.json status if was connected, `io.emit('devices_updated')`
- `optout_keyword` → `{ phone, keyword, sock, deviceId }`
- `incoming_message` → `{ phone, jid, body, msg, sock, deviceId }`

---

### `src/whatsapp.js` — WhatsAppManager class

**Constructor**: takes `authDir`. State: `status` (disconnected/initializing/qr/ready), `qrCode`, `lidToPhone` Map, `_labels` Map, `_labelAssociations` array.

**`initialize()`**: Cancels pending reconnect timer, calls `_doInitialize()` (guarded by `_initLock`).

**`_doInitialize()`**:
1. Fetches latest WA version from WhiskeySockets GitHub JSON (falls back to `fetchLatestBaileysVersion()`).
2. Creates Baileys socket with `makeWASocket({ version, auth, browser: ['Windows','Chrome','24.0'], keepAliveIntervalMs: 25000, syncFullHistory: false, ... })`.
3. Registers `creds.update` → `saveCreds`.
4. `messages.upsert` handler: deduplicates by message ID (Set capped at 500), extracts body text, emits `optout_keyword` for SUBSCRIBE/UNSUBSCRIBE, emits `incoming_message` for all others.
5. `contacts.upsert` / `contacts.update` → builds `lidToPhone` map.
6. `labels.edit` / `labels.association` → tracks WA Business labels.
7. `connection.update`: handles QR (emit `qr`), open (emit `ready`, start keepalive), close (logout/bad-session → wipe creds; restartRequired → immediate reconnect; otherwise → exponential backoff).

**Reconnection**: `_scheduleReconnect()` — exponential backoff 5s → 10s → 20s → 40s → max 60s.

**Keepalive**: `sendPresenceUpdate('available')` every 30s. If it fails triggers a reconnect.

**`sendMessage(to, message, imagePath, buttonType, buttons, listButtonText, listSections, mediaType)`**:
- Normalises `quick-reply` → `quick_reply`.
- Converts phone to JID via `_toJid()` (auto-prepends `91` for 10-digit Indian numbers).
- Verifies number is registered on WhatsApp via `sock.onWhatsApp()` (skip for groups).
- Reads media file, determines MIME type, generates 72×72 JPEG thumbnail via `sharp`.
- **Quick reply / CTA buttons**: uses `interactiveMessage` with `name: 'quick_reply'` / `cta_url` / `cta_call` / `cta_copy`.
- **List message**: uses `interactiveMessage.nativeFlowMessage.buttons[{ name: 'single_select', buttonParamsJson }]`.
- **Plain**: sends `{ text }` / `{ image }` / `{ video }` / `{ audio }` / `{ document }` as appropriate.

**`sendCarousel(to, bodyText, cards, { title, subtitle, footer })`**: Builds proto-encoded `InteractiveMessage.carouselMessage` with per-card images uploaded via `waUploadToServer`. Requires ≥ 2 cards, up to 2 buttons each.

**`sendPoll(to, introText, pollQuestion, pollOptions, mediaPath)`**: Optionally sends intro text/media first, then `{ poll: { name, values, selectableCount: 1 } }`.

**`sendTyping(to, durationMs)`**: `presenceSubscribe` → `sendPresenceUpdate('composing')` → wait → `sendPresenceUpdate('paused')`.

**`sendContact(to, contactName, contactPhone, introText)`**: Sends vCard as `{ contacts: { displayName, contacts: [{ vcard }] } }`.

**`sendLocation(to, locationName, locationAddress, lat, lng, introText)`**: Sends `{ location: { degreesLatitude, degreesLongitude, name, address } }`.

---

## 7. Server — `server/index.js`

```
Express app
Socket.io server (cors: *)
socketSingleton.init(io)

Middleware:
  express.json({ limit: '50mb', verify: captureRawBody })
  express.urlencoded({ limit: '50mb' })
  express.static('../public')

Routes:
  /api/license          → requireLicense bypassed (unprotected)
  /api                  → requireLicense middleware
  /api                  → routes/settings.js
  /api/templates        → routes/templates.js
  /api/campaigns        → routes/campaigns.js
  /api/campaigns        → services/campaignService.js  (send/pause/retry)
  /api/devices          → routes/devices.js
  /api/backup           → routes/backup.js
  /api/live-chat        → routes/liveChat.js
  /api/integrations     → routes/integrations.js
  /api/cart-recovery    → routes/cartRecovery.js
  /api/mobile           → routes/mobile.js
  /{*path}              → SPA fallback → public/index.html

Socket events wired from deviceManager:
  device_qr        → io.emit('device_qr', { deviceId, qrDataUrl })
  device_ready     → io.emit('device_connected') + 'devices_updated'
  device_disconnected → io.emit('devices_updated')

Engines registered on boot (require() calls):
  services/liveChatEngine
  services/cartRecoveryEngine

On server.listen:
  deviceManager.initSavedDevices()
  setTimeout → integrationsRoutes.bootstrapAutoIntegrations()
```

---

## 8. Message Engines

All engines register `deviceManager.on('incoming_message', handler)`. They run in whatever order their `require()` was called. Each engine is independent and handles the same event — they do NOT chain or break early across engines. Within engines, processing stops after first matching rule/flow.

### 8.1 `optoutEngine.js`
- Listens to `optout_keyword` event (not `incoming_message`).
- `UNSUBSCRIBE` → add to optout records.
- `SUBSCRIBE` → remove from optout records.
- Sends configured subscribe/unsubscribe reply message.

### 8.2 `autoReplyEngine.js`
- Loads all active rules for the `deviceId`.
- Sorts by `priority`. Checks: group/individual filter, opt-out skip, cooldown (`rule.cooldownMinutes`).
- Matches rule keyword against message body (exact/starts_with/ends_with/contains).
- Sends using template (supports all types: text, image, buttons, list, carousel, poll, contact, location).
- Updates `auto_reply_log.json` with timestamp, increments `rule.totalResponses`.
- **Breaks after first matching rule**.

### 8.3 `chatbotEngine.js`
- Loads active flows matching `deviceId` (via `flow.sessionIds` array or legacy `flow.sessionId`).
- Matches `triggerKeywords` using `matchKeyword(body, kw, matchType, caseSensitive)`.
- Per-flow cooldown via `sessionCooldowns` Map.
- Executes ordered nodes with `betweenDelayMs` between each.
- Node types: text, template, image/video/audio/document attachments (field: `node.attachmentFile`).
- Increments `flow.totalConversations`.

### 8.4 `liveChatEngine.js`
- Creates or updates a chat record in `live_chats.json`.
- Contact name resolved from contacts list → pushName → phone number.
- Each message stored as `{ id, fromMe: false, body, messageType, mediaData, timestamp }`.
- Emits `live_chat_message` socket event to frontend.
- If chat was `resolved` and a new message arrives → reopens to `open`.

### 8.5 `cartRecoveryEngine.js`
- Schedules follow-up messages for abandoned carts.
- Works with `cart_recovery.json` entries.

### 8.6 `hookEngine.js`
- Forwards incoming messages to configured hook numbers.

### 8.7 `aiAutomationEngine.js`
- AI-powered chatbot using free AI APIs (no API keys needed).
- Maintains conversation history per JID in memory (`conversationHistory` Map).
- Captures lead fields: `name`, `mobile`, `email`, `location`, `dateTime`, `service`.
- Field extraction via labeled line parsing (`name: value`) and context heuristics.
- Saves captured leads to `ai_records.json`.

---

## 9. Campaign Service — `server/services/campaignService.js`

### Endpoints
```
POST /api/campaigns/:id/send     → start campaign
POST /api/campaigns/:id/pause    → pause (sets flag, checked in loop)
POST /api/campaigns/:id/resend   → resend all messages
POST /api/campaigns/:id/retry-failed → retry only failed messages
```

### Send Loop (background async, response sent before loop starts)
```
1. Check device ready
2. Check campaign status (no double-run)
3. Resolve template pool / text message
4. Check daily limit
5. Set status = 'running', emit update
6. [Optional] Random start delay (startDelayMin–startDelayMax minutes)

For each message:
  a. Skip if already 'sent'
  b. Check pause flag → set 'paused' and exit
  c. Reload settings from disk (allows live config changes)
  d. [Per-message sendAt gate] — for scheduled cart-recovery messages
  e. Pick device (round-robin from campaign.deviceIds, fallback getFirstReady())
  f. Check daily limit → set safetyNote + break if exceeded
  g. [Safe mode] Apply per-message random delay (minDelay–maxDelay seconds)
  h. [Typing indicator] sendTyping() if typingEnabled
  i. Pick template from pool (round-robin if multiple)
  j. Personalize text (personalizeText + applyVariables)
  k. Send via wa.sendMessage() / sendCarousel() / sendPoll()
  l. Update message status → 'sent' or 'failed'
  m. Save campaigns.json
  n. incrementDailyCount()
  o. Emit campaign_update via Socket.io
  p. [Batch pause] After batchSize messages pause for batchPauseMin–batchPauseMax seconds

7. Set status = 'completed', save, emit final update
```

### Send Modes
| Mode | Behavior |
|------|----------|
| `safe` | Random delay between messages (minDelay–maxDelay) + batch pauses |
| `instant` | No delay, no batch pauses |
| `safest` | Longer delays, larger batch pauses |

### Device Picker
`makeCampaignDevicePicker(campaign)` returns a closure that round-robins through `campaign.deviceIds`, falling back to `deviceManager.getFirstReady()` if the assigned device isn't ready.

---

## 10. REST API Reference

### License (Unprotected)
```
GET  /api/license/status     → { valid, machineId, expiry, daysLeft, deviceLimit, isLifetime, plan, features }
POST /api/license/activate   body: { key } → { success, deviceLimit, expiry, isLifetime, plan, features }
```

### Settings
```
GET  /api/settings           → settings object
PUT  /api/settings           body: partial settings → validated + saved settings
GET  /api/daily-stats        → { date, count }
GET  /api/hook-numbers       → array of hook number objects
PUT  /api/hook-numbers       body: array → saved array
POST /api/data-management/reset → wipes all data (contacts, templates, campaigns, groups, etc.)
POST /api/open-app-data      → opens data folder in Electron shell
POST /api/data-management/delete/whatsapp-sessions
POST /api/data-management/delete/templates
POST /api/data-management/delete/campaigns
POST /api/data-management/delete/live-chat
POST /api/data-management/delete/license
```

### Templates
```
GET    /api/templates               → all templates
POST   /api/templates               body: template object → created template
PUT    /api/templates/:id           body: partial → updated template
DELETE /api/templates/:id           → deletes template + associated files
POST   /api/templates/:id/image     multipart image → { imageFile }
DELETE /api/templates/:id/image     → removes image file
POST   /api/templates/:id/media     multipart media → { mediaFile, mediaType }
DELETE /api/templates/:id/media     → removes media file
POST   /api/templates/:id/cards/:cardIndex/image  → card image upload
DELETE /api/templates/:id/cards/:cardIndex/image  → remove card image
```

**Template object fields**: `id, name, content, templateType (text/carousel/poll/contact/location), mediaType, buttonType (none/quick_reply/list), buttons[], listButtonText, listSections[], cards[], carouselTitle, carouselSubtitle, carouselFooter, pollQuestion, pollOptions[], variables[], contactName, contactPhone, locationName, locationAddress, locationLat, locationLng, imageFile, mediaFile, createdAt`

### Campaigns
```
GET    /api/campaigns               → all campaigns
POST   /api/campaigns               body: { name, templateId(s), contactIds/numbers, deviceIds, sendMode, msgType, textMessage, variables } → campaign
DELETE /api/campaigns/:id
POST   /api/campaigns/:id/send
POST   /api/campaigns/:id/pause
POST   /api/campaigns/:id/resend
POST   /api/campaigns/:id/retry-failed
POST   /api/campaigns/cart-recovery body: cart recovery campaign config → campaign
```

**Campaign object**: `id, name, msgType, templateId, templateIds[], textMessage, deviceIds[], sendMode, variables[], status (draft/running/paused/completed/failed), messages[], createdAt, startedAt, completedAt, safetyNote`

**Message object**: `{ contactId, contactName, number, status (pending/sent/failed), sentAt, error, cartRecoveryId?, sendAt? }`

### Contacts
```
GET    /api/contacts                → all contacts (with auto-ID migration)
POST   /api/contacts                body: { name, number } → contact
PUT    /api/contacts/:id            body: partial → updated
DELETE /api/contacts/:id
DELETE /api/contacts/bulk           body: { ids[] }
POST   /api/contacts/import         multipart CSV → { imported, skipped, total }
```

### Devices
```
GET    /api/devices                 → all devices
POST   /api/devices                 body: { name } → device (checks device limit vs license)
DELETE /api/devices/:id             → logout + remove auth
GET    /api/devices/:id/qr          → { status, qrDataUrl }
```

**Device object**: `{ id, name, sessionId, status (qr_pending/connected/disconnected), createdAt }`

### Live Chat
```
GET    /api/live-chat                params: { status, sessionId, search, page, limit }
GET    /api/live-chat/:id/messages
PATCH  /api/live-chat/:id/status    body: { status }
PATCH  /api/live-chat/:id/read
POST   /api/live-chat/:id/send      body: { message }
POST   /api/live-chat/:id/notes     body: { note }
DELETE /api/live-chat/:id/notes/:noteId
DELETE /api/live-chat/:id
```

### Integrations
```
GET    /api/integrations/config     → full integrations config
PUT    /api/integrations/config     body: config → saved
POST   /api/integrations/public-url/generate  → start cloudflared/ngrok tunnel
GET    /api/integrations/shopify/status
GET    /api/integrations/woocommerce/status
POST   /api/integrations/shopify/webhook    ← bypasses license check
POST   /api/integrations/woocommerce/webhook ← bypasses license check
```

### Cart Recovery
```
GET    /api/cart-recovery/entries   params: { status, page, limit }
GET    /api/cart-recovery/stats     → { totalAbandoned, messagesSent, recoveredUsers, totalEntries }
POST   /api/cart-recovery/:id/mark-recovered
POST   /api/cart-recovery/:id/move-to-abandoned
```

---

## 11. Frontend — React/Vite

### Entry
`renderer/src/main.jsx` → `<AppProvider><BrowserRouter><App /></BrowserRouter></AppProvider>`

### AppContext (`renderer/src/contexts/AppContext.jsx`)
Global state and actions available via `useApp()`:
```js
license       // null=loading, { valid:false }=needs key, { valid:true, ...data }=unlocked
refreshLicense()
activateLicense(key)
toast         // { message, type } | null
showToast(message, type)
showConfirm(title, message, { danger, confirmLabel }) → Promise<boolean>
campaignUpdates   // { [campaignId]: payload } — updated from socket events
setCampaignUpdates
```

### App.jsx — Root Flow
```
license === null  →  Splash screen (2.5s minimum)
!license.valid    →  <LicenseGate />
license.valid     →  App shell: <Sidebar> + <Topbar> + <Routes>
```

**Routes**:
```
/                    → redirect /dashboard
/dashboard           → <Dashboard />
/devices             → <Devices />
/templates           → <Templates />
/campaigns           → <Campaigns />
/live-chat           → <LiveChat />
/integrations        → <Integrations />
/integrations/shopify             → <ShopifyIntegration />
/integrations/woocommerce         → <WooCommerceIntegration />
/integrations/shopify/manage      → <IntegrationManagement source="shopify" />
/integrations/woocommerce/manage  → <IntegrationManagement source="woocommerce" />
/settings            → <Settings />
/zyq                 → <LicensePortal />
*                    → redirect /dashboard
```

### Socket Events (Frontend)
```js
socket.on('campaign_update', payload)    → updates campaignUpdates context
socket.on('devices_updated', handler)    → Devices page reloads device list
socket.on('device_qr', { deviceId, qrDataUrl }) → Devices page updates QR modal
socket.on('live_chat_message', { jid, deviceId, message, displayName }) → LiveChat page
```

### api.js — All API calls
(See Section 10 for the route shapes. The api object mirrors every route with the same naming convention.)

---

## 12. Text Utilities — `server/utils/text.js`

### `personalizeText(template, name, phone)`
1. `{{opt1|opt2|opt3}}` → random pick (double-brace spintax, requires `|`)
2. `{{random}}` → 4-digit random number
3. `{{name}}` → contact name (falls back to phone)
4. `{opt1|opt2}` → random pick (single-brace spintax, requires `|`)

### `applyVariables(text, variables, msgIndex)`
Replaces `{variableName}` with `variables[i].values[msgIndex % values.length]`.
Used for sequential variable rotation across campaign messages (e.g. different product names per recipient).

### `normalizePhone(number)` — `server/utils/phone.js`
Strips non-digits. (May auto-prepend country code depending on implementation.)

---

## 13. Daily Stats — `server/utils/dailyStats.js`

In-memory counter `{ date, count }` with file persistence to `data/daily-stats.json`.
- Auto-resets count to 0 when the date changes.
- `getTodayCount()` — reads count, resets if date changed.
- `incrementDailyCount()` — increments and persists.
- `getState()` — returns raw state object.
- Loaded synchronously at module require time (IIFE).

---

## 14. Integrations — Shopify + WooCommerce

### Config (`data/integrations.json`)
```js
{
  publicAppUrl: '',       // current tunnel URL
  shopify: {
    enabled, storeUrl, accessToken, webhookSecret
  },
  woocommerce: {
    enabled, siteUrl, consumerKey, consumerSecret
  },
  cartRecovery: {
    enabled, delayMinutes, retryDelayMinutes, maxRetries,
    messageMode ('text'|'template'), templateId,
    plainMessage   // with {{name}}, {{checkout_link}}, {{cart_items}} placeholders
  }
}
```

### Public URL Tunnel
Generated via `POST /api/integrations/public-url/generate`.
Tries **cloudflared** first, falls back to **ngrok**.
Cloudflared binary path is read from `process.env.CLOUDFLARED_BIN` (set by Electron for unpacked path).

### Webhooks
- `POST /api/integrations/shopify/webhook` — verifies HMAC signature, processes `checkouts/create`, `checkouts/update`, `orders/create` events. Updates cart recovery entries.
- `POST /api/integrations/woocommerce/webhook` — processes WooCommerce cart/order events.
- Both routes **bypass** the license middleware check.

### Cart Recovery Entries
Stored in `cart_recovery.json`:
```js
{
  id, source ('shopify'|'woocommerce'), cartToken, checkoutId,
  customerName, customerPhone, checkoutLink, cartItems, cartDetails,
  status ('abandoned'|'recovered'), messagesSent, maxRetries,
  sentAt, lastError, createdAt, updatedAt
}
```

### `bootstrapAutoIntegrations()`
Called 1.2s after server start. Resumes any pending cart recovery messages that were interrupted by a restart.

---

## 15. Build & Packaging

### Commands
```
npm run dev           — concurrently: node server/index.js + vite
npm run build:react   — vite build → output to public/
npm run electron      — electron .  (requires server already running or modify for standalone)
npm run build:exe     — build:react then electron-builder --win
npm run build:exe:dir — build:react then electron-builder --win --dir (no installer)
```

### `vite.config.mjs`
```js
root: 'renderer'
build.outDir: '../public'   // production bundle lands in public/
server.proxy:
  /api      → http://localhost:3000
  /socket.io → http://localhost:3000  (ws: true)
  /data     → http://localhost:3000
```

### electron-builder config (`package.json` `build` key)
```
appId: com.zyqora.app
productName: Zyqora
asar: true
asarUnpack: sharp, @img, @fadzzzslebew/baileys, @ngrok, cloudflared  ← must be spawnable binaries
afterSign: scripts/pack-asar.js   ← post-sign ASAR packer (honeypot injection, bytecode)
win.target: nsis
nsis.shortcutName: Zyqora
```

### pack-asar.js (`scripts/pack-asar.js`)
- Injects honeypot decoy files at known attack paths (server bypasses, secret locations).
- Honeypot content: copyright notice + `throw new Error(...)` — deters AI-assisted cracking.
- Runs after electron-builder signs the ASAR.

### License Compilation (`scripts/compile-license.js`)
- Run once before packaging: `npx electron scripts/compile-license.js`
- Compiles `src/licenseEngine.js` → `src/licenseEngine.jsc` (V8 bytecode via bytenode).
- Same process for `server/middleware/requireLicense` → `.jsc` and `server/routes/license` → `.jsc`.

---

## 16. Key Design Decisions & Notes

1. **Baileys fork** (`@fadzzzslebew/baileys`): Custom fork with `dugong.handleInteractive` for native-flow button support. The standard Baileys `fetchLatestBaileysVersion()` is bypassed in favour of fetching directly from WhiskeySockets GitHub JSON to avoid a stale version that WA rejects with HTTP 405.

2. **Interactive messages**: Quick-reply buttons and list messages use the `interactiveMessage` format (not the deprecated `buttonsMessage`). Buttons are passed as `buttons[{ name, buttonParamsJson }]` objects.

3. **LID → Phone mapping**: WhatsApp Business sends LID JIDs (`@lid`) instead of phone JIDs for some contacts. The `lidToPhone` Map (built from `contacts.upsert` events) resolves these back to phone numbers.

4. **Message deduplication**: `_seenMsgIds` Set in whatsapp.js prevents the `messages.upsert` handler from firing twice for the same message (Baileys can deliver duplicates during history sync / multi-device relay).

5. **Campaign device picker**: Round-robin across `campaign.deviceIds` so load is spread across multiple WhatsApp sessions. Falls back to `getFirstReady()` if a specific device is offline.

6. **Settings validation**: `PUT /api/settings` enforces hard minimums: `minDelay ≥ 20s`, `batchPauseMin ≥ 30s`. These cannot be bypassed by the UI.

7. **Contacts migration**: On first read, `getContacts()` looks for a legacy root `contacts.json` and migrates it to `data/contacts.json`.

8. **Raw body capture**: Express middleware captures raw request body into `req.rawBody` — required for Shopify HMAC webhook signature verification.

9. **Bytecode strategy**: License engine and requireLicense middleware are compiled to V8 bytecode (`.jsc`) for production. Dev mode always loads the plain `.js` source (`_*.js` prefix convention). The loader file (without `_` prefix) checks `process.versions.electron` to decide which to load.

10. **Socket.io in dev**: Vite dev server proxies `/socket.io` with `ws: true` to the Express server on `:3000`, so Socket.io works seamlessly in both dev and production.

---

## 17. Environment Variables

| Variable | Where set | Purpose |
|----------|-----------|---------|
| `ZYQORA_DATA` | electron/main.js (production) | Base path for all data files |
| `PORT` | optional | Express server port (default 3000) |
| `NODE_ENV` | optional | `development` for dev mode detection |
| `CLOUDFLARED_BIN` | electron/main.js (production) | Path to cloudflared binary in .unpacked |
| `SHOPIFY_API_VERSION` | optional | Shopify API version (default 2026-01) |

---

## 18. Quick Lookup Index

| What you're looking for | Where to look |
|------------------------|---------------|
| WhatsApp send logic | `src/whatsapp.js` → `sendMessage()` |
| Add a new route | `server/routes/` + mount in `server/index.js` |
| Add a new data store | `src/storage.js` + add to FILES map |
| Change campaign delay logic | `server/services/campaignService.js` send loop |
| Add a new page | `renderer/src/pages/` + Route in `App.jsx` |
| Add a new API call | `renderer/src/api.js` + matching route in `server/routes/` |
| Change license validation | `src/licenseEngine.js` (recompile after) |
| Change feature gates | `license.features` from admin panel / `requireFeature` middleware |
| Socket.io events (server→client) | `server/index.js` + `server/services/liveChatEngine.js` + `server/services/campaignService.js` |
| Socket.io events (client listening) | `renderer/src/contexts/AppContext.jsx` + per-page `socket.on()` calls |
| Telegram for dev log | console.log prefixes: `[WhatsApp]`, `[DeviceManager]`, `[AutoReply]`, `[Chatbot]`, `[LiveChat]`, `[Zyqora]` |
