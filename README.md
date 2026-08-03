# Keplinger Lake Expenses

A single-file household expense manager. One `.html` file, no build step, no
server, no dependencies — open it in a browser and it works. Data stays on your
machine, and syncs between computers through a JSON file you keep in iCloud
Drive (or Dropbox, or anywhere that syncs files).

Built for a two-person household that had outgrown a spreadsheet but didn't want
a subscription, an account, or its finances sitting on someone else's server.

## What it does

**Monthly ledger** — a year of expenses as an editable grid: 12 month columns
plus a year total. Type a number, it saves. Each expense can be split evenly,
assigned to one person, or divided by custom percentages, shown as a small
colour bar on the row.

**Credit card statements without double-counting** — mark an expense as "part
of" a card statement and it becomes an itemized line under it. The statement's
un-itemized balance appears as a computed "Other on …" row. Only the statement
counts toward the grand total, so nothing is counted twice, while each itemized
expense still gets its own split for per-person shares.

**Split purchases** — one-off shared costs (a furniture buy, a vet bill). Whoever
paid is credited, the other person's share lands on their monthly total, and
balances net out pairwise into a settle-up summary.

**Year summary** — per-expense year-to-date, monthly average, projected annual,
and each person's share.

## Getting started

**Use it in the browser** — the app is published with GitHub Pages, so it runs
straight from the repository. No install, nothing to download.

**Or run it from your own machine** — download `expense-manager.html` and open
it (double-click, or drag it into a browser window). The file is self-contained;
opening it from disk works offline and identically.

Either way, choose **Import data file** and pick `sample-data.json` to explore
with fictional numbers, or **Start fresh** to begin your own.

Nothing you enter leaves your browser in either mode. Serving over `https` does
have one practical advantage: browsers only reliably remember your chosen sync
file on a secure origin, so the hosted version won't ask you to re-pick it each
session the way a `file://` page can.

## Syncing between computers

Two backends, chosen in **Settings → Sync between computers**. Both use the same
push / pull / conflict model; only the transport differs.

### Option A — a file in iCloud Drive (no credentials)

Your working copy lives in the browser's local storage. To share it with another
computer, point the app at a single JSON file kept in a synced folder:

1. On the first computer, click **Sync** and save the file into iCloud Drive
2. On the second, click **Load from sync file** and pick that same file
3. From then on, **Sync** pushes your changes and **Load latest** pulls theirs

Every save stamps a revision and a device name. If both computers edited since
they last matched, the write is blocked and you're shown both copies — device,
time, and how much each holds — so you can choose. Whichever you don't pick is
downloaded as a backup first.

**Browser support matters here.** Chrome, Edge and Arc implement the
[File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API),
so the app writes your chosen file in place — one click, and optionally
automatic after each change. Safari and Firefox don't, so Sync falls back to
saving into your downloads folder, which you then move into place yourself. If
you sync regularly, use a Chromium browser.

Only enable auto-sync on one computer. If two write while both are open, the
sync service will produce conflicted copies the app can't see.

### Option B — a private GitHub repository

Point the app at a JSON file in a **private** repo and it reads and writes that
file through the GitHub Contents API. You get full version history, and it works
on any machine, not just Apple ones. In Settings, fill in the account, repo, file
path and branch, then paste an access token.

Use a **fine-grained** personal access token limited to that one repository, with
**Contents: Read and write** and nothing else. Then a leaked token exposes that
repo alone, not your account.

GitHub returns the file's `sha` on every read and requires it on write, so a
write built on a stale read is rejected by GitHub itself — a second guard
underneath the app's own revision check.

**Where you run the app matters when a token is involved.** Browser storage is
per-origin, and every GitHub Pages project site shares one origin
(`https://<user>.github.io`, regardless of path). A token saved there is readable
by any other site you publish under that account. So:

- Use the **hosted site** for the file-based backend, or just to try the app
- Use a **local copy** of `expense-manager.html` when using a GitHub token

The app detects a `*.github.io` origin and warns you in Settings.

The token is kept in this browser's `localStorage` under its own key. It is never
written into your data file, so it cannot travel through a sync or an export.

## Data and privacy

No account, no network calls, no analytics, no telemetry. The app never contacts
a server — everything happens in the page.

Your figures live in two places you control: the browser's `localStorage`, and
whatever JSON file you choose as the sync file. **No financial data is committed
to this repository.** `.gitignore` excludes every `.json` except the fake
`sample-data.json`, so exports and sync files dropped in this folder stay out of
git by default.

`sample-data.json` is invented — fictional people, fictional amounts.

Clearing your browser's site data erases the local copy, so keep the sync file
somewhere backed up. It doubles as your backup.

## Keyboard and display notes

- Click any expense **name** to rename it, change its split or due day, link it
  to a card statement, reorder it, or delete it
- Renaming or deleting offers to apply the change to your other years — amounts
  are never propagated, only the settings
- **Compact rows** in the footer hides the split bar and due day to fit roughly
  a third more rows on screen
- The grid sizes itself to the window, so the header stays put and only the rows
  scroll — usually they don't need to

## Browser support

| Browser | App | In-place file sync |
| --- | --- | --- |
| Chrome / Edge / Arc | Yes | Yes, with optional auto-sync |
| Safari | Yes | Falls back to downloads folder |
| Firefox | Yes | Falls back to downloads folder |

Column-hover highlighting uses CSS `:has()`, supported in Safari 15.4+ and
Chrome 105+. Older browsers lose the highlight but nothing else.

## License

MIT — see [LICENSE](LICENSE).
