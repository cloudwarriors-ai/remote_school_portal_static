# Remote school portal (static site)

Static front end for the ThrivePoint proof of concept. It stores no data and holds no secrets.
Everything dynamic (student list, schedule, Zoom join signature) comes from one n8n webhook, set in `config.js`.

- Sign-in is a synthetic student picker (proof of concept only).
- The Zoom Meeting SDK 6.10.0 loads from Zoom's CDN.
- `_headers` carries the cross-origin headers for hosts that honour it (Cloudflare Pages, Netlify). GitHub Pages ignores it.
- `node serve.mjs 8099` serves the site locally with those headers.
