# The 5 Spheres of Empathy — Landing Page

This is a one-page capture site for the5spheresofempathy.com. Plain HTML, CSS and JS. No frameworks, no build step. Keep it that way.

## What this site is for

Capture emails (free Sphere 1 self-audit session) and sell seats in the Leadership Reset cohort (EUR 1,000, 6 weeks, individuals). Team workshops are a separate product sold by enquiry. Never present the workshop as a bigger version of the cohort, and never present the cohort as a cheap workshop. They are different products for different buyers.

## Voice rules (apply to ALL copy changes, no exceptions)

- Write in flowing prose, not bullet points.
- Never use em dashes. Use commas, full stops, or restructure the sentence.
- No buzzwords, no corporate register, no performative warmth.
- Feelings are embedded in the copy, never announced.
- Sound like a human being who has lived what he teaches, not a corporate trainer.
- The headline is locked and must never be changed without explicit instruction:
  "Almost every business problem is a people problem. Empathy is intelligence about people, starting with you."
- Other locked phrases: "guessing expensively", "purposeful therapy".

## Design rules

- Colours and fonts are CSS variables at the top of styles.css. Change them there, nowhere else.
- Fonts: Fraunces (display), Source Sans 3 (body). Do not swap for Inter, Roboto or system fonts.
- The aesthetic is editorial and warm, not SaaS. No purple gradients, no glassmorphism, no stock illustration styles.

## Facts that must stay accurate

- Author: Galeno Chua (Mr. G), based in Warsaw.
- Cohort: 6 weeks, 90 minutes live weekly, EUR 1,000 per seat, next cohort September 2026.
- Contact: hello@5spheresofempathy.com
- Proof points may be reworded but never invented. If a new testimonial is needed, ask, do not fabricate.

## Deploy

Netlify. After edits: `netlify deploy --prod` (or push to the connected GitHub repo).
