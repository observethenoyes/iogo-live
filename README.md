<p align="center">
  <img src="docs/screenshots/hero.png" alt="IOG Dashboard — daily view" width="700" />
</p>

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

## Screenshots

> Add your own screenshots to `docs/screenshots/` and they'll appear here.
> Tip: use your browser's responsive mode at 375px for mobile shots.

<table>
<tr>
<td width="50%">

**Daily view** — half-hourly consumption colour-coded by rate type, KPI cards, cost breakdown

<img src="docs/screenshots/daily.png" alt="Daily view" width="100%" />

</td>
<td width="50%">

**Live view** — today so far with animated current-slot indicator

<img src="docs/screenshots/live.png" alt="Live view" width="100%" />

</td>
</tr>
<tr>
<td>

**EV split + tariff comparison** — charger-reported kWh vs household, plus what you'd pay on other tariffs

<img src="docs/screenshots/ev-split.png" alt="EV charging split" width="100%" />

</td>
<td>

**Settings** — account overview, live rates, and rate overrides

<img src="docs/screenshots/settings.png" alt="Settings page" width="100%" />

</td>
</tr>
</table>

---

## Quick Start

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

Open [localhost:3000/setup](http://localhost:3000/setup). The app will auto-discover your meter details from the Octopus API — MPAN, serial number, tariff code, current rates. Hit save and you're done.

> **Prefer manual config?** You can skip `/setup` and fill in all six env vars yourself. See [Environment Variables](#environment-variables) below.

---

## Deploy to the Cloud

### Vercel (easiest)

1. Fork this repo
2. Import it on [vercel.com/new](https://vercel.com/new)
3. Add your `OCTOPUS_API_KEY` and `OCTOPUS_ACCOUNT_NUMBER` as environment variables
4. Deploy

All API calls happen server-side. Your API key never reaches the browser.

### Any Node.js host

```bash
npm run build
npm start        # runs on port 3000
```

Works on any platform that runs Node 18+ — Railway, Fly.io, a Raspberry Pi, whatever you like.

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

| Variable | Required | Description |
|----------|:--------:|-------------|
| `OCTOPUS_API_KEY` | Yes | Your Octopus API key (`sk_live_...`). [Find it here.](https://octopus.energy/dashboard/new/accounts/personal-details/api-access) |
| `OCTOPUS_ACCOUNT_NUMBER` | Yes | Your account number (`A-XXXXXXXX`), shown on your Octopus dashboard. |
| `OCTOPUS_MPAN` | Auto | 13-digit meter point number. Auto-discovered via `/setup`. |
| `OCTOPUS_METER_SERIAL` | Auto | Meter serial number. Auto-discovered via `/setup`. |
| `OCTOPUS_PRODUCT_CODE` | Auto | e.g. `INTELLI-VAR-22-10-14`. Auto-discovered via `/setup`. |
| `OCTOPUS_TARIFF_CODE` | Auto | e.g. `E-1R-INTELLI-VAR-22-10-14-A`. Auto-discovered via `/setup`. |
| `OCTOPUS_PEAK_RATE_OVERRIDE` | No | Custom peak rate in p/kWh (overrides API rate). |
| `OCTOPUS_OFF_PEAK_RATE_OVERRIDE` | No | Custom off-peak rate in p/kWh. |
| `OCTOPUS_STANDING_CHARGE_OVERRIDE` | No | Custom standing charge in p/day. |

> Variables marked **Auto** are discovered automatically when you use the `/setup` page. You only need to set them manually if you're skipping the setup UI.

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

In **self-hosted mode**, your API key lives in `.env.local` on your server and is only used for server-side API calls. It never reaches the browser.

> **Heads-up on self-hosted mode:** when no Supabase is configured, the app treats every visitor as a single implicit user and does **not** require login. Only expose a self-hosted instance on a network you control (localhost, home LAN, or behind your own VPN/reverse-proxy auth). To deploy publicly, set `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_ENCRYPTION_KEY` to enable multi-user auth.

In **multi-user mode**, API keys are encrypted with AES-256-GCM before being stored in Supabase. The encryption key only exists in your server's environment variables. Even a full database breach wouldn't expose plaintext API keys.

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

---

## Project Structure

```
src/
  app/
    page.tsx                # Dashboard (server component)
    setup/                  # Account setup & settings
    login/                  # Magic link login (multi-user)
    api/summary/            # Range data endpoint (weekly/monthly/yearly)
    api/setup/discover/     # Account auto-discovery
    manifest.ts             # PWA manifest
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
  lib/
    octopus/
      rest-client.ts         # Octopus REST API
      graphql-client.ts      # Kraken GraphQL API
      tariff-comparison.ts   # Public tariff rate fetcher
    calculator/
      calculate-daily.ts     # Single-day builder
      calculate-range.ts     # Multi-day aggregation
      classify-slots.ts      # Off-peak/peak/dispatch classifier
      timezone.ts            # UK timezone utilities
    dal.ts                   # Data access layer
    crypto.ts                # AES-256-GCM encryption
    env.ts                   # Environment helpers
```

---

## Contributing

Contributions, bug reports, and feature requests are welcome. To get started:

```bash
git clone https://github.com/observethenoyes/iogo-live.git
cd iogo-live
npm install
npm run dev          # dev server with Turbopack
npm run build        # production build + type check
npm run lint         # ESLint
```

If you're adding a new feature, please open an issue first to discuss the approach.

---

## Acknowledgements

- [Octopus Energy](https://octopus.energy) for the API and a genuinely good tariff
- [Guy Lipman's Octopus Tools](https://www.guylipman.com/octopus/) for inspiration
- Built with [Next.js](https://nextjs.org), [Recharts](https://recharts.org), [Tailwind CSS](https://tailwindcss.com), and [Lucide](https://lucide.dev)

---

## License

[MIT](LICENSE)
