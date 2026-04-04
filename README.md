# 💰 Meshack's Budget Tracker

A free, self-hosted budget tracking web app that reads and writes directly to your Google Drive spreadsheet — exactly matching your existing **Meshack's Spending Habit** format.

---

## ✨ Features

- 📊 **Dashboard** — income, spent, balance, savings rate at a glance
- 📉 **Budget bars** — progress bars for each category (Needs/Wants/Goals/Charitable)
- 📈 **Chart** — budgeted vs actual spending per category
- ➕ **Add expenses & income** from the app — saves instantly to your sheet
- 📋 **History** — filterable transaction list with totals
- 🗓️ **Auto-creates new month sheets** — when you log an entry for May, a "May" sheet is automatically created in your spreadsheet following the same structure as Mar/Apr
- 📱 **Mobile-friendly** — works great on phone

---

## 🚀 Deployment

### Option 1 — GitHub Pages (recommended, free)

1. Create a new **GitHub repository** (can be private or public)
2. Upload **`index.html`** into the repo root
3. Go to **Settings → Pages → Source: Deploy from branch → `main` / `root`**
4. Your app will be live at `https://YOUR_USERNAME.github.io/YOUR_REPO`

### Option 2 — Netlify (also free)

1. Go to [netlify.com](https://netlify.com) → "Add new site → Deploy manually"
2. Drag and drop the folder containing `index.html`
3. Done — Netlify gives you a URL instantly

---

## 🔌 Connecting to Your Google Spreadsheet

The app needs a tiny Google Apps Script backend to read/write your Drive file.
This is **completely free** — Google gives you plenty of quota.

### Step 1 — Open Apps Script

Open your spreadsheet → click **Extensions → Apps Script**.

### Step 2 — Paste the script

Delete everything in the editor and paste the full contents of **`Code.gs`** from this download.

At the very top of `Code.gs`, replace:
```
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';
```
with your actual spreadsheet ID. You can find it in the URL:
```
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
                                        ↑ this part
```

### Step 3 — Deploy

1. Click **Deploy → New deployment**
2. Click the gear icon next to "Select type" → choose **Web app**
3. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**
5. Authorise the script when prompted (it only needs access to your own spreadsheet)
6. Copy the **Web app URL** — it looks like:
   `https://script.google.com/macros/s/AKfy.../exec`

### Step 4 — Connect the app

Open your budget tracker web app → click the **⚙️ gear icon** → paste the URL → **Save & Connect**.

That's it! Your data will now sync with Google Drive.

---

## 📁 Your Spreadsheet Structure

The app works with your existing **Mar** and **Apr** sheets exactly as-is:

| Sheet | Purpose |
|-------|---------|
| `Mar` | March expenses & income |
| `Apr` | April expenses & income (current) |
| `May` | Auto-created when you first log a May entry |
| ... | And so on for each new month |

Each monthly sheet follows your layout:
- **Rows 7–10:** Income sources (Source, Date, Expected, Actual, Comment)
- **Row 11:** BALANCE (auto-calculated)
- **Rows 15–78:** Expense entries (Source, Date, Category, Actual, Comment)

Budget categories:
| Code | Name | Allocation |
|------|------|------------|
| `N`  | Need | 40% |
| `W`  | Want | 30% |
| `G`  | Goal | 12% |
| `C`  | Charitable | 18% |

---

## 🔄 Re-deploying after changes

If you ever update `Code.gs`, you must create a **New deployment** (not update existing) for the changes to take effect. Then update the URL in the app settings.

---

## 🔒 Privacy

- Your data stays in **your** Google account — nothing is sent to any third party
- The Apps Script runs under your Google account's permissions
- The web app (index.html) only communicates with your own script URL
