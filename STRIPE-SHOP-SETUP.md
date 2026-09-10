# Turning on the shop

The Shop page (`website/shop.html`) is built and live — but every "Buy now" button currently just opens an email instead of taking a payment, because it needs a real Stripe Payment Link and none exist yet. This is deliberate: you can turn on real checkout for one product at a time, whenever you're ready, without touching any code.

## One-time setup

1. Create a free [Stripe account](https://dashboard.stripe.com/register) if you don't have one yet (Swedish businesses are fully supported — payouts in SEK).
2. In the Stripe Dashboard, turn on **Stripe Tax** if you want it to calculate Swedish VAT (25%) automatically — optional, but saves you doing it by hand.

## Per product: create a Payment Link

For each product below, in the Stripe Dashboard go to **Payment links → Create payment link**, add the product with its price, and — this is the part that makes "days people can buy" work — set **Limit the number of payments** to your stock count (e.g. 1 for a one-off, or however many you have on hand). The link automatically stops accepting orders once it sells out, and you can deactivate it manually at any time from the Payment Links list, whether or not it's sold out.

For the Spacers and Corner Cutting Jig, which come in several sizes, add each size as its own price on the same Payment Link — Stripe will show a dropdown at checkout so the buyer picks the size themselves.

Once a link is created, copy its URL and send it to me (or paste it directly into `build.py`, in the `PRODUCTS` list, as that product's `"stripe_link"` value, then run `python3 build.py` again) — the button switches from emailing you to taking real payment immediately, no other changes needed.

## Products to set up

| Product | Price | Notes |
|---|---|---|
| Punching Cradle | 550 kr | Physical — set your real stock count as the payment limit. |
| Bookbinding Spacers (Acrylic) | From 75 kr | Physical — set your real stock count as the payment limit. |
| Corner Cutting Jig | From 90 kr | Physical — set your real stock count as the payment limit. |
| Punching Cradle Tutorial (DIY) | 90 kr | Digital — email the file to the buyer after purchase (Stripe doesn't deliver it for you). |
| Bookcloth Tutorial (DIY) | 90 kr | Digital — email the file to the buyer after purchase (Stripe doesn't deliver it for you). |
| Concertina (Accordion) Bookbinding Tutorial | 90 kr | Digital — email the file to the buyer after purchase (Stripe doesn't deliver it for you). |
| Single-Case Binding Tutorial | 90 kr | Digital — email the file to the buyer after purchase (Stripe doesn't deliver it for you). |

## Digital delivery

Stripe Payment Links take the payment but won't email the tutorial file itself — after each digital sale, Stripe will notify you, and you send the PDF/video over email. If this becomes a hassle once sales pick up, Stripe supports attaching a downloadable file directly to a Payment Link so delivery happens automatically — ask me to set that up when you're ready.

## Photos still needed

The product photos are the same self-healing placeholders as the rest of the site — see `IMAGE-MANIFEST.md` for the filenames and direct links to the originals.
