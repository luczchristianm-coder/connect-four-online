# FourPlay — Connect Four Online

A responsive, real-time two-player Connect Four app. One player creates a private room, shares an 8-character code or link, and a second player joins from another device. The database is authoritative: moves, turn order, gravity, win/draw detection, and rematches run inside SQL RPC functions that lock the room row while validating a move.

## Stack

- React + Vite
- Supabase Auth anonymous guest sessions
- Supabase Postgres + Row Level Security
- Supabase Realtime Postgres Changes
- Vercel static hosting

## Requirements

- Node.js 20+ and npm
- A Supabase project
- A Vercel account to publish the public app

## 1. Set up Supabase

1. Create a project in the [Supabase Dashboard](https://supabase.com/dashboard).
2. Open **SQL Editor → New query**.
3. Paste and run the complete file `supabase/migrations/001_connect_four.sql`.
4. Open **Authentication → Sign In / Providers** and enable **Anonymous Sign-Ins**. The exact dashboard label may vary.
5. Open **Project Settings → API Keys** and copy the **Project URL** and the **publishable key** (starts with `sb_publishable_`) or the legacy **anon/public key**.
6. For a public demo, enable CAPTCHA / Turnstile for anonymous sign-ins when available. Anonymous accounts are created per browser profile and should be cleaned up according to your Supabase account-management needs.

### Database security model

- RLS allows a player to `SELECT` only a room where their authenticated user ID is the host or guest.
- Browser roles cannot directly insert, update, or delete game state.
- Only the `create_room`, `join_room`, `make_move`, and `rematch_room` RPCs can mutate game state; each validates membership and locks the target row.
- Never expose a Supabase `service_role` or secret key in the browser or Vercel's `VITE_*` variables.

## 2. Configure and run locally

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

The variable name `VITE_SUPABASE_ANON_KEY` is retained for compatibility even when its value is the newer publishable key. You may instead define `VITE_SUPABASE_PUBLISHABLE_KEY`.

Then run:

```bash
npm install
npm test
npm run dev
```

Open the Vite local URL (usually `http://localhost:5173`). To test real multiplayer, open the app in two separate browser profiles or use a second device; do not use two tabs sharing the same stored guest-auth session as two distinct players.

Build and check the production bundle:

```bash
npm run build
npm run preview
```

## 3. Deploy to Vercel

### Via GitHub (recommended)

1. Create a new GitHub repository and upload/push this project folder. Do **not** commit `.env.local`.
2. In [Vercel](https://vercel.com/), choose **Add New → Project**, import the repository, and keep the Vite defaults (`npm run build`, output folder `dist`).
3. In Vercel → Project → **Settings → Environment Variables**, add:
   - `VITE_SUPABASE_URL` = your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase publishable key or legacy anon/public key
4. Apply the variables to Production (and Preview if desired), save, and redeploy.
5. Open the deployment URL on two separate devices / browser profiles and play through a complete match. Confirm both clients see each move live and that an out-of-turn move is rejected.

### Via Vercel CLI

```bash
npm install
npm install --global vercel
vercel
```

Follow the prompts, add the same environment variables in the Vercel dashboard, and redeploy to production. The included `vercel.json` keeps SPA routes working. No public deployment URL exists until these steps finish successfully.

## Play rules

- Red (the room host) takes the first turn; Yellow (the guest) follows.
- Select any column to drop a disc into its lowest empty slot.
- The first player with four adjacent discs horizontally, vertically, or diagonally wins.
- If all 42 cells fill without a four-in-a-row, the game is a draw.
- After a win or draw, either player can start a rematch; the board resets and Red starts again.

## Current scope / known limitations

- Guest identities live in the browser's Supabase Auth session. Clearing browser storage or switching devices loses that guest identity, and a prior room may no longer be resumable by that guest.
- There is no matchmaking, in-game chat, persistent leaderboard, or account recovery in this first version.
- The app has no offline game mode. Live room access requires a configured, reachable Supabase project.
- Public demo deployment should include abuse controls for anonymous sign-in and a regular cleanup plan for unused rooms / anonymous accounts.
