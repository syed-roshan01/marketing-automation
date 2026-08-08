# SMS Bulk Sender Feature Plan
*Documented: April 23, 2026 — Implementation deferred*

---

## Overview

Add a **Bulk SMS Sender** feature to Zyqora that uses the user's own Android phone (via a companion APK) as the SMS gateway. No third-party SMS APIs. No cloud service. The phone's SIM card sends the messages directly over the carrier network.

---

## Architecture

```
┌─────────────────────────────┐         Local WiFi (same network)
│   Zyqora Desktop (Electron) │ ◄──────────────────────────────────►  Android Phone
│                             │         HTTP on port 8765            │              │
│  SMS Bulk page              │  POST /send { to, body }  ──────────►│  Companion   │
│  ↓ queues numbers           │                                       │  App (APK)   │
│  ↓ sends one by one         │  ◄── { status: 'sent' / 'failed' }  │  SmsManager  │
│                             │                                       │  API → SIM   │
└─────────────────────────────┘                                       └──────────────┘
```

---

## Pairing Flow (like WhatsApp Web QR scan)

```
1. User opens "SMS Devices" in Zyqora desktop
   → App generates a QR code (contains: desktop_ip + secret_token)

2. User opens companion APK on Android
   → Taps "Scan to Pair"
   → Scans the QR

3. Phone connects back to desktop, completes handshake
   → Desktop saves: { phone_ip, secret_token, label, phone_number }
   → Phone stores desktop_ip + token, starts its HTTP server on :8765

4. Paired. Desktop can now POST to http://<phone_ip>:8765/send
   → Phone calls SmsManager.sendTextMessage(number, null, body, ...)
   → Delivery receipt POSTed back to desktop
```

---

## Why an Android APK is Required

Android is a closed OS. The only entity allowed to send SMS from a phone is an app installed **on that phone**. There is no way to remotely trigger `SmsManager` from a desktop — it's not exposed over the network by the OS.

| Option | Why it doesn't work |
|---|---|
| Desktop Node.js directly | No access to SIM / cellular modem |
| Phone's browser | Browsers are sandboxed — no SmsManager |
| ADB commands | Requires USB cable + USB debugging. Not practical |
| Existing SMS apps | None expose an HTTP server |
| Tasker / Automate | Third-party installation |
| **Your own APK** ✓ | Only option: HTTP server + SmsManager in one package |

---

## Android Companion APK (to build separately)

**Language:** Java or Kotlin  
**Size:** ~150 lines of code, ~2MB APK  
**Dependencies:** NanoHTTPD (embedded, ~50KB JAR — no extra install for user)  
**Permissions needed:** `SEND_SMS`, `RECEIVE_SMS` (for delivery receipts)

### What the APK does (3 things only):
1. Start a tiny HTTP server on port `8765` (NanoHTTPD)
2. Listen for `POST /send { to, body }` from the desktop
3. Call `SmsManager.sendTextMessage(...)` → carrier sends SMS, receipt fires callback

### APK endpoints:
```
POST /send        { to: "+91XXXXXXXXXX", body: "Hello" }  → { status: "sent" }
POST /pair        { desktop_ip, token }                   → { ok: true, phone_number }
GET  /status                                              → { paired: true, battery: 82 }
```

---

## Customer Install Flow

```
1. Download ZyqoraSMS.apk from your website
2. Install on Android (one tap — like any APK)
3. Grant "Send SMS" permission (Android prompts automatically)
4. Open Zyqora desktop → SMS Devices → Show QR
5. Open APK on phone → Scan QR
6. Paired. Phone runs silently in background.
```

---

## Files to Create in Zyqora (Desktop Side)

### Backend
```
server/routes/sms.js              — REST API: SMS devices CRUD + bulk send queue
server/services/smsService.js     — Queue engine: send one-by-one with delay, track status
data/sms_devices.json             — Paired Android devices (ip, token, label, phoneNumber)
data/sms_campaigns.json           — SMS campaign records
```

### Frontend
```
renderer/src/pages/SmsCampaigns.jsx    — Bulk SMS page (number list + message + send)
renderer/src/pages/SmsDevices.jsx      — Pair Android devices (QR code display)
```

### Route registration (server/index.js)
```js
app.use('/api/sms', requireLicense, require('./routes/sms'));
```

### Sidebar entry (components/Sidebar.jsx)
```
SMS Sender  →  /sms-campaigns   [feature: smsSender]
SMS Devices →  /sms-devices     [feature: smsSender]
```

### Feature key to add
```
smsSender   (add to license features schema in admin panel)
```

---

## SMS Campaign Data Schema

```json
{
  "id": "uuid",
  "name": "April Promo",
  "message": "Hi {{name}}, check our offer...",
  "recipients": [
    { "number": "+91XXXXXXXXXX", "name": "John", "status": "pending" }
  ],
  "deviceId": "sms-device-uuid",
  "status": "draft | running | paused | completed | failed",
  "scheduledAt": null,
  "createdAt": "ISO",
  "stats": { "total": 100, "sent": 45, "failed": 2, "pending": 53 }
}
```

---

## SMS Device Data Schema

```json
{
  "id": "uuid",
  "label": "My Samsung S23",
  "phoneNumber": "+91XXXXXXXXXX",
  "ip": "192.168.1.105",
  "port": 8765,
  "token": "secret-handshake-token",
  "status": "online | offline | pairing",
  "pairedAt": "ISO",
  "battery": 82
}
```

---

## Sending Logic (smsService.js)

```
for each recipient:
  POST http://<device_ip>:8765/send { to, body }
  wait for response
  update recipient status (sent / failed)
  delay: minDelay–maxDelay seconds (reuse Settings delays)
  if batchSize reached → pause batchPauseMin–batchPauseMax seconds
  emit socket event: sms_campaign_update { campaignId, stats }
```

---

## Rate Limit Awareness

Android carriers rate-limit SMS to roughly **100–200 SMS/hour per SIM** before spam flags trigger. For higher throughput, users should register multiple Android phones (each = one SMS device). Architecture already supports this — same pattern as multiple WhatsApp devices.

---

## Multi-device Support

Multiple phones can be paired. When creating a campaign, user selects which SMS device to use. Future: round-robin across devices for higher throughput.

---

## Implementation Order (when ready to build)

1. `data/sms_devices.json` + `data/sms_campaigns.json` storage methods in `src/storage.js`
2. `server/routes/sms.js` — devices CRUD + campaign CRUD + start/pause/stop
3. `server/services/smsService.js` — queue engine with delays + socket events
4. Register route in `server/index.js`
5. `renderer/src/pages/SmsDevices.jsx` — QR pairing UI
6. `renderer/src/pages/SmsCampaigns.jsx` — bulk send UI
7. Add sidebar entries + App.jsx routes
8. Add `smsSender` feature to license schema in admin panel
9. **Android APK** (separate project) — Java/Kotlin + NanoHTTPD
10. Test end-to-end on real device + WiFi

---

*Resume this document when ready to implement.*
