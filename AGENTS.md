# Dairy App — Agent Knowledge Base & Architecture Guide

> **CRITICAL**: This file is permanently loaded into the AI agent's memory on every turn. 
> Consult this guide directly before asking questions, searching files, or re-analyzing the codebase.

---

## 1. Project Overview & Tech Stack
- **Framework**: React Native + Expo (SDK 52), React 18, TypeScript.
- **Platforms**: Mobile (Android / iOS) + PWA Web Application.
- **Live Deployment**: Hosted on GitHub Pages at `https://somveer01.github.io/dairy_app`.
- **Database & Sync**:
  - **Local Persistence**: Permanent SQLite / HTML5 LocalStorage via `StorageService`.
  - **Cloud Sync**: Firebase Realtime Database / Cloud Firestore (`firebaseService.ts`).
  - **Offline First**: Works 100% offline without internet connection.

---

## 2. Codebase Map & Exact File Roles

### Screens (`src/screens/`):
- `register/DailyRegisterScreen.tsx`:
  - Daily milk delivery register.
  - Sessions: `Morning (सुबह)`, `Evening (शाम)`, `Custom (अन्य समय)`.
  - Date Navigator in `DD-MMM-YYYY` format with day-stepper.
  - Quick action: `+ Mark All (सभी का मार्क करें)`.
  - Direct 1-tap delete (`🗑️`) and edit (`✏️`) on recorded customer rows.
  - Quick payment status toggling (`✓ Paid` / `₹ Unpaid`).
- `reports/DueReportsScreen.tsx`:
  - Due & billing report with 3 filter modes:
    1. `📅 Month-wise (मासिक)`: Calendar month picker with year switcher and bilingual month tiles.
    2. `🗓️ Custom Range (कस्टम तारीख)`: Single horizontal row with From Date card, To Date card, and Search button (`singleRowDateBar`), plus presets (`1-15`, `16-End`, `Full Month`).
    3. `♾️ All Dues (कुल बकाया)`: Lifetime outstanding due summary.
  - Interactive Tap-To-Pick Calendar Modal for selecting From Date & To Date.
  - Displays **Delivered Days vs Total Range Days** (e.g. `📅 8/30 Days` / `8/30 दिन`) on both summary banner and individual customer cards.
  - **Date-Wise Customer Delivery Report Modal**: Sequential day-by-day audit (delivers, missing days, Cow/Buffalo breakdowns, and quick "+ Log Milk" button).
  - One-tap WhatsApp billing and payment recording modal.
- `customers/CustomerListScreen.tsx`:
  - Customer directory.
  - Top layout: Dedicated Search bar on row 1; `📱 Contacts` and `+ Add Customer` action buttons on row 2.
  - Add / Edit / Delete customer modal with bilingual labels.
- `dashboard/DashboardScreen.tsx`:
  - Home dashboard with real-time KPI metrics (Today's milk volume, Today's billed ₹, Total outstanding dues).
  - PWA Install card for mobile browser visitors.
  - Quick action shortcuts.
- `settings/SettingsScreen.tsx`:
  - Dairy farm profile setup (Business name, owner name).
  - Database management (Data reset, remove customers, inspect stored entries).
  - Share backup (JSON export) and Cloud sync.
  - Language toggle: `English (EN)` vs `हिंदी (Hindi)` with instant re-render.
  *(Note: Staff training video has been removed to prevent mobile browser crashes).*
- `auth/LoginScreen.tsx`:
  - Supplier login and account authentication with password visibility toggle.

### Components (`src/components/`):
- `GlobalAlertModal.tsx`: Native in-app confirmation and alert dialog. Replaces browser `window.confirm()` / `window.alert()` to completely eliminate `"somveer01.github.io says"` dialogs.
- `InstallAppModal.tsx`: Step-by-step visual installation instructions for Android (Chrome) and iOS (Safari).

### Services (`src/services/`):
- `storageService.ts`: Local permanent data layer (Customers, MilkEntries, Payments, Settings).
- `whatsappService.ts`: Formats and triggers WhatsApp messages:
  - `sendBillViaWhatsApp`: Summary due bill with customer name, period, delivered days, cow/buffalo volume, billed amount, and net due.
  - `sendItemizedDatewiseBillViaWhatsApp`: Detailed day-by-day delivery log with delivery checkmarks, missing day alerts, and rate breakdown.
- `firebaseService.ts`: Firebase cloud sync for multi-device backup and restore.

### Core Utilities & Context:
- `utils/dateUtils.ts`:
  - `formatToDisplayDate(date)`: Converts YYYY-MM-DD or Date to uppercase `DD-MMM-YYYY` (e.g. `08-SEP-2026`).
  - `parseToIsoDate(date)`: Converts `DD-MMM-YYYY` back to `YYYY-MM-DD` for DB filtering.
  - `getTodayDisplayDate()`: Returns today in `DD-MMM-YYYY`.
  - `shiftDisplayDate(displayDate, days)`: Stepper helper (+1 / -1 day).
- `localization/i18n.ts`: Complete English (`en`) and Hindi (`hi`) dictionary for all text, labels, and alerts.
- `context/AppContext.tsx`: Global React Context providing `customers`, `milkEntries`, `payments`, `supplier`, `lang`, `setLang`, `t`, `showAlert`, `showConfirm`.
- `types/index.ts`: Type interfaces (`Customer`, `MilkEntry`, `Payment`, `CustomerDueSummary`, `Supplier`).

---

## 3. Strict Coding & Architectural Rules

### 1. Date Calculations & Timezone Safety
- **NEVER use `cur.toISOString().split('T')[0]` for date looping or display**:
  Converting local midnight (`00:00:00 IST`) to ISO shifts the timestamp to UTC (`18:30:00` previous day), which causes off-by-one errors (cuts off the 30th/last day, adds an extra day from the previous month, and breaks delivery matching).
- **ALWAYS use local components or `toLocalIso(d)`**:
  ```ts
  const toLocalIso = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  ```
- **ALWAYS initialize date objects at 12:00 noon** (`new Date(year, monthIndex, day, 12, 0, 0)`) when performing arithmetic or ranges to prevent daylight saving or timezone boundary crossings.

### 2. User-Facing Date Formats
- All visible dates in inputs, labels, steppers, and modals MUST be formatted as **`DD-MMM-YYYY`** (e.g., `08-SEP-2026`).
- Internal database storage and range filtering (`entry.date >= startIso && entry.date <= endIso`) MUST use **`YYYY-MM-DD`**.

### 3. Popups & Dialogs
- **NEVER use raw browser dialogs** (`window.alert`, `window.confirm`, or `Alert.alert`).
- **ALWAYS use the in-app `GlobalAlertModal` via AppContext**:
  - Information / Warning: `showAlert('Title', 'Message', onConfirm)`
  - Confirmation / Deletion: `showConfirm('Title', 'Message', onConfirm, onCancel, confirmText, isDestructive)`

### 4. Bilingual Support (Hindi + English)
- Every UI element must support English and Hindi dynamically using `t.[key]` or `lang === 'hi' ? '...' : '...'`.
- Switching language updates `window.localStorage` and remounts navigation via `key={lang}` in `Tab.Navigator`.

---

## 4. Build, Verification & Deployment Pipeline
Always execute these exact commands in sequence when delivering changes:
```powershell
# 1. Type Check (Must pass with 0 errors)
npx tsc --noEmit

# 2. Export Web Bundle
npx expo export -p web

# 3. Post-Build PWA Script (Patches manifest, service worker, base paths)
node scripts/post_build.js

# 4. Deploy to GitHub Pages
npx gh-pages -d dist --dotfiles

# 5. Git Commit & Push
git add src/
git commit -m "Descriptive commit message"
git push origin main
```
