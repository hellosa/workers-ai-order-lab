# Project instructions

- Purpose: a Chinese order-review playground using Clairic → (Clef × Jev) on Cloudflare Workers AI.
- Stack: native HTML/CSS/JS, Worker ESM, Wrangler. No frontend framework or production dependencies.
- Run and deploy: follow README.md; run `npm test` and `npx wrangler deploy --dry-run` after server/config changes.
- `public/` is UI; `worker.js` is the only API entry. Preserve authorization, input limits, unknown/null values, and error redaction.
- Never commit credentials, account identifiers, real customer data, `.dev.vars`, or `.env` files. Configure LAB_PASSWORD as a runtime Secret.
- Keep this a suggestion-only tool. Never add automatic refunds or pretend model probabilities are accuracy guarantees.
- Comparison: pass identical state/questions to both models. Keep shared extraction cost separate, preserve missing usage, and retain partial results.
- Status: deployed and live API verified on 2026-10-20; Clef works, Jev awaits a usable third-party billing source (direct call returned 402). Runtime URL/password are delivered separately, not stored in Git. Reverify the live target after deployment changes.
