<h1 align="center">IOG Dashboard</h1>

<p align="center">
  A better way to understand your <strong>Octopus Intelligent Go</strong> electricity costs.<br/>
  Open source. Self-hostable. Installable as a phone app.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind-4-38BDF8?logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/PWA-Installable-5A0FC8?logo=pwa&logoColor=white" alt="PWA" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License" />
</p>

---

## What is this?

If you're an Octopus Energy customer on the **Intelligent Octopus Go** (IOG) tariff, you get cheap overnight electricity for EV charging. Octopus "smart charges" your car by scheduling dispatch slots at off-peak rates, typically between 23:30 and 05:30.

The problem is that the official Octopus app barely shows you what's happening. You can see how many kWh you used, but not *what it cost*, *which slots were smart-charged*, or *how much your EV used vs the rest of your house*.

This dashboard fills that gap.

---

## Is this for me?

**Yes** if you:
- Are an Octopus Energy customer in the UK
- Are on the **Intelligent Octopus Go** tariff (or considering it)
- Have a smart meter (SMETS2)
- Want to understand your half-hourly costs, not just usage

**You'll also need:**
- Your Octopus API key ([find it here](https://octopus.energy/dashboard/new/accounts/personal-details/api-access))
- Your account number (starts with `A-`, shown on your Octopus dashboard)
- About 5 minutes to set up

**Nice to have:**
- An Ohme (or other SmartFlex-linked) EV charger — enables the EV vs household energy split

---

## What makes this better than the Octopus app?

| | Octopus App | IOG Dashboard |
|-|:-----------:|:-------------:|
| Half-hourly bars colour-coded by rate | No | Yes |
| See which slots were smart-charged | No | Yes |
| Planned vs completed dispatch status | No | Yes |
| EV charging vs household split | No | Yes |
| Per-slot cost with rate applied | No | Yes |
| Monthly bill projection | No | Yes |
| Compare IOG vs Flexible vs Agile | No | Yes |
| Tariff expiry countdown | Buried | Prominent banner |
| Custom rate overrides | No | Yes |
| Weekly / monthly / yearly trends | Limited | Full charts + KPIs |
| Savings vs all-peak pricing | No | Exact figure |
| Live view from smart meter | Delayed hours | ~30 min lag |
| Installable phone app | No | PWA |
| Self-hostable / open source | No | MIT licensed |

The Octopus app tells you *how much energy you used*. This tells you *how much it cost, why, and whether you're on the best deal*.

---

## The views

- **Daily** — half-hourly consumption colour-coded by rate type, KPI cards, cost breakdown
- **Live** — today so far, with an animated current-slot indicator
- **Weekly / monthly / yearly** — cost and kWh trends with per-period KPIs
- **EV split + tariff comparison** — charger-reported kWh vs household, plus what you'd have paid on Flexible or Agile
- **Settings** — account overview, live rates, and rate overrides

<!-- Screenshots live in docs/screenshots/ (currently empty). Drop in hero.png,
     daily.png, live.png, ev-split.png and settings.png, then re-add <img> tags
     here. Your browser's responsive mode at 375px gives good mobile shots. -->

---

## Two ways to run it

The app has two modes and picks one automatically based on the environment variables it finds.

| | **Single user** (default) | **Multi user** (optional) |
|-|-|-|
| For | You, on your laptop, NAS, Pi or Docker host | A shared instance for several households |
| Database | None | Supabase (Postgres) |
| Login | None | Email magic link |
| Credentials from | `OCTOPUS_*` environment variables | Encrypted per user in Supabase |
| Extra setup | None | Supabase project, SQL migrations, encryption key |

**If you're running this locally, in Docker, or as a Portainer stack, you want single user mode. You do not need Supabase, a database, or an account** — just a handful of `OCTOPUS_*` environment variables, and `/setup` works most of them out for you. Everything about Supabase below is optional and safe to ignore.

> ⚠️ **Single user mode has no login.** Anyone who can reach the URL sees your energy data. Keep it on localhost, your home LAN, or behind your own VPN or reverse-proxy auth. Don't port-forward it to the open internet. If you need a public instance, use multi user mode.

---

## Run with Docker

The easiest way to self-host. Single user mode, no database.

### Docker Compose

```bash
git clone https://github.com/observethenoyes/iogo-live.git
cd iogo-live
cp .env.example .env          # fill in OCTOPUS_API_KEY and OCTOPUS_ACCOUNT_NUMBER
docker compose up -d --build
```

Open [localhost:3000/setup](http://localhost:3000/setup). It discovers your MPAN, meter serial and tariff codes from the Octopus API and shows you a block of environment variables. Paste those into `.env`, then:

```bash
docker compose up -d --force-recreate
```

Open [localhost:3000](http://localhost:3000) and you're running.

### Portainer stack

`docker-compose.yml` builds from source, so use the **Repository** method rather than pasting into the web editor (the editor has no build context).

1. **Stacks → Add stack → Repository**
2. Repository URL: `https://github.com/observethenoyes/iogo-live`
3. Compose path: `docker-compose.yml`
4. Under **Environment variables**, add:

   | Name | Value |
   |------|-------|
   | `OCTOPUS_API_KEY` | `sk_live_...` |
   | `OCTOPUS_ACCOUNT_NUMBER` | `A-XXXXXXXX` |

5. **Deploy the stack**, then open `http://<host>:3000/setup`
6. Add the four values `/setup` discovers (`OCTOPUS_MPAN`, `OCTOPUS_METER_SERIAL`, `OCTOPUS_PRODUCT_CODE`, `OCTOPUS_TARIFF_CODE`) to the same stack environment variables and redeploy

The compose file also accepts the three optional rate overrides. Anything you leave unset falls back to the live Octopus rates.

---

## Quick Start (local development)

### 1. Clone and install

```bash
git clone https://github.com/observethenoyes/iogo-live.git
cd iogo-live
npm install
```

### 2. Add your API key

```bash
cp .env.example .env.local
```

Open `.env.local` and set just these two values:

```env
OCTOPUS_API_KEY=sk_live_xxxxxxxxxxxxxxxxxxxx
OCTOPUS_ACCOUNT_NUMBER=A-XXXXXXXX
```

### 3. Start the app

```bash
npm run dev
```

The dashboard needs six `OCTOPUS_*` values, so with only two set it sends you to [/setup](http://localhost:3000/setup). That page reads your account from the Octopus API and works out the other four (MPAN, meter serial, product code, tariff code), along with your current rates.

In single user mode `/setup` gives you a **copyable block of environment variables** rather than a save button — there's no database to save them to. Paste the block into `.env.local`, restart `npm run dev`, and open [localhost:3000](http://localhost:3000).

> In multi user mode the same page shows a **Save** button instead, because credentials go to Supabase against your account.

> **Prefer manual config?** Skip `/setup` and fill in all six variables yourself. See [Environment Variables](#environment-variables) below.

---

## Other ways to deploy

### Vercel

1. Fork this repo
2. Import it on [vercel.com/new](https://vercel.com/new)
3. Add `OCTOPUS_API_KEY` and `OCTOPUS_ACCOUNT_NUMBER` as environment variables, then deploy
4. Open `/setup`, copy the four discovered values into your Vercel environment variables, and redeploy

All Octopus calls happen server-side. Your API key never reaches the browser.

Remember that a Vercel deployment is a public URL. In single user mode that means public access to your energy data — use multi user mode for anything you don't want open.

### Any Node.js host

Requires **Node 20.9 or newer** (a Next.js 16 requirement).

`next.config.ts` sets `output: "standalone"` so the Docker image can ship a self-contained server. A side effect is that `npm start` does **not** work:

```
⚠ "next start" does not work with "output: standalone" configuration.
  Use "node .next/standalone/server.js" instead.
```

The standalone server needs the static assets copied beside it:

```bash
npm ci
npm run build
cp -r public .next/standalone/
cp -r .next/static .next/standalone/.next/
node .next/standalone/server.js      # honours PORT and HOSTNAME, defaults to 3000
```

Fine on Railway, Fly.io, a Raspberry Pi, or anything else on Node 20.9+. If you only ever deploy to a bare Node host and want plain `npm start` back, drop `output: "standalone"` from `next.config.ts` — but the Dockerfile depends on it.

---

## Install on Your Phone

The dashboard is a **Progressive Web App**. On your phone's browser:

- **iOS Safari**: tap Share > Add to Home Screen
- **Android Chrome**: tap the menu > Install app

You get a full-screen app with no browser chrome, a proper icon, and dark theme that matches your system.

---

## Features in Detail

### Half-Hourly Consumption Chart
Every 30-minute slot for the day, colour-coded:
- **Green** — off-peak window (23:30 - 05:30)
- **Purple** — dispatch slots (smart-charged by Octopus)
- **Orange** — peak rate

Tap any bar for a tooltip showing the rate applied, kWh consumed, and cost in pence.

### Smart Charge Dispatch Timeline
See every dispatch slot Octopus scheduled for your EV:
- **Planned** — dashed border, amber badge, scheduled but not yet confirmed
- **Completed** — solid border, green badge, confirmed by Octopus
- Duration, kWh, and start/end times for each

### EV vs Household Split
If your charger is linked via SmartFlex (Ohme, etc.), the dashboard shows how much of your dispatch-window energy was actually your car vs household appliances running at the same time. Uses charger-reported kWh — not an estimate.

### Bill Projection
Extrapolates your month-to-date spend into a projected monthly total. Shows daily average, a progress bar through the month, and how many days remain.

### Tariff Comparison
Takes your actual consumption for the day and re-prices it on:
- **Flexible Octopus** — flat rate, what most non-EV customers pay
- **Agile Octopus** — half-hourly variable pricing

Shows pound amounts and percentage difference so you can see if IOG is the right tariff for your usage pattern.

### Tariff Expiry Warning
A banner appears when your IOG agreement is within 30 days of expiry. Turns urgent (red) at 7 days. Links directly to the Octopus renewal page.

### Range Views
- **Weekly** — 7-day cost trend with kWh overlay
- **Monthly** — 30-day breakdown with per-day bars
- **Yearly** — 12-month view with monthly totals and averages

### Rate Overrides
Set custom peak, off-peak, or standing charge rates from the settings page. Useful for modelling "what if" scenarios or correcting API discrepancies. Overrides apply to all calculations.

---

## Environment Variables

### Single user mode

This is all you need for local, Docker or Portainer use.

| Variable | Required | Description |
|----------|:--------:|-------------|
| `OCTOPUS_API_KEY` | Yes | Your Octopus API key (`sk_live_...`). [Find it here.](https://octopus.energy/dashboard/new/accounts/personal-details/api-access) |
| `OCTOPUS_ACCOUNT_NUMBER` | Yes | Your account number (`A-XXXXXXXX`), shown on your Octopus dashboard. |
| `OCTOPUS_MPAN` | Yes | 13-digit meter point number. Discovered for you by `/setup`. |
| `OCTOPUS_METER_SERIAL` | Yes | Meter serial number. Discovered for you by `/setup`. |
| `OCTOPUS_PRODUCT_CODE` | Yes | e.g. `INTELLI-VAR-22-10-14`. Discovered for you by `/setup`. |
| `OCTOPUS_TARIFF_CODE` | Yes | e.g. `E-1R-INTELLI-VAR-22-10-14-A`. Discovered for you by `/setup`. |
| `OCTOPUS_PEAK_RATE_OVERRIDE` | No | Custom peak rate in p/kWh (inc VAT). Overrides the API rate. |
| `OCTOPUS_OFF_PEAK_RATE_OVERRIDE` | No | Custom off-peak rate in p/kWh (inc VAT). |
| `OCTOPUS_STANDING_CHARGE_OVERRIDE` | No | Custom standing charge in p/day (inc VAT). |

All six of the required variables must be present, or the app redirects to `/setup`. Set the first two yourself; `/setup` works out the other four and hands you a block to paste in.

### Multi user mode (optional)

Set these **instead of** the `OCTOPUS_*` variables. Each user then stores their own credentials via `/setup`.

| Variable | Required | Description |
|----------|:--------:|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL, e.g. `https://xxxx.supabase.co`. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key. Multi user mode only switches on when **both** this and the URL are set. |
| `SUPABASE_ENCRYPTION_KEY` | Yes | 64 hex characters (32 bytes). Encrypts each user's Octopus API key at rest. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `ALLOWED_EMAILS` | No | Comma-separated sign-in allowlist, e.g. `me@example.com,partner@example.com`. Supabase sign-up is open by default, so without this anyone who reaches your instance can create an account. |

You also need to apply the SQL in `supabase/migrations/` to your Supabase project. It creates the `user_credentials` table with row-level security so users can only read their own row.

> **Multi user mode and Docker don't mix cleanly.** `NEXT_PUBLIC_*` variables are inlined into the browser bundle at build time, not read at runtime, so passing them to a prebuilt container is partly ineffective: server-side auth works, but the sign-out button never renders. If you want multi user mode in Docker, pass them as build args and rebuild the image. On Vercel it just works, because the build happens after you set the variables.

---

## How the Data Works

The dashboard talks to two Octopus APIs:

| Source | Data | Lag |
|--------|------|-----|
| **REST API** | Half-hourly consumption, unit rates, standing charges, account info | 24-48 hours |
| **Kraken GraphQL** | Smart meter telemetry, dispatch slots, EV charging sessions (Ohme) | ~30 minutes |

For **today and yesterday**, the dashboard uses Kraken telemetry (near real-time from your smart meter's in-home display). For **older days**, it uses the REST API which has fully settled, authoritative readings. Both are fetched in parallel — the dashboard picks whichever source has more data for each day.

**Why is today's data delayed?** Your smart meter sends readings to the DCC, which forwards them to Octopus. This takes roughly 30 minutes. The REST API takes even longer (24-48h) because Octopus batch-processes it. The dashboard works around this by using the GraphQL telemetry endpoint for recent days.

**Where does the EV data come from?** If your charger (Ohme, etc.) is linked to Octopus via SmartFlex, each charging session reports how many kWh the charger delivered. This is the charger's own measurement — independent of your smart meter, which only sees whole-house consumption. The dashboard uses both numbers to calculate the split.

---

## FAQ

<details>
<summary><strong>I'm not on Intelligent Octopus Go. Will this work?</strong></summary>

Not well. The dashboard is built around IOG's rate structure (off-peak window, dispatch slots, smart charging). On a flat-rate tariff there are no dispatches to track and the off-peak/peak split won't mean anything. You'd be better served by a general energy monitor.

</details>

<details>
<summary><strong>Why does today show no data / very little data?</strong></summary>

Smart meter telemetry has a ~30 minute lag, and the REST API has a 24-48 hour lag. If you're looking at today early in the morning, there may only be a few slots available. Check back later or look at yesterday for a complete picture.

</details>

<details>
<summary><strong>Why doesn't the EV split show up?</strong></summary>

The EV vs household breakdown requires your charger to be linked to Octopus via SmartFlex (the Ohme integration). If you don't see it:
- Check that your Ohme (or other smart charger) is linked in the Octopus app under Intelligent Octopus settings
- The split only appears on days where dispatch slots have consumption data — if no charging happened, there's nothing to split
- The `energyAdded` field must be populated by the charger for the session

</details>

<details>
<summary><strong>The tariff comparison doesn't show Agile rates</strong></summary>

Agile rates are fetched from the public Octopus products API. If the comparison only shows Flexible (or neither), it usually means:
- The Agile product isn't currently available for your region
- The API didn't return enough rate data to match >80% of your consumption slots
- Octopus hasn't published Agile rates for the date you're viewing

</details>

<details>
<summary><strong>Can I use this with Octopus Intelligent Go v2 / Cosy / other tariffs?</strong></summary>

The dashboard specifically targets IOG's rate structure (off-peak window, dispatch slots). Other Octopus smart tariffs have different mechanics. It may partially work — consumption data will display — but the classification logic and savings calculations won't be accurate.

</details>

<details>
<summary><strong>Is my API key safe?</strong></summary>

In **single user mode**, your API key lives in an environment variable on your own machine or container (`.env.local` for `npm run dev`, `.env` or your Portainer stack variables for Docker). It's only ever used for server-side API calls and never reaches the browser.

> **Heads-up on single user mode:** with no Supabase configured, the app treats every visitor as one implicit user and does **not** require a login. Only expose such an instance on a network you control (localhost, home LAN, or behind your own VPN or reverse-proxy auth). To deploy publicly, switch to multi user mode.

In **multi user mode**, API keys are encrypted with AES-256-GCM before being stored in Supabase. The encryption key only exists in your server's environment variables. Even a full database breach wouldn't expose plaintext API keys.

</details>

<details>
<summary><strong>Why do the costs not match my Octopus bill exactly?</strong></summary>

A few reasons:
- Octopus may use slightly different rate boundaries or rounding
- The dashboard uses the best-available rate at the time of calculation — rates can change retroactively
- Standing charges and consumption costs may settle differently in Octopus's billing system
- Use rate overrides in settings if you want to match your bill exactly

</details>

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 16](https://nextjs.org) (App Router, Server Components) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4 |
| Charts | [Recharts 3](https://recharts.org) |
| Icons | [Lucide React](https://lucide.dev) |
| Fonts | Inter + Fira Code |
| Auth | [Supabase Auth](https://supabase.com/auth) (optional, magic link) |
| Database | Supabase PostgreSQL + RLS (optional) |
| Encryption | Node.js `crypto` (AES-256-GCM) |
| Containers | Docker multi-stage build, non-root, `output: standalone` |
| Tests | [Vitest](https://vitest.dev) + GitHub Actions CI |

---

## Project Structure

```
src/
  proxy.ts                   # Auth gate + public asset bypass (Next 16 proxy)
  app/
    page.tsx                 # Dashboard (server component)
    error.tsx                # Error boundary
    setup/                   # Account setup & settings
    login/                   # Magic link login (multi user)
    auth/callback/           # Magic link exchange
    actions/                 # Server actions (auth, credentials)
    api/summary/             # Range data endpoint (weekly/monthly/yearly)
    api/setup/discover/      # Account auto-discovery
    api/health/              # Liveness probe for the container healthcheck
    manifest.ts              # PWA manifest
    icon-*/, apple-icon.tsx  # Generated PWA icons
  components/dashboard/
    Dashboard.tsx            # Main client orchestrator
    ConsumptionChart.tsx     # Half-hourly bar chart
    LiveChart.tsx            # Real-time today view
    RangeChart.tsx           # Weekly/monthly trend chart
    YearlyChart.tsx          # 12-month overview
    CostBreakdown.tsx        # Pie chart cost split
    BillProjection.tsx       # Monthly bill estimate
    TariffComparison.tsx     # IOG vs Flexible vs Agile
    EvChargingSplit.tsx      # EV vs household during dispatch
    DispatchTimeline.tsx     # Smart charge slot list
    TariffExpiryBanner.tsx   # Renewal warning banner
    KpiCards.tsx, RangeKpiCards.tsx, RateDetails.tsx,
    DateNavigator.tsx, TimeRangeSelector.tsx
  lib/
    octopus/
      rest-client.ts         # Octopus REST API (consumption, rates)
      graphql-client.ts      # Kraken GraphQL (telemetry, dispatches, sessions)
      account-discovery.ts   # Meter/tariff discovery for /setup
      tariff-comparison.ts   # Public tariff rate fetcher
      types.ts               # Credentials + raw API shapes
    calculator/
      calculate-daily.ts     # Single-day builder
      calculate-range.ts     # Multi-day aggregation
      classify-slots.ts      # Off-peak/peak/dispatch classifier
      ev-energy.ts           # Charger-reported kWh apportioned per day
      timezone.ts            # UK timezone utilities (BST/GMT safe)
    supabase/
      server.ts, proxy.ts    # SSR clients (multi user)
      config.ts              # Shared "is Supabase configured?" check
    dal.ts                   # Session + credential access layer
    crypto.ts                # AES-256-GCM encryption
    env.ts                   # Environment helpers
    rate-limit.ts            # Per-process sliding window limiter
    types.ts                 # Shared summary types
```

---

## Contributing

Contributions, bug reports, and feature requests are welcome. To get started:

```bash
git clone https://github.com/observethenoyes/iogo-live.git
cd iogo-live
npm install
npm run dev          # dev server with Turbopack
npm test             # Vitest unit tests
npm run test:watch   # ...in watch mode
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run build        # production build
```

CI runs lint, typecheck, tests, build and a production `npm audit` on every push and pull request.

The unit tests cover the pure logic where a mistake is expensive and invisible: UK timezone handling across BST and GMT boundaries, slot classification and pricing, rate-window lookup, and EV energy apportioning. Anything that talks to the Octopus API is left to manual testing against a real account.

If you're adding a new feature, please open an issue first to discuss the approach.

---

## Acknowledgements

- [Octopus Energy](https://octopus.energy) for the API and a genuinely good tariff
- [Guy Lipman's Octopus Tools](https://www.guylipman.com/octopus/) for inspiration
- Built with [Next.js](https://nextjs.org), [Recharts](https://recharts.org), [Tailwind CSS](https://tailwindcss.com), and [Lucide](https://lucide.dev)

---

## License

[MIT](LICENSE)
