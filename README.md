# Band Practice Scheduler

A minimal, phone-first page where the band suggests practice dates and everyone taps whether they can make it.

- **Front end:** `index.html` (one file, no build step), hosted free on GitHub Pages
- **Back end:** `Code.gs`, a Google Apps Script attached to a Google Sheet (free)
- **Optional:** confirmed practices are added to the band Google Calendar automatically

Open `index.html` in a browser before setup and it runs in **demo mode** with sample data, so you can try it first.

---

## Setup (about 15 minutes)

### 1. Create the Sheet and script

1. Create a new Google Sheet, e.g. "Band Practice".
2. Go to **Extensions > Apps Script**.
3. Delete the sample code and paste in all of `Code.gs`. Save.
4. Go to **Project Settings** (gear icon) and set **Time zone** to `(GMT-04:00) Eastern Time - New York`.
5. Back in the editor, choose the `setup` function from the dropdown and click **Run**. Approve the permissions prompt. (Because it's your own script, Google will say it's "unverified". Click **Advanced > Go to project**.) This creates the `Dates` and `Votes` tabs.

### 2. Optional settings (Script Properties)

In **Project Settings > Script Properties**, add:

| Property | What it does |
|---|---|
| `BAND_CODE` | A shared passcode, e.g. `riffs2026`. Each member types it once, and their phone remembers it. This keeps random people out, since the site URL is public. Recommended. |
| `CALENDAR_ID` | Your band Google Calendar ID. Confirmed practices get added as events, and un-confirming or removing a date deletes the event. Find it in Google Calendar under **Settings > (band calendar) > Integrate calendar > Calendar ID**. Your Google account must be able to edit that calendar. |

If you add `CALENDAR_ID`, run `setup` once more so Google asks for Calendar permission.

Practice times and length are set at the top of `Code.gs` (`EVENING_START` 7:00 pm, `AFTERNOON_START` 1:00 pm, `DURATION_HOURS` 3).

### 3. Deploy the script as a web app

1. Click **Deploy > New deployment**, then the gear icon and **Web app**.
2. Set **Execute as:** *Me* and **Who has access:** *Anyone*.
3. Click **Deploy** and copy the **Web app URL** (ends in `/exec`).

> Whenever you change `Code.gs` later, use **Deploy > Manage deployments > Edit (pencil) > Version: New version**. That keeps the same URL. Creating a *new* deployment gives you a new URL.

### 4. Connect the front end

Open `index.html` and paste the URL near the top:

```js
const API_URL = 'https://script.google.com/macros/s/XXXXXXXX/exec';
```

### 5. Host on GitHub Pages

1. Create a new public GitHub repo, e.g. `band-practice`, and push `index.html` to it (`Code.gs` and this README can go in too).
2. In the repo, go to **Settings > Pages**, choose **Deploy from a branch**, select `main` and `/ (root)`, and click **Save**.
3. After a minute the site is live at `https://<your-username>.github.io/band-practice/`.

### 6. Share with the band

Text the link to the group, plus the band code if you set one. Suggest that everyone adds it to their home screen so it opens like an app:

- **iPhone (Safari):** Share button > **Add to Home Screen**
- **Android (Chrome):** ⋮ menu > **Add to Home screen**

---

## How it works for the band

- **First visit:** tap your name. The phone remembers it (tap your name at the top to switch).
- **Suggest dates:** tap **Suggest dates** and pick days. Weeknights default to *Evening*. Weekends default to *Either*, so people can answer *Aft*, *Eve* or *Either*. You can change any of these before sending. You're automatically marked as available on dates you suggest.
- **Answer:** tap **✓ Can**, **? Maybe** or **✗ Can't** on each date. Tap your answer again to clear it.
- **At a glance:** each card shows who's in, who can't make it and who hasn't answered yet. A date everyone can make gets an **Everyone's in** badge. **Most free** sorts the best dates to the top.
- **Lock it in:** tap **⋯ > Confirm** and the date moves to **Next practice** (and onto the band calendar, if set up). The same menu lets you un-confirm or remove a date.
- Past dates drop off automatically. The page refreshes itself when you reopen it.

## Changing members

Edit the `MEMBERS` list at the top of `Code.gs` and deploy a new version (see the note in step 3). The page picks up the list automatically. `DEFAULT_MEMBERS` in `index.html` is only used in demo mode.

## Notes

- The Sheet is the database. You can open it to see or fix anything by hand. Keep dates as `YYYY-MM-DD` text.
- Everything is free: GitHub Pages hosting plus Apps Script quotas that are far above what six people will use.
