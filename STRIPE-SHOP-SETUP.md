# Shop & digital delivery

## The shop is live

"Buy now" buttons on the Shop page are connected to real Stripe Payment Links on the correct account. If any sizes are still waiting on a link, they're listed under "Size variants still needed" below.

## Digital tutorials

Stripe Payment Links take the payment but do not deliver the file. After each sale Stripe notifies you, and you email the PDF to the buyer.

The PDFs are NOT stored in this repository: it is public, so anything in it can be downloaded without paying. `.gitignore` blocks `downloads/` and `*.pdf`. Keep the master copies outside the repository (for example in `Documents\Enperfeitas-private-downloads\`).

Each tutorial also has a hidden thank-you page. It is optional: if you set a Payment Link to redirect there (**Payment links**, open the link, **Edit**, **After payment**, **Don't show confirmation page**), the buyer sees "This file is still being added" and your email address, because there is no file to download. If you do not use the redirect, the buyer sees Stripe's own confirmation page. Either way you send the PDF by email.

| Product | Optional redirect page |
|---|---|
| Punching Cradle Tutorial (DIY) | `https://enperfeitas.com/download-tutorial-punching-cradle.html` |
| Bookcloth Tutorial (DIY) | `https://enperfeitas.com/download-tutorial-bookcloth.html` |
| Concertina (Accordion) Bookbinding Tutorial | `https://enperfeitas.com/download-tutorial-concertina.html` |
| Single-Case Binding Tutorial | `https://enperfeitas.com/download-tutorial-singlecase.html` |

**Why the PDFs are kept out of the repository:** a public GitHub repository, and everything in its history, can be downloaded by anyone. A paid file placed there is free to anyone who guesses or finds its name. If real access control is ever needed, use a delivery tool (such as SendOwl) or private storage with expiring links.

## Size variants

A single Payment Link cannot show a dropdown where each choice has a different price. What Stripe can do: (a) one link per size, so every price is exact; or (b) one link with a "Dropdown" custom field (**Add custom fields**), which only records the choice and does not change the price, so a pricier size needs a manual follow-up. Use (b) only if every size costs the same.

Right now: the Spacers and the Corner Cutting Jig both use (b) for the single pieces (one link, size chosen at Stripe checkout), plus a separate link for the complete set (all 6 spacers, or all three jig sizes).

## Photos still needed

The product photos are the same self-healing placeholders as the rest of the site. See `IMAGE-MANIFEST.md` for the filenames and direct links to the originals.
