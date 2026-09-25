# Tip link: lowest-fee options (parked 2026-09-24)

For `DECLUTTER_TIP_URL`, which covers every non-Safari store. Safari has no choice: rule 3.1.1 forces StoreKit, so
Apple takes 15% under the Small Business Program. Nothing is decided and no account has been opened.

## Leaning

1. **One global link:** a Revolut Business payment link if a Business account exists or is worth opening,
   otherwise a Stripe Payment Link set to "customer chooses what to pay" (or Ko-fi on top of Stripe).
2. **Czech QR (SPD)** on the options page, since the audience is Czech-first. It costs 0%. Generate it with the
   `qr-payment` skill.
3. Optionally a personal revolut.me button for Revolut users. It must not be the main link (see below).

Make €5 the default amount. The fixed fee (~€0.20–0.26) is most of the cost on small tips.

## Fees (researched 2026-09-24)

| Option | Fee | Kept on €3 | Kept on €5 | Catch |
|---|---|---|---|---|
| Czech QR / bank transfer | 0 | 100% | 100% | CZ/SK banking apps only, and the IBAN becomes public |
| GitHub Sponsors | 0% platform, GitHub covers card fees; ~2% currency conversion on payout | ~98% | ~98% | Donors need a GitHub account |
| Revolut Business link | EEA consumer card 1% + €0.20; other cards 2.8% + €0.20 | ~92% | ~95% | Needs a Business account |
| Stripe Payment Link (CZ account) | EEA 1.5% + 6.50 Kč, premium EEA 2.8%, UK 2.5%, international 3.15%; +2% on conversion | ~90% | ~93% | Checkout shows the legal name |
| Ko-fi + Stripe | Stripe's fee + 0% on tips | as Stripe | as Stripe | New accounts start at 5% "Contributor" on tips; switch it off |
| Ko-fi + PayPal | ~3% + fixed | ~85% | | |
| Liberapay | 0% platform, ~3% average Stripe | ~97% | | Recurring only, a poor fit for one-off tips |
| Buy Me a Coffee | 5% + Stripe | ~85% | | |

## Personal revolut.me: why not the main link

- Personal accounts may not be used for business. Taking tips for a published extension from strangers looks like
  business use, and Revolut can remove payment receiving from the Revtag. The account at risk is the one `mybit`
  runs through.
- Card payments are capped at £250/week and 20 top-ups/week.
- Payments from other Revolut users are free and instant.

## Unverified (open these before deciding)

- Revolut's CZ help and fee pages returned 403 to fetch and to curl. The Business rates come from the ES help page
  and the IE pricing page. The personal-link card fee for CZ is unknown. Next step: open them in Chrome
  (agent-browser `--profile Default`).
- Whether Revolut Business payment links let the payer choose the amount. If not, make fixed €3/€5/€10 links.
- Whether Revolut Business Basic is free in CZ.
- Whether a CZ Stripe account can pay out in EUR and avoid the 2% conversion.
- Ko-fi's help page returned 403. The Contributor-default claim comes from third-party 2026 write-ups.
- How Czech tax treats tips.

## Sources

- https://stripe.com/en-cz/pricing
- https://docs.github.com/en/sponsors/sponsoring-open-source-contributors/about-sponsorships-fees-and-taxes
- https://ko-fi.com/pricing, https://knowyourcut.com/blog/kofi-fees-2026
- https://help.buymeacoffee.com/en/articles/8105744-how-to-calculate-charges-on-your-payment
- https://liberapay.com/about/faq
- https://help.revolut.com/en-ES/business/help/merchant-accounts/fees/how-much-does-it-cost-to-accept-card-payments/
- https://www.revolut.com/en-IE/business/accept-payments-pricing/
- https://help.revolut.com/en-CZ/help/transfers/payment-links/revolut-me-link/
- https://www.revolut.com/en-DE/legal/business-terms/
