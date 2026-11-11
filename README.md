# CARDET License Manager (prototype)

A small ERP-style app to manage the software subscriptions and licences CARDET pays for.
It replaces the "SaaS / Software Inventory V2" spreadsheet.

- **Subscriptions**: one clean record per tool, holding cost, currency, billing cycle, entity, card, owner, departments and where credentials live (never the passwords themselves).
- **Renewals**: a month-by-month calendar plus a "decision needed" list for renewal dates that have passed. Auto-renewing tools roll forward automatically.
- **Dashboard**: annual spend in EUR by department, vendor, card and entity, and expected charges for the next 12 months.
- **People & seats**: who holds which licence and seat utilisation. One-click offboarding revokes every seat.
- **Transactions**: import a card/bank CSV. Charges are matched to subscriptions automatically and you confirm them; unknown spend gets flagged.
- **Data health and tasks**: missing or doubtful data, plus follow-ups (discounts to request, renewals to question).
- **Activity log**: every change, with the name the user typed at login.

Stack: Node 24, Express 5, the built-in `node:sqlite`, React 19, Vite, and Mantine 9. It has no native dependencies.

## Run locally

```bash
npm install
npm run dev          # API on :3001 + Vite on http://localhost:5173
```

Log in with `demo` / `demo`, or with whatever you set in `DEMO_USER` / `DEMO_PASSWORD`.

Other commands:

| Command | What it does |
|---|---|
| `npm test` | unit tests: date/cost parsing for every value in the sheet, renewals, matching |
| `npm run seed` | wipe `data/app.db` and reload the demo data |
| `npm run import-xlsx` | regenerate `seed/data.json` from `SaaS _ Software Inventory V2.xlsx` |
| `npm run build && npm start` | production build served by Express on :3001 |

## Where the data comes from

`scripts/import-xlsx.js` converts the spreadsheet into `seed/data.json`. Generic parsing lives in `server/lib/` and is unit tested. Decisions that needed human judgement are in curated maps at the top of the script: who "Pambos" is, that "Designers" means the Design department, notes typed into the wrong column, and so on. Anything ambiguous gets a review flag that shows up on the Data Health page.

Assumptions worth knowing:
- Amounts without a currency symbol are treated as **EUR**.
- USD is converted at **0.89** (derived from the 2025 card statements in the "AI" sheet). You can change it under Settings → Exchange rates.

## Deploy on Render (free)

1. Push this folder to a **private** GitHub repo. The seed contains internal emails and card last-4 digits. `*.xlsx` is git-ignored.
2. In Render, choose **New → Blueprint** and pick the repo. It reads `render.yaml`.
3. Set `DEMO_USER` and `DEMO_PASSWORD` when prompted. `SESSION_SECRET` is generated for you.

Free-tier behaviour:
- The service sleeps after about 15 minutes idle, so the first visit takes about a minute.
- The database resets to the spreadsheet data on every restart or deploy.

To keep edits, attach a Render disk and set `DB_PATH=/var/data/app.db` (paid plan), or move to Postgres.
