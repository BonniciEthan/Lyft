# Lyft push server

A small Cloudflare Worker that sends the **9pm (Malta time) "log today" reminder** to people
using the Lyft web app (https://bonniciethan.github.io/Lyft/):

- iPhone / iPad: only once Lyft is **added to the Home Screen** (iOS 16.4+). Apple doesn't
  allow notifications from a normal Safari tab.
- Android: Chrome, Edge, Samsung Internet and Firefox, installed or in a tab.
- Desktop browsers: Chrome, Edge, Firefox and Safari.

The Android app and the desktop app don't use this. They schedule the reminder on the
device itself.

## Privacy

The worker stores only each browser's push endpoint URL. The push it sends is empty: the
app's service worker supplies the text. No diary data, names or emails reach the server.

## One-time setup

You need a free Cloudflare account.

```bash
cd push-worker
npm install
npx wrangler login
npx wrangler kv namespace create SUBS      # copy the printed id into wrangler.toml
```

The VAPID key pair has already been generated:

- The public key is in `wrangler.toml` and `client/.env.friends`.
- The private key is in `push-worker/.dev.vars`, which git ignores. Keep a copy somewhere
  safe. If you lose it, run `npm run keys` and replace both halves, but every existing
  subscriber would then need to turn the reminder off and on again.

Upload the private key as a secret and deploy:

```bash
npx wrangler secret put VAPID_PRIVATE_KEY   # paste the value from .dev.vars
npx wrangler deploy                         # prints https://lyft-push.<you>.workers.dev
```

Put the printed URL into `client/.env.friends` as `VITE_PUSH_URL`, commit it and redeploy
the web app:

```bash
bash scripts/deploy-pages.sh
```

Check it works: `curl https://lyft-push.<you>.workers.dev/health` should print `ok`. Then on
a phone, open Lyft → Profile → **Daily reminder** → turn it on → **Send a test notification**.

## How the schedule works

The cron fires at 19:00 and 20:00 UTC. The worker sends only on the run that is 21:00 in
Malta: 19:00 UTC in summer (CEST) and 20:00 UTC in winter (CET). Dead subscriptions (the
push service answers 404/410) are deleted automatically.

The free Workers plan allows 50 outgoing requests per run, which covers about 50 people.
Beyond that, move to the $5/month plan, which allows 1,000.

## Commands

```bash
npm test          # unit tests (no Cloudflare needed)
npm run dev       # local worker; trigger the cron with curl "http://localhost:8787/__scheduled?cron=0+20+*+*+*"
npm run deploy
npx wrangler tail # live logs, including the nightly "sent/removed/failed" line
```
