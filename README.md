# Enperfeitas — static site

A hand-rebuilt, static (plain HTML/CSS, no database, no subscription) version of enperfeitas.com, built from the content on your live Squarespace site.

## What's in `website/`

Home, The Studio, Studio Membership, Book Workshop Space, Workshops, Bespoke Binding, Bespoke Boxes, Collectibles, Latest Work, About, Onboarding (how a commission works), Newsletter, Contact, Links, and the four legal pages (Shipping, Refunds, Privacy, Terms), plus a 404 page. Everything is plain `.html` + one shared `css/style.css` — no build tools, no server, nothing to install.

**Left out, as agreed:** the Journal (index, posts, tags), the how-to Guides, the Personalize/order configurator pages, and the Enperfeitas Storefront/Shop. Those all depended on Squarespace's backend (blog engine or checkout) and weren't rebuilt.

## Booking and newsletter — already handled

Your workshop and studio-space booking buttons already point to **Acuity Scheduling** (`enperfeitas.as.me` / `app.acuityscheduling.com`), which is a separate service from Squarespace — so those buttons work exactly as before, no changes needed. The newsletter page links out to **Substack** (`enperfeitas.substack.com`), same idea.

## Studio Membership "Sign Up" buttons

On the live site these went to Squarespace's checkout, which a static site can't replicate. For now they open a pre-filled email to `info@enperfeitas.com` instead. If you'd rather take payment automatically without a full shop, the simplest fix is a **Stripe Payment Link**:

1. Create a free Stripe account (or use an existing one) at stripe.com.
2. Dashboard → Payment links → create one for "Basic Membership — 1200 SEK" and one for "Premium — 1800 SEK".
3. Stripe gives you a URL like `https://buy.stripe.com/xxxx`. Swap that in for the `mailto:` link on the two "Sign up" buttons in `studio-membership.html` (and the two "See membership details" buttons on `studio.html` if you want them to jump straight to checkout).

No code beyond pasting a URL — happy to do this step for you once you have the links.

## Images

Done — all 28 photo spots (Home, About, Latest Work gallery, and the Studio, Workshops, Bespoke Binding, and Bespoke Boxes pages) now have your real photos, pulled from your live Squarespace site. `IMAGE-MANIFEST.md` still lists where each one came from, for reference.

Not covered: the "Follow along" Instagram section on the About page just links out to your Instagram instead of showing static copies of posts, since those are a live feed rather than fixed photos. The Latest Work gallery shows 12 of your 70+ product photos — a curated sample rather than the full set; if you want more (or different ones) in the gallery, point me at your favorites and I'll wire them in.

The logo is set as styled text ("Enperfeitas") rather than your logo image file, to keep the site dependency-free — swap in your logo image later if you'd like the exact wordmark.

## Previewing it yourself

Before publishing anywhere, you can open `website/index.html` directly in a browser to click around, or, if you're comfortable with a terminal:

```
cd website
python3 -m http.server 8000
```

then visit `http://localhost:8000`.

## Hosting it for real (free/cheap options)

Since the point was cost and control, any of these work well for a static site and are free for a small site like this:

- **Cloudflare Pages** — free, fast, easiest DNS if you eventually move your domain's nameservers to Cloudflare too.
- **Netlify** — free tier, drag-and-drop the `website` folder in their dashboard to deploy in under a minute.
- **GitHub Pages** — free, ties nicely into version control if you want to track changes over time.

All three let you point your existing `enperfeitas.com` domain at the new site (usually a couple of DNS records — a `CNAME` or `A` record — changed wherever you manage your domain). Once you pick one, I can walk through the exact steps or set it up with you.

## Editing content later

Everything is plain text inside the `.html` files — open one in any text editor, find the sentence you want to change, edit it, save, and re-upload/redeploy. No CMS, no login, no monthly fee.
