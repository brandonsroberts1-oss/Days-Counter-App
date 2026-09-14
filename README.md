# Freedays

A days-free counter for anything you're quitting — gambling, alcohol, substances,
overeating, scrolling, whatever you name it. It counts the days, banks the money
you didn't spend, records slip-ups honestly, and looks for the patterns behind them.

It installs to your phone's home screen in one tap. No app store, no account,
no sign-in. Everything stays on your device.

---

## Install it on your phone

Once the site is live (see **Deploy** below), open it in your phone's browser:

**iPhone / iPad — must be Safari**
1. Tap the **Share** button at the bottom of the screen.
2. Scroll down, tap **Add to Home Screen**.
3. Tap **Add**.

**Android — Chrome, Edge, Samsung Internet**
1. Tap **Install** in the app's top bar, or open the browser menu (⋮).
2. Tap **Install app** / **Add to Home screen**.
3. Confirm.

It then opens full-screen like any other app, works with no signal, and keeps
your data through reboots and browser restarts.

---

## What it does

**The counter**
- A live count of days free, with hours and minutes on day one so the first day still feels like progress.
- Hash marks — real tally marks, five to a group — alongside the written number.
- Best streak, current streak, and every streak you've ever run.

**Slips**
- Log a slip in a few taps: when, how heavy, what it cost, what set it off, and a note.
- The counter resets to zero; nothing else is lost. Money saved, notes, badges and history all stay.
- Logged a slip you didn't actually have? Remove it and the streak recalculates.

**Money**
- Enter what the habit typically costs and how often, once, during setup.
- Every free day earns that daily amount. The total ticks up live, to the cent.
- Each day on the calendar carries its own saved figure, and each slip carries what it cost.

**Calendar and journal**
- A month grid where free days, slip days and untracked days each have their own colour *and* their own glyph.
- Tap any day to read it, add a note, or log a slip you forgot.
- A daily check-in: mood, craving, stress, sleep, what kind of day it was, and free-text notes.
- Full-text search across everything you've written.

**Weather**
- Optional. Records daily conditions so they can be tested against your slip days.
- Uses [Open-Meteo](https://open-meteo.com) — free, no API key, no account. Only a latitude and
  longitude rounded to about a kilometre is sent. Switch it off and nothing leaves the device at all.

**Insights**
- Compares mood, craving, stress, sleep, temperature, rainfall and sunshine on slip days against clean days.
- Reports slips by weekday, by weather, by the tags you apply, by time of day, and by the triggers you name.
- Flags the day *before* a slip too — the lead indicator is usually the useful one.
- A "today's read" score built from your own history, with the reasons spelled out.
- Trend lines for mood and craving, and a column for every streak you've run.

**Badges and notifications**
- 30 milestones across days free, money saved, journal streaks, and starting again after a slip.
- Each one arrives as a phone notification naming the habit, the days, and the money:
  *"Congratulations — you've been free of Alcohol for 7 days and saved $105."*
- Plus an optional daily nudge to check in, at an hour you choose.

---

## How honest the insights are

A pattern engine that says whatever sounds good is worse than no pattern engine,
so there are floors built in:

| Rule | Why |
|---|---|
| No correlations until **10 check-ins and 3 slips** | Two data points can "prove" anything. |
| Every claim states its sample size | "on the 5 days you slipped" is part of the sentence, not a footnote. |
| Strength labels are capped by sample size | Fewer than 8 slips can never read "strong pattern", however neat the correlation. |
| Categories need 3+ observations | One rainy Tuesday is not a Tuesday problem. |
| Sliders you don't move aren't recorded | A skipped question would otherwise look like a calm, craving-free day. |
| Weather is labelled the weakest signal | Because it is. |
| Everything is phrased as a pattern, never a cause | The app can spot a correlation. It can't know why. |

The statistics themselves are plain: a point-biserial correlation between each
numeric factor and whether a day was a slip, and observed rates versus your base
rate for the categorical ones.

---

## Your data

- Stored in `localStorage` on your device, and nowhere else.
- No account, no server, no analytics, no tracking, no third-party scripts.
- The app asks the browser to mark the data as persistent, so routine cache-clearing won't take it.
- **Settings → Export** writes a JSON backup you should keep before changing phones.
- **Settings → Import** restores one.
- **Settings → Erase everything** deletes the lot, permanently.

### About notifications

These are *local* notifications: they're scheduled by the app, so they arrive
while Freedays is open or when you next open it. Pushing to a closed phone
requires a server holding a push subscription — which would mean sending your
data somewhere, so Freedays doesn't do it.

---

## Deploy it

The site is plain static files with no build step. To publish it free on GitHub Pages:

1. Push this repository to GitHub.
2. Go to **Settings → Pages**. Under **Build and deployment → Source**, choose
   **GitHub Actions**. This is a one-time switch — a workflow isn't permitted to
   turn Pages on for you, so the first deploy fails until it's set.
3. Push to the repository's default branch, or run the *Deploy to GitHub Pages*
   workflow by hand from the **Actions** tab. It publishes from whichever branch
   GitHub has set as the default, so the branch name doesn't matter.

It lands at `https://<your-username>.github.io/<repo-name>/`. Every path in the app
is relative, so the sub-folder is fine.

To run it locally, serve the folder over HTTP — service workers and installation
need a real origin, so opening `index.html` from the filesystem won't work:

```bash
npx serve .        # or: python3 -m http.server 8000
```

---

## How it's built

No framework, no bundler, no dependencies — plain ES modules, so what you read is
what runs in the browser.

```
index.html               app shell
manifest.webmanifest     install metadata
sw.js                    service worker: offline shell, never caches weather
src/
  main.js                boot, tab routing, background housekeeping
  store.js               localStorage persistence, import/export
  model.js               derived values: streaks, money, day status
  insights.js            the correlation and trend engine
  achievements.js        milestones and their congratulation copy
  weather.js             Open-Meteo client and WMO code mapping
  notify.js              local notifications and the daily nudge
  charts.js              hand-written inline SVG charts and tally marks
  sheets.js              check-in, slip and day-detail forms
  ui.js                  icons, bottom sheets, toasts
  install.js             home-screen install and theming
  styles.css             the whole design system
  views/                 home · calendar · journal · insights · settings · setup
tools/make-icons.mjs     generates the PNG icons from scratch (no image libraries)
```

Design notes: the two chart series hues and the free/slip status hues were checked
for colour-blind separation against both the light and dark surfaces. Status is never
communicated by colour alone — every state carries a glyph and a text label, and every
chart has a "show the numbers" table behind it. Charts never put two different scales
on one axis; mood and craving are two charts for that reason.

---

## One thing worth saying

Freedays is a tracker, not treatment. Stopping some substances — alcohol and
benzodiazepines especially — can be medically dangerous without supervision.
If that might be you, please involve a doctor.

And the counter resetting is not a failure of the app or of you. It's the part
of the design that gets used most.
