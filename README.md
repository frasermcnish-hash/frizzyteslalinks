# Frizzy's Tesla Links

Your survival kit for the Tesla Wait Club: https://frizzyteslalinks.vercel.app

## Pages
- `/` (`index.html`): the links page. Link sections load from `/api/links`.
- `/guide` (`guide.html`): the new-visitor guide and FAQs.
- `/admin` (`admin.html`): PIN-protected editor for links, plus messages sent from the feedback form.
- `/collector` (`collector.html`): installs the Link Collector bookmark, which gathers links posted in a forum thread as you read it. Script: `tools/link-collector.js`. Not linked from the home page.

## How it works
- `data/links.json` is the starting list of links. Once you save in `/admin`, the list lives in Upstash Redis (`ftl:links`) and this file is only a fallback.
- `api/clicks.js` counts link clicks, all-time and per day (for "Most used this week").
- `api/feedback.js` stores messages from the feedback form.
- All Redis keys start with `ftl:`. Environment variables: `KV_REST_API_URL` and `KV_REST_API_TOKEN` (from the Upstash integration), and `ADMIN_PIN`.

No build step. Push to `main` and Vercel deploys.
