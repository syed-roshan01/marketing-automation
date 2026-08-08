# Zyqora — Project Memory Bank
*Last updated: April 14, 2026*

> **PURPOSE:** Paste this file's contents at the start of any new AI session to give full context instantly.

---

## 1. Project Overview

**Zyqora** is a WhatsApp Desktop Automation Platform built with:
- **Electron** (shell) — `electron/main.js`
- **Express** backend — `server/index.js` (port 3000)
- **React + Vite** frontend — `renderer/src/` (dev port 5173)
- **Baileys** library for WhatsApp (`@fadzzzslebew/baileys`)
- License-gated — requires online validation to function

**Workspace:** `C:\Users\toros\OneDrive\Desktop\zyqora`
**Admin panel:** `C:\Users\toros\OneDrive\Desktop\zyqora-admin` → deployed at `https://zyqora-admin.vercel.app`
**Admin GitHub:** `https://github.com/syed-roshan01/zyqora-admin` (collaborator: `blackhat-01`)

---

## 2. Build Commands

```powershell
# Development
npm run dev                  # starts Express (3000) + Vite (5173) concurrently

# Production EXE
npx electron scripts/compile-license.js   # compile licenseEngine.js + campaignService.js → .jsc
npm run build:exe                         # vite build → electron-builder --win

# Or step by step:
npm run build:react          # vite build only
npx electron-builder --win   # package only

# Output: dist/electron/Zyqora Setup 1.0.1.exe
```

Kill stuck node processes before restarting dev:
```powershell
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
# or
taskkill /F /IM node.exe /T
```

---

## 3. Project Structure

```
electron/main.js          — Electron entry; spawns Express; creates BrowserWindow
server/index.js           — Express app; mounts all routes; Socket.io; campaign scheduler
server/constants.js       — DATA_ROOT, LICENSE_FILE, MACHINE_ID_FILE, IMAGES_DIR, MEDIA_DIR
server/license.js         — Loads licenseEngine (.jsc in prod, .js in dev); seeds machine_id
server/middleware/
  requireLicense.js       — 403 if license not valid online
  requireFeature.js       — 403 if specific feature === false in license
server/routes/            — REST endpoints per feature
server/services/          — Background engines (campaign, chatbot, autoReply, etc.)
  _campaignService.js     — Source (compiled to campaignService.jsc); exports startCampaignById
src/licenseEngine.js      — Source (compiled to .jsc before packaging)
src/storage.js            — JSON file CRUD for contacts/groups/templates/campaigns/etc.
data/machine_id           — Persisted machine ID (never changes after first run)
renderer/src/
  App.jsx                 — Router; FeatureRoute component; splash screen
  contexts/AppContext.jsx — Global license state; showToast; showConfirm; refreshLicense
  api.js                  — All fetch wrappers (api.getLicenseStatus, etc.)
  pages/                  — One file per page
  components/             — Sidebar, Topbar, Modal, Toast, ConfirmDialog
```

---

## 4. Data Storage

**Dev:** `data/` folder in project root
**Prod (installed):** `%APPDATA%\Zyqora\` (via `app.getPath('userData')` → `ZYQORA_DATA` env var)

Key files inside `ZYQORA_DATA`:
- `license.json` — saved after successful activation
- `machine_id` — persisted machine ID (seeded from license.json on first run for existing users)
- `contacts.json`, `campaigns.json`, `templates.json`, `groups.json`, `devices.json`
- `settings.json`, `optout.json`, `trust_builder.json`
- `images/`, `media/` — uploaded assets

---

## 5. License System

### Key Format
`ZYQ-{expiryHex8}-{deviceHex2+hmac6}-{hmac8}-{hmac8}` (HMAC-SHA256)

### Flow
1. User enters key in `LicenseGate.jsx`
2. `POST /api/license/activate` → `validateOnline(key, machineId)`
3. Calls `https://zyqora-admin.vercel.app/api/licenses/validate`
4. On success: saves `license.json` with `{ key, activatedAt, machineId, plan, features }`
5. Every page load: `GET /api/license/status` re-validates online + refreshes features

### Machine ID (STABLE — persisted to file)
- Computed once: SHA256 of `hostname|mac|cpu_model` → first 16 chars uppercase
- Written to `data/machine_id` file on first run
- Seed rule: if `machine_id` absent but `license.json` has `machineId`, write that first (preserves existing user's ID across upgrades)
- `server/constants.js`: `MACHINE_ID_FILE = path.join(DATA_ROOT, 'machine_id')`
- `src/licenseEngine.js`: `getMachineId(idFile?)` — reads file if exists, else computes + writes
- `server/license.js`: seeds on startup, passes `MACHINE_ID_FILE` to engine

### Feature Gating (Frontend)
```js
// renderer/src/App.jsx — FeatureRoute
const locked = license?.features && license.features[feature] === false;
```
`features: null` = old license = all features allowed (backward-compatible)

### Feature Gating (Backend)
```js
// server/middleware/requireFeature.js
if (!features || features[featureName] !== false) return next();
```

### Feature Keys
`mobile | trustBuilder | autoReply | chatbot | liveChat | groupGrabber | aiAutomation | forms`

### Feature-gated Routes
```
/api/mobile          → mobile
/api/auto-reply      → autoReply
/api/chatbot-flows   → chatbot
/api/live-chat       → liveChat
/api/trust-builder   → trustBuilder
/api/group-grabber   → groupGrabber
/api/ai-automation   → aiAutomation
/api/forms           → forms
```

### Offline Behavior
- Activation: **fails completely** (needs online validation)
- Startup: shows LicenseGate if offline validation returns null
- Fix for locked-out user: Settings → Support Fix tab → clears license.json

---

## 6. Admin Panel (zyqora-admin)

**Stack:** Next.js 14, `@vercel/kv` (Upstash Redis: `https://aware-grubworm-4242.upstash.io`)

### API Routes
| Route | Purpose |
|---|---|
| `POST /api/licenses/validate` | Called by Zyqora on activation/status check — returns `features` |
| `POST /api/licenses/generate` | Generate new license key |
| `POST /api/licenses/update`   | Update existing license fields |

### License Record Fields (KV)
```
key, clientName, clientPhone, clientEmail, businessCategory, website,
machineId, plan, deviceLimit, customDays, price, notes,
features: { mobile, trustBuilder, autoReply, chatbot, liveChat, groupGrabber },
issuedBy, issuedByName, issuedAt, activatedAt, expiresAt
```

### Admin UI (`app/licenses/page.jsx`)
- Table of all licenses; click client name → detail modal
- ✎ button → edit modal (all fields: name, phone, email, businessCategory, website, price, notes, features checkboxes)
- Revoke button
- Generate key form (all fields including businessCategory, website, features)

### Deploying Admin Changes
```powershell
cd "C:\Users\toros\OneDrive\Desktop\zyqora-admin"
git add <files>
git commit -m "feat: ..."
git push origin main
# Vercel auto-deploys in ~30 seconds
```

---

## 7. Settings Page (renderer/src/pages/Settings.jsx)

**Tabs:** `general` | `smart-protection` | `support`

**Key features:**
- Delay, batch, daily limit, typing indicator settings
- Smart Protection: time window, start delay, auto-warmup
- Keep Awake toggle (Electron `powerSaveBlocker`)
- Safety Score meter
- Presets: new / warm / max
- Support Fix tab: clears license.json (for re-activation)
- 3-click on version number → `/zyq` (License Portal)

**Default settings** (in `DEFAULTS` const):
```js
minDelay: 25, maxDelay: 40, batchSize: 20, batchPauseMin: 60, batchPauseMax: 120
dailyLimit: 50, typingMin: 2, typingMax: 5
companyName/Phone/Email/Website for support branding
```

---

## 8. Frontend Architecture

### AppContext
```js
{ license, refreshLicense, activateLicense, toast, campaignUpdates,
  showToast(msg, type), showConfirm(title, msg, opts) }
```
- `license: null` = loading
- `license: { valid: false }` = needs key
- `license: { valid: true, plan, features, daysLeft, ... }` = active

### Socket
`renderer/src/socket.js` — Socket.io client connected to Express backend

### Route → page mapping
```
/dashboard        Dashboard.jsx
/devices          Devices.jsx
/contacts         Contacts.jsx
/groups           Groups.jsx
/templates        Templates.jsx
/campaigns        Campaigns.jsx
/single-message   SingleMessage.jsx
/trust-builder    TrustBuilder.jsx      [feature: trustBuilder]
/auto-reply       AutoReply.jsx         [feature: autoReply]
/chatbot-flows    ChatbotFlows.jsx      [feature: chatbot]
/live-chat        LiveChat.jsx          [feature: liveChat]
/group-grabber    GroupGrabber.jsx      [feature: groupGrabber]
/ai-automation    AiAutomation.jsx      [feature: aiAutomation]
/forms            Forms.jsx             [feature: forms]
/opt-out          OptOutManagement.jsx
/settings         Settings.jsx
/zyq              LicensePortal.jsx     (secret — 3-click on version)
```

---

## 9. Electron Specifics

- Single instance lock (`app.requestSingleInstanceLock`)
- `powerSaveBlocker` via IPC `set-keep-awake`
- Context isolation ON, nodeIntegration OFF
- `preload.js` in `electron/`
- Window: 1400×900, min 1024×640, bg `#03050d`
- `asarUnpack`: `sharp`, `@img`, `@fadzzzslebew/baileys`
- NSIS installer: non-oneClick, no per-machine, creates desktop + start menu shortcuts

---

## 10. Known Issues & Fixes

| Issue | Fix |
|---|---|
| All features unlocked despite being disabled | Deployed admin was NOT returning `features` in validate response → `features: null` in license.json → all gates open. Fixed by updating validate/route.js |
| `dev` server won't start | Kill existing node processes first: `taskkill /F /IM node.exe /T` |
| License stuck / user locked out | Settings → Support Fix tab → clears license.json |
| Old licenses with `features: null` | Edit via admin panel → set features manually |
| Double banner — port 3000 conflict | Multiple stale node processes. Fix: `taskkill /F /IM node.exe /T` before starting fresh |
| Machine ID changed for customer | Was: adapter order changed (VPN/Docker/WSL). Fixed permanently by persisting to `data/machine_id` file |
| Device limit shows 3 despite license having more | `_license.js` only saved deviceLimit when `'features' in online`. Fixed: `saveLicenseData` now unconditional on every `/status` call |
| `DELETE /submissions` matched as `DELETE /:id="submissions"` | Route ordering in forms.js — all /submissions routes must be registered ABOVE `DELETE /:id` |
| Device disconnect notification not firing | Race condition — fixed with `_everConnected` Set in server/index.js |

---

## 11. Anti-Crack Protection Stack

### A — Bytecoded security modules
All security-critical files compiled to V8 bytecode via `npx electron scripts/compile-license.js`:

| Source (`_*.js`) | Compiled (`.jsc`) | Purpose |
|---|---|---|
| `src/licenseEngine.js` | `src/licenseEngine.jsc` | HMAC secret, key validation, machineId |
| `server/middleware/_requireLicense.js` | `requireLicense.jsc` | License gate |
| `server/middleware/_requireFeature.js` | `requireFeature.jsc` | Feature gate |
| `server/routes/_license.js` | `routes/license.jsc` | Activate/status handlers |
| `server/services/_campaignService.js` | `campaignService.jsc` | Campaign send logic |

**Loader pattern** (each `.js` file):
```js
module.exports = process.versions.electron
    ? (require('bytenode'), require('./file.jsc'))
    : require('./_file');   // dev only
```

**Source files excluded from ASAR** via `package.json` files[]:
```
"!server/middleware/_*.js", "!server/routes/_license.js", "!src/licenseEngine.js"
```

### B — ASAR Poisoning (4-layer + honeypots)

**Script:** `scripts/pack-asar.js`
**Trigger:** `"afterSign": "scripts/pack-asar.js"` in package.json `"build"` section

**4 attack layers:**
1. **1000 OOM bombs** — `size: 1GB`, unreachable offset → crash naive allocators
2. **5 nested dir trees** (depth=6, branches=3) → stack overflow in recursive extractors
3. **100 path-traversal symlinks** (`../` × 20-30) → stat errors
4. **20 circular symlink pairs** → infinite recursion

**16 honeypot decoy files** at attacker-targeted paths (`keygen.js`, `licenseEngine.js`, etc.)

**Verified:** `npx @electron/asar extract` → `ERR_BUFFER_OUT_OF_BOUNDS` immediately

---

## 12. Enhancement History (chronological)

1. Feature gating + Support Fix tab
2. Admin panel detail modal
3. Admin panel price/user/features edit
4. Admin panel businessCategory + website fields
5. validate/route.js fix (returns `features`)
6. Forms feature (formEngine, forms.js, Forms.jsx, multi field type)
7. Device disconnect notification fix (`_everConnected` set)
8. Device limit bug fix (unconditional `saveLicenseData`)
9. Machine ID stability (persist to `data/machine_id`, seed from license.json)
10. **Campaign Scheduling** (April 14, 2026) — see Section 13

---

## 13. Campaign Scheduling Feature (Added April 14, 2026)

### Overview
Schedule a campaign to auto-run at a specific date + time. Scheduler polls every 30 seconds.

### Backend — `server/routes/campaigns.js`
- `POST /api/campaigns` — accepts `scheduledAt` (ISO string); if future, sets `status: 'scheduled'`
- `PATCH /:id/schedule` — body `{ scheduledAt }` to set; empty `{}` cancels (reverts to `draft`)

### Backend — `server/services/_campaignService.js`
- `startCampaignById(id)` extracted as named export
- Clears `scheduledAt` on start (prevents re-trigger)
- **Must compile after editing:** `npx electron scripts/compile-license.js`

### Backend — `server/index.js`
```js
const { startCampaignById } = require('./services/campaignService');
setInterval(async () => {
    const campaigns = await storage.getCampaigns();
    const due = campaigns.filter(c =>
        c.status === 'scheduled' && c.scheduledAt &&
        new Date(c.scheduledAt).getTime() <= Date.now()
    );
    for (const c of due) {
        startCampaignById(c.id).catch(err => console.warn(`[Scheduler]`, err.message));
    }
}, 30_000);
```

### Frontend — `renderer/src/api.js`
```js
scheduleCampaign: (id, scheduledAt) => req('PATCH', `/api/campaigns/${id}/schedule`, { scheduledAt }),
cancelSchedule:   (id) => req('PATCH', `/api/campaigns/${id}/schedule`, {}),
```

### Frontend — `renderer/src/pages/Campaigns.jsx`
**Custom components at top of file:**
- `CalendarPicker` — floating month-grid, click-to-pick, outside-click closes
- `TimePicker` — Hour select (1–12) + minute number input (0–59, type allowed) + AM/PM select

**EMPTY_FORM:** `scheduleEnabled: false, scheduledAt: '', scheduleDate: '', scheduleTime: ''`

**save() logic:**
- Validates both date + time filled when `scheduleEnabled`
- Validates combined datetime is in the future
- Combines: `new Date(\`${form.scheduleDate}T${form.scheduleTime}\`).toISOString()`

**STATUS_COLOR:** `scheduled: '#a855f7'` (purple)

**Stat card:** `scheduledCount` = campaigns with `status === 'scheduled'`

**Filter:** separate "Draft" and "Scheduled" options in dropdown

**Card chip:** `🗓️ 3 Jan, 14:30` (purple) when `c.scheduledAt` exists

**Card actions for scheduled campaigns:**
- `▶ Send Now` → calls `sendCampaign(c.id)`
- `✕ Cancel Schedule` → calls `cancelSchedule(c.id)`

---

## 14. Cloud SaaS Migration Plan (discussed, not yet implemented)

**Decision:** Keep desktop (license-based) + build cloud SaaS in parallel.

**Cloud stack planned:**
- VPS: Hostinger KVM 2 (2 vCPU, 8GB RAM, ~₹800/mo) — Node.js + PM2 + Nginx
- DB: Neon.tech PostgreSQL (free tier)
- Redis: Upstash (free tier) — Bull campaign queues
- Storage: Cloudflare R2 (free 10GB) — media/images
- Frontend: Vercel (free) — React SPA

**Auth:** JWT login/register replacing license keys.

**Phases:**
1. DB + JWT auth (replace storage.js with PostgreSQL, add tenantId everywhere)
2. WA Worker service (extract Baileys into standalone worker with REST bridge)
3. Feature migration (multi-tenant engines)
4. Frontend (login page, per-tenant dashboard)

**Not started yet.**
