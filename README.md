# Pixel Village Wedding Guestbook v2

When a guest writes in the guestbook and takes a selfie, the app **analyzes the face on the phone** (face shape · hair length / bangs / volume · expression · beard · glasses · shirt color)
then creates a personalized **pixel character**, enters a **top-down hanok × Florida village** with a Stardew Valley vibe,
and celebrates the bride and groom through fishing, dancing, chatting, eating, and taking photos.

| Page | Purpose |
|---|---|
| `index.html` | Guest phone (QR). Write → photo analysis → dress up → choose activity → **phone remote control** |
| `kiosk.html` | Entrance tablet (auto resets after 12 seconds, resets after 2 minutes idle, no remote control) |
| `village.html` | TV village screen |
| `admin.html` | Bride and groom only: edit · hide · delete · **bulk delete selected** · **run events** · backup |

---

## 🩹 v3.3 Hotfix (2026-10) — no need to republish rules; just upload the `public` folder again
- **Second photo upload failure fixed**: on phones, Firestore now uses an in-memory cache instead of browser storage (IndexedDB)
  (this blocks the path where iOS and similar platforms disconnect storage after camera/album access, which previously caused all later writes to fail) · a fresh file input is created for every photo selection ·
  photo size ≤ 600KB (uploads faster on slow Wi‑Fi) · temporary network errors are retried 2 more times automatically · canvas memory is released immediately ·
  in in-app browsers such as KakaoTalk, show guidance + "🌐 Open in browser" (keeps the original writer identity)
- **Avatar gender**: added AI gender model (face-api age_gender, 0.4MB) — when confidence is 80% or higher, clothing, hair, beard, and accessories are adjusted to one gender
  (women: dresses, tied hair becomes an updo · men: suits/casual, avoids misclassifying long hair). Random characters for guests without photos are also kept gender-consistent
- **Skin tone**: after correcting the lighting (color temperature/brightness) of the whole photo, choose the skin tone by brightness. Unlike before, dark skin is no longer interpreted as "the lighting is dark" and made lighter
  Photos where no face is found do not adjust skin tone (previously, the color in the center of the photo — sky, wall — could become the skin tone)
- Bride’s English name: Sunkyung
- Real-device check (5 minutes after deploy): try uploading **three photos one by one in sequence** on iPhone Safari, Android Chrome, and inside KakaoTalk

## ⚠️ Must do every time you update (current v3.2)
1. **Republish Firestore rules**: paste the full `firestore.rules` into Console → Firestore → Rules and **Publish**
   (v3.2: avatar size limits · photo/audio format checks · server limit of 5 snaps per guest · remote-control spam throttling · add Sunkyung as admin)
2. Clean up old test data with `admin.html` → **Select all visible items → Delete selected**
3. **Check real Firebase 5 minutes after publishing** (rules are only validated on real Firebase):
   1. Create one guestbook entry on a phone — including photo + voice + time capsule → if "Arrived at the village!" appears, OK
   2. Upload one snap from the completion screen → ✓ 표시 + polaroid on TV
   3. Remote heart → TV character reacts
   4. Log in to `admin.html` → play photo/voice, save an ✏️ edit, click the 💐 bouquet button → TV reacts
   5. Delete selected test data
   - If any step says "failed", the rules were not published correctly → go back to step 1

---

## Testing / rehearsal = demo mode
Add `?demo=1` after the URL and it runs only inside that browser, without writing to Firebase. Tabs in the same browser stay in sync in real time.
- `village.html?demo=1&seed=20` → 20 sample guests
- `index.html?demo=1` → guestbook test (enters the TV tab immediately)
- `admin.html?demo=1` → admin screen test without login

Demo-only shortcuts (village): `D` add 1 guest · `L` add 5 guests (to check level-up) · `E` random emote

---

## Village screen (TV)
- **Activities**: guests move according to the activity they choose — 🎣 fishing at the dock/lakeside (sometimes "big catch!") · 💃 dance floor · 💬 fountain chat · 🍰 feast table · 📷 bride/groom [...]
- **Village level-ups** (based on guest count): 5 guests string lights → 10 guests fountain → 20 guests flower arch → 30 guests 囍 banner & periodic fireworks → 40 guests dogs and cats → 50 [...]
- **Phone remote**: when guests tap ❤️ heart / 👏 clap / 💃 dance / ⬆️ jump / 👋 go say hi, the character on TV reacts (gold ring under the feet + highlighted name tag [...]
- **Events** (admin page button or TV keyboard)
  - 💐 **Throw bouquet** (`B`): guests gather in front of the stage → 3·2·1 → the bride throws the bouquet and a random guest catches it
  - 📸 **Group photo** (`G`): everyone lines up in front of the stage → "one, two, three" → click! **PNG automatically saved on the TV computer**
  - 🎆 **Fireworks** (`X`)
- Other shortcuts: `F` fullscreen · `S` screenshot · `H` hide panel · `Q` hide QR · `N` day/night · `M` sound effects

## 🆕 v3 features

### 🎤 Voice congratulation messages
- On the guestbook screen: **record → listen → redo** (up to 15 seconds, `voiceMaxSec` in `config.js`)
- **Bride and groom only** can listen from the admin screen (protected by security rules). TV shows only "🎤 A voice message was left"
- Voice-only messages are OK (for older guests)
- iPhone Safari saves m4a, Android/Chrome saves webm → into the `voices/` folder in the backup ZIP

### 💌 One-year time capsule
- On the guestbook screen, the "To the two of you in one year" field is optional. **Before 2028-04-10, even admins cannot read it** — Firebase security rules block it using server time
- After the public date, open it from the admin screen → 💌 Time Capsule tab, and then it is included in the backup ZIP as `time-capsule.json`
- ⚠️ To change the public date, update both `config.js` `capsuleOpen` and `firestore.rules` `timestamp.date(2028, 4, 10)`
- Test: `admin.html?demo=1&unlock=1` (preview unlock only in demo mode)

### 👵 Simple mode (for older guests)
- First screen: **"Leave it easily (large text)"** → name · message (or voice) → photo → **enter immediately**
- Skips the dress-up and activity-selection steps; the character is auto-generated from the photo (random if there is no photo), and the activity is assigned automatically

### 📷 Guest snap photo sharing
- Guests who wrote in the guestbook can upload **up to 5 photos** each (optional one-line description). There are 4 upload entry points:
  1. Top of the guestbook **completion screen** (📸 Take now / 🖼 multiple from album)
  2. Pink **📷 Photo** button in the **phone village screen** remote bar at the bottom → upload while viewing the village, and the uploaded photo appears as a polaroid on the phone and on the village photo wall [...]
  3. When they return later, the **📷 Upload photo** button on the first screen (the **🏡 Back to village** button beside it jumps straight to the village screen with their character)
  4. **Kiosk** guest: scan the **"📱 Continue on my phone" QR** on the completion screen with the phone camera to continue photo uploads and remote control on that phone (the kiosk is shown for 25 seconds [...]
- Each photo shows upload progress (⏳ → ✓); failed photos can be tapped to retry. If the internet is slow, show "It will upload automatically when connected"
- **Table QR card**: if you make a QR from `https://<site-url>/#snap`, guests who already wrote in the guestbook open directly to the photo upload screen (guests who have not written yet see "Write in the guestbook[...]")
- The text under the QR on TV alternates between "Write in the guestbook" and "📷 Upload photos too"
- TV: when a new photo is uploaded, it appears in the center of the screen as a **polaroid** + banner, then starts a random slideshow every 45 seconds. It also cycles through small frames on the village photo wall
- Admin → 📷 Guest Snap tab: hide/delete/save on TV, full ZIP
- **To switch to approval mode**: set `config.js` `snapApproval: true` + change snaps in `firestore.rules` from `hidden == false` to `hidden == true` → only admin-approved photos appear on TV
- Size: compressed to 1280px (about 150–350KB each). Even 50 people × 5 photos stays under 10% of the free storage limit (1GiB)
- You can increase the per-person limit (`snapLimitPerGuest`), but since TV downloads all snaps, 10 or fewer per 100 guests is recommended
- Note: the kiosk continue QR includes that guest’s guestbook ID, so whoever scans it can upload photos under that guest’s name (shown for 25 seconds only)

### 📊 Wedding report
- Admin → 📊 Wedding Report tab: guest count · photo/voice/time-capsule/snap/remote-control counts, bride-side/groom-side ratio, arrival-time graph, popular activities/outfits, message [...]
- **🖼 Save report image** → Instagram portrait ratio (1080×1350) PNG. Also included as `report.png` in the full backup ZIP

> When upgrading to v3, **republish `firestore.rules`** (adds voice · time capsule · snap · remote-control counter rules).

## Range of visible remote reactions (to protect the free tier)
- **TV**: shows every guest’s remote reactions in real time
- **Guest phones**: my reaction + the real reactions of 6 nearby guests (rotated every 8 minutes) + light auto-reactions from characters on screen (purely local on the phone, zero server usage)
- This keeps Firestore reads under control even with many guest phones (estimated under ~10,000 reads/day for 50 guests and 30 phones, well below the 50,000 limit)

## 📱 Viewing the village on a phone (portrait/landscape fullscreen)
- After writing the guestbook, tap **🏡 View my character in the village** → opens `village.html?me=<my ID>` and
  - fills the screen in both portrait and landscape, with the camera following **my character**
  - lets you drag with your finger to look around the village (returns to your character after 7 seconds, or instantly with the 📍 button)
  - shows a **remote bar** at the bottom (heart · clap · dance · jump · greet + 📷 photo) so you can see your character react right on the phone
  - for someone who only opened the village link without writing in the guestbook, show a bottom **"✍️ Write in the guestbook and enter the village"** button
  - right-side buttons: ⛶ fullscreen · 🗺 show full map ↔ fit · 📍 my character
- Fullscreen: on Android, use the ⛶ button directly. **iPhone Safari blocks web fullscreen**, so tapping ⛶ shows
  the "Share → Add to Home Screen" guidance; opening from the home screen icon launches fullscreen without the address bar
- When an event (bouquet/group photo) starts, the phone screen automatically moves to the stage too. Automatic saving of the group photo PNG only works on TV (mouse environment)
- URL options: `?view=fit` (always show full map) / `?view=fill` (always fill the screen)

## About photo analysis (honest note)
- Uses open-source face recognition that runs in the browser (face-api / TensorFlow.js, about 2.4MB) → **photos are not sent to a server for analysis**, cost is 0 won
  (however, if "also send the photo to the bride and groom" is checked, the original is stored for admin only)
- Gender is inferred by AI and used only when confidence is 80% or higher (high accuracy on test photos; if blurry or side view, it becomes "unknown" → use only photo-based inference). Skin tone [...]
- Face shape, expression, and eye shape are relatively accurate because they are landmark-based, while **hair length / bangs / beard / glasses are estimated from pixel color analysis**, so they can vary depending on background and lighting [...]
- Works best when taken in front of a plain bright wall → recommend a bright background behind the kiosk

## 🔑 Entering the admin screen
- URL: `https://<site-url>/admin.html` → **Sign in with Google** (Jihwan `jihwan.patrick.lee@gmail.com`, Sunkyung `sunkyung0212@gmail.com`)
- You can also enter by tapping the **🔑 icon** at the top-left of the guestbook first screen. It is dimmed so guests don’t notice it, and it is not shown on the kiosk
- On a device where you have already signed in as admin once, the 🔑 changes clearly into a **"🔑 Admin"** button
- If a guest taps it, they only see the login screen; if the email is not an admin email, they cannot see any data (protected by Google sign-in + Firestore rules)
- Top of admin screen: quick links to 🏠 Guestbook / 🏡 Village (TV)

## Edit guestbook / delete test data
- `admin.html` → card **✏️ Edit**: edit name · category · message · activity · avatar (skin / hair / face / clothes, etc.) → reflected on TV immediately
- **Bulk delete**: select with checkboxes or **Select all visible items** → click **Delete selected** twice (confirmation)
- In emergencies: you can also delete directly from the Firebase console → Firestore → `guests` / `photos` collections

---

## Deployment (Netlify, free)
The website is just the **`public` folder** (`docs/`, `tests/`, `tools/`, `dev/` are for development — do not upload them).
1. Drag the **`public` folder** to <https://app.netlify.com/drop> (or, if using Git, the publish folder is `public`; this is already set in `netlify.toml`)
   — security response headers are in `public/_headers`, so they apply even for drag-and-drop deploys (`netlify.toml` is only read for Git-connected deploys)
2. Rename the site (e.g. `jihwan-sunkyung`)
3. Firebase → Authentication → Settings → add the Netlify address to **Authorized domains**
4. Publish `firestore.rules` (top of repository) — see ⚠️ above

Firebase config values are already in `public/js/config.js`. Just verify the names / dates / location / admin emails.
If you add admin emails, update the `isAdmin()` list in `firestore.rules` as well.

## Screen usability (v3.1 polish)
- A fixed **[Back] [Next] bar** appears at the bottom of every step → the Next button is visible without scrolling even on small phones (iPhone SE)
- Photo step: camera view is sized to the screen height; after taking a photo, only [Retake] [Use this character] remain
- Fixed buttons being pushed off-screen in kiosk (iPad portrait/landscape) and large-text mode
- Phone village: fixed the arrival banner covering the remote bar; reduced the top level panel size
- TV speech bubbles: balanced line breaks so the last line does not end with a single character

## Day-of checklist
- TV laptop: **`village.html?tv=1`** → double-click fullscreen → click once on the screen (sound effects on) → disable sleep
  (with `?tv=1`, even a touchscreen laptop always behaves as the TV screen. If the internet disconnects, an on-screen notice appears and reconnects automatically)
- Kiosk: `kiosk.html` + iPad Guided Access, bright background
- Host phone: sign in to `admin.html` and press the bouquet / group photo / fireworks buttons at the right time
  - **Google sign-in is blocked in browsers opened inside KakaoTalk or Instagram** → open with Safari / Chrome
  - If you tap another event while one is in progress, it queues and runs after the current event finishes
- If a rehearsal tab used `?demo=1`, it stays in demo mode until that tab closes → before the real event, either open once with **`?demo=0`** or open a fresh tab
- When finished: `admin.html` → full backup (ZIP), press `S` on TV to save a village screenshot

## Security · quality notes (v3.2 check results)
- Because guests write without logging in, you cannot completely stop someone from injecting data through the console using public config values. The rules limit size, format, [...]
- For stronger protection, enable **Firebase App Check (reCAPTCHA v3)** (Console → App Check, free). When enabled, writes from outside this app are blocked.
- "Hidden" means the item is not shown in TV/village; it does not make the data private. Delete problematic photos.
- Deleting a guest also deletes that guest’s snaps.

## Free tier (Spark)
20,000 writes/day, 50,000 reads/day, 1GiB storage. For 50 guests, guest writes are ~100 + remote emotes (1 write each, 3-second cooldown) amounting to only a few hundred writes, so there is plenty of room.

## File structure
```
public/                 ← website (folder uploaded to Netlify)
  index.html kiosk.html village.html admin.html
  js/config.js   ← names · dates · admin · level settings
  js/avatar.js   pixel avatar engine (22x34, face/hair parameters, 10 poses)
  js/face.js     photo analysis (face-api landmarks + pixel statistics)
  js/scene.js    top-down village map (tiles · props · paths) — original pixel art drawn entirely in code
  js/village.js  village simulation (pathfinding, activities, events, level-ups, remote control)
  js/guest.js    guest/kiosk flow     js/snaps.js snap uploader (shared by completion screen and phone village)
  js/admin.js    admin                 js/store.js Firebase/demo storage
  js/vendor/     face-api (MIT, includes TF.js) · qrcode-generator (MIT) · JSZip (MIT)
  fonts/         Galmuri pixel font (SIL OFL 1.1)
  _headers       Netlify response headers (nosniff · referrer policy)
firestore.rules         ← security rules to paste into Firebase Console
docs/v4/                ← v4 development design (18 features · work packages · day-of runbook)
tests/                  ← automated tests (`npm test`)
tools/                  ← local server (`npm run serve`) · kiosk.html generator
dev/face-lab/           ← experimental page for tuning face analysis (not deployed)
CLAUDE.md               ← work rules for Claude Code (Sonnet)
```
> If you modify `public/index.html`, run `npm run gen:kiosk` to regenerate `kiosk.html` (only the body class and title differ).

## Development · testing (v4)
```bash
npm i                 # once, for Playwright
npm run serve         # http://127.0.0.1:8123/index.html?demo=1
npm run test:quick    # 40-second check
npm test              # full automated tests (about 6–7 minutes)
```
v4 feature expansion plan and workflow: [`docs/v4/README.md`](docs/v4/README.md) · Claude Code prompts: [`docs/v4/PROMPTS.md`](docs/v4/PROMPTS.md) · Wedding day: [`docs/v4/06-runbook.md`](docs/v4/06-runbook.md)
