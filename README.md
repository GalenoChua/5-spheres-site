# The 5 Spheres of Empathy — Landing Page

One-page capture site. No framework, no build step. Plain HTML, CSS and JS so it stays fast, cheap to host, and easy to edit by prompting Cursor.

## Files

- `index.html` — all content and structure. Edit copy here.
- `styles.css` — design system. Colours and fonts are CSS variables at the top (`:root`).
- `script.js` — scroll-reveal animations only.

## Session tools, and where each one lives

The drill tools are session pages, not marketing pages. Every one of them is `noindex`, none
is in the sitemap, and none is linked from a public page: the only way in is the link the
facilitator sends. They are listed here because an address nobody has written down is an
address that gets rebuilt.

| Address | What it is |
|---|---|
| `/skilldrills/public-speaking/` | The public speaking drill. One person on the floor, the room scores them. `new/`, `facilitator/`, `room/`, `results/` |
| `/skilldrills/letting-someone-go/` | Letting Someone Go. Pairs and one triad, everybody busy at once, and the receiver's card is the one that counts. `new/`, `facilitator/`, `print/` |
| `/quad/` | The Sensing Quad |

The two drills share `netlify/functions/_scale.mjs`, which is the 1 to 10 scale, and
`_session.mjs`, which decides who may drive a room. They do not share a question set and
they are not the same shape. `_pair.mjs` is the engine behind the second one and is written
to carry the sensing and pitching drills later: a new drill of that shape is a new question
set in that file, not a new engine.

## Run locally

Open `index.html` in a browser, or for live reload in Cursor's terminal:

```bash
npx serve .
```

## Before launch — 4 placeholders to replace

1. **Email form action** — in `index.html`, find `#MAILERLITE_FORM_ACTION_URL` and replace with your MailerLite form's action URL (MailerLite → Forms → Embedded form → copy the form `action`).
2. **Payment link** — find `#STRIPE_OR_APPLICATION_LINK` and replace with your Stripe payment link for the cohort seat (or an application form URL).
3. **Contact email** — find `hello@5spheresofempathy.com` (appears once) and set the real address.
4. **Portrait** — find the `div class="portrait"` block and replace with `<img src="portrait.jpg" alt="Galeno Chua">` once Maya supplies the image. Add a matching `border-radius: 18px; width: 100%; object-fit: cover;` style or reuse the `.portrait` class on the img.

Also check: footer LinkedIn and book links are `#` stubs; cohort date says **September 2026** and **6 weeks** — confirm both.

## Deploy (10 minutes)

1. Push this folder to a GitHub repo (Cursor: Source Control panel → Publish to GitHub).
2. In Netlify (free tier): Add new site → Import from GitHub → select the repo. No build command, publish directory is the root.
3. Domain: buy at Cloudflare or Namecheap, then in Netlify → Domain settings → add custom domain and follow the DNS instructions.

Every push to the repo redeploys automatically.

## Voice rules for any copy edits (tell Cursor these)

- Prose, not bullets. No em dashes. No buzzwords. No performative warmth.
- Feelings embedded in the copy, never announced.
- Headline line is locked: "Almost every business problem is a people problem. Empathy is intelligence about people, starting with you."
- The cohort (individual, EUR 1,000) and team workshops are different products. Never present the workshop as a bigger version of the cohort.
