# ICE MAN score service

A Cloudflare Worker over one KV namespace. It keeps the daily and weekly boards somewhere that is not a single
browser, and lets a player leave an email address that only you can read.

## Deploy

```sh
cd worker
npx wrangler kv namespace create SCORES      # paste the printed id into wrangler.toml
npx wrangler secret put ADMIN_TOKEN          # invent a long random string; this is your admin password
npx wrangler deploy
```

`wrangler deploy` prints the URL, e.g. `https://iceman-scores.<you>.workers.dev`.

Two things to do with it:

1. Put it in the game. In `build.py`, set `SCORES_URL` (or export `ICEMAN_SCORES_URL` before building) and
   rebuild. Without it the game behaves exactly as it does today and posts nothing anywhere.
2. Open `admin/index.html` from the built site and paste the same URL and your `ADMIN_TOKEN`.

## Endpoints

| | |
|---|---|
| `POST /score` | one finished run. `{id, name, score, bags, chain, stage, route, email?}` |
| `GET /board?p=day\|week&n=20` | public top. **Names and scores only — never an email.** |
| `GET /admin/board?p=day\|week&key=20260916` | the same rows with emails. Needs `Authorization: Bearer <ADMIN_TOKEN>`. |
| `GET /admin/export?p=day\|week&key=…` | those rows as CSV, for a mail merge. Same header. |

`key` is optional and lets you look back at a past day (`YYYYMMDD`) or week (`YYYYWW`, ISO). Day boards are kept
90 days, week boards a year.

## What this does and does not protect

**Emails are not public.** Only paths under `/admin` return one, and only after the token matches. The public
response is built by naming the three fields it may contain, so a field added to storage later cannot leak by
somebody forgetting to strip it. With `ADMIN_TOKEN` unset the admin routes are closed, not open.

**Scores are not tamper proof.** They arrive from a browser, so a determined player can post any number they
like. Client-side signing would not change that — the key would be sitting in the page. There is a sanity
ceiling, field validation and a per-address rate limit, which stop accidents and casual curl and nothing more.
Treat the board as a friendly competition. If it ever needs to be authoritative, the run has to be replayed and
scored on the server, which is a much bigger piece of work.

**The admin token is a shared secret.** It is as strong as the string you chose and it does not expire. If you
want real accounts in front of the admin page, put **Cloudflare Access** over the `/admin*` routes — it is free
for small teams, needs no code change here, and gives you SSO and an audit trail. The token check stays as a
second lock behind it.

## Privacy

You are storing email addresses in order to contact people. The game asks for one only after a run, explains
why in one line, and never requires it — a blank box still files the score. Keep the CSV export to the people
who need it, and delete a board when you no longer need it (`npx wrangler kv key delete --binding SCORES
"board:d:20260916"`).
