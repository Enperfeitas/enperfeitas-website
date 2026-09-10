#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generates the Enperfeitas static site into dist/."""
import os
import html
import urllib.parse

DIST = "/home/claude/enperfeitas/dist"

NAV = [
    ("index.html", "Home"),
    ("studio.html", "The Studio"),
    ("workshops.html", "Workshops"),
    ("bespoke-binding.html", "Bespoke Binding"),
    ("bespoke-boxes.html", "Bespoke Boxes"),
    ("latest-work.html", "Latest Work"),
    ("shop.html", "Shop"),
    ("about.html", "About"),
    ("contact.html", "Contact"),
]

FOOTER_COLS = {
    "Studio": [
        ("studio.html", "The Studio"),
        ("workshops.html", "Workshops"),
        ("book-workshop-space.html", "Book Workshop Space"),
        ("studio-membership.html", "Studio Membership"),
    ],
    "Art Editions": [
        ("bespoke-binding.html", "Bespoke Binding"),
        ("bespoke-boxes.html", "Bespoke Boxes"),
        ("latest-work.html", "Latest Work"),
        ("collectibles.html", "Collectibles"),
        ("shop.html", "Shop"),
    ],
    "Studio Info": [
        ("about.html", "About"),
        ("onboarding.html", "How a Commission Works"),
        ("newsletter.html", "Newsletter"),
        ("links.html", "All Links"),
        ("contact.html", "Contact"),
    ],
}

LEGAL_LINKS = [
    ("shipping-info.html", "Shipping Info"),
    ("refund-policy.html", "Refunds and Returns"),
    ("privacy-policy.html", "Privacy Policy"),
    ("terms-of-service.html", "Terms of Service"),
    ("links.html", "All Links"),
]


IMAGE_MANIFEST = []  # (filename, label, page, source_url) — for the README
IMAGE_MANIFEST.append((
    "logo.webp", "Enperfeitas script logo (header)", "Header (all pages)",
    "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/dd8323fb-820d-4abe-8184-e6039e0260ef/2022_Black__Enperfeitas+Logo+_+web.png?format=1500w",
))

def _short_label(label, limit=90):
    """Trim a long alt-text description down to something that fits inside a
    small placeholder box without being clipped mid-sentence by overflow:hidden.
    The full text is always kept as the <img alt> for accessibility/SEO."""
    if len(label) <= limit:
        return label
    truncated = label[:limit].rsplit(" ", 1)[0]
    return truncated.rstrip(",.;: ") + "…"


def img_block(label, filename, page="", small=False, source="", extra_class=""):
    IMAGE_MANIFEST.append((filename, label, page, source))
    cls = "img-wrap small" if small else "img-wrap"
    if extra_class:
        cls += f" {extra_class}"
    display_label = _short_label(label, 70 if small else 140)
    alt_html = html.escape(label, quote=True)
    span_html = html.escape(display_label, quote=False)
    return (
        f'<div class="{cls}">'
        f'<img src="images/{filename}" alt="{alt_html}" style="display:none;" '
        f'onload="this.style.display=\'block\';this.nextElementSibling.style.display=\'none\';" '
        f'onerror="this.style.display=\'none\';">'
        f'<span class="ph-label">{span_html}</span>'
        f'</div>'
    )


def doodle_icon(label, filename, page="", source="", large=False):
    IMAGE_MANIFEST.append((filename, label, page, source))
    cls = "doodle-icon large" if large else "doodle-icon"
    return (
        f'<div class="{cls}">'
        f'<img src="images/{filename}" alt="{label}" style="display:none;" '
        f'onload="this.style.display=\'block\';this.nextElementSibling.style.display=\'none\';" '
        f'onerror="this.style.display=\'none\';">'
        f'<span class="ph-label">{label}</span>'
        f'</div>'
    )


def accordion(items, open_first=False):
    """items: list of (title, body_html) tuples. Native <details>/<summary> —
    no JS, matches the live site's expandable Description/Pricing/Benefits rows."""
    parts = []
    for i, (title, body) in enumerate(items):
        open_attr = " open" if (open_first and i == 0) else ""
        parts.append(
            f'<details{open_attr}><summary>{title}</summary><div>{body}</div></details>'
        )
    return "".join(parts)


def testimonial_card(title, quote, name, filename, source=""):
    """filename=None matches a live-site review that has no photo of its own
    (confirmed on enperfeitas.com: this specific review's <img> has no src at
    all) -- so we skip the photo block entirely instead of showing an empty
    placeholder box the live site doesn't have."""
    if filename:
        IMAGE_MANIFEST.append((filename, f"Testimonial photo — {title}", "Home", source))
        photo_html = f"""
      <div class="testimonial-photo">
        <img src="images/{filename}" alt="{title}" style="display:none;"
             onload="this.style.display='block';this.nextElementSibling.style.display='none';"
             onerror="this.style.display='none';">
        <span class="ph-label">{title}</span>
      </div>"""
    else:
        photo_html = ""
    return f"""
    <div class="testimonial">{photo_html}
      <span class="who">{title}</span>
      <p>&ldquo;{quote}&rdquo;</p>
      <cite>&mdash; {name}</cite>
    </div>
    """


def hero_cover(filename, heading, subtext, label, page="", source="", cta_label=None, cta_href=None, subtext2=None):
    """Full-bleed background-image banner with white text overlaid, matching
    the live site's page-header treatment (Home, Workshops, Bespoke Binding,
    Bespoke Boxes). Pass cta_label/cta_href to add an optional button (used
    on the homepage hero). Pass subtext2 for a second, regular-weight
    paragraph below the (bold) tagline in subtext — used where the live site
    has a short kicker line followed by a longer, plainly-weighted paragraph."""
    IMAGE_MANIFEST.append((filename, label, page, source))
    cta_html = ""
    if cta_label and cta_href:
        cta_html = f'<a class="btn hero-cta" href="{cta_href}">{cta_label}</a>'
    sub2_html = f'<p class="sub regular">{subtext2}</p>' if subtext2 else ""
    return f"""
<section class="hero-cover">
  <img class="hero-cover-img" src="images/{filename}" alt="{label}"
       onerror="this.style.display='none';this.closest('.hero-cover').classList.add('img-missing');">
  <div class="hero-cover-scrim"></div>
  <div class="wrap hero-cover-content">
    <h1>{heading}</h1>
    <p class="sub">{subtext}</p>
    {sub2_html}
    {cta_html}
  </div>
</section>
"""


def page(filename, title, description, body, active=None):
    nav_items = ""
    for href, label in NAV:
        cls = ' class="active"' if href == active else ""
        nav_items += f'<li><a href="{href}"{cls}>{label}</a></li>\n'

    legal = " &middot; ".join(f'<a href="{href}">{label}</a>' for href, label in LEGAL_LINKS)

    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{description}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Roboto+Slab:wght@400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/style.css">
</head>
<body>
<header class="site">
  <div class="wrap nav-row">
    <div class="header-utility">
      <a href="mailto:info@enperfeitas.com" aria-label="Email">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4.5" width="19" height="15" rx="2"/><path d="M3 6l9 7 9-7"/></svg>
      </a>
      <a href="https://www.instagram.com/enperfeitas" target="_blank" rel="noopener" aria-label="Instagram">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none"/></svg>
      </a>
      <a href="https://www.facebook.com/enperfeitas" target="_blank" rel="noopener" aria-label="Facebook">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 8.5h2.5V5.2C16.1 5.1 15 5 13.7 5c-2.7 0-4.5 1.7-4.5 4.7v2.3H6.5v3.6h2.7V22h3.7v-6.4h2.7l.5-3.6h-3.2V10c0-1 .3-1.5 1.6-1.5z"/></svg>
      </a>
    </div>
    <a class="logo" href="index.html">
      <img src="images/logo.webp" alt="Enperfeitas" class="logo-img" style="display:none;"
           onload="this.style.display='block';this.nextElementSibling.style.display='none';"
           onerror="this.style.display='none';">
      <span class="logo-text">Enperfeitas</span>
    </a>
    <button class="nav-toggle" type="button" aria-label="Toggle navigation menu" aria-expanded="false">
      <span class="nav-toggle-bar"></span>
      <span class="nav-toggle-bar"></span>
      <span class="nav-toggle-bar"></span>
    </button>
    <nav class="primary"><ul>
      {nav_items}
    </ul></nav>
  </div>
</header>

{body}

<footer class="site">
  <div class="wrap footer-minimal">
    <p class="footer-tagline">Enperfeitas Studio &mdash; Stockholm. Making things that last.</p>
    <div class="footer-bottom" style="border-top:none;">
      <div>&copy; 2026 Enperfeitas Studio</div>
      <div>{legal}</div>
    </div>
  </div>
</footer>
<script src="js/nav.js"></script>
</body>
</html>
"""
    with open(os.path.join(DIST, filename), "w", encoding="utf-8") as f:
        f.write(html)


# ---------------------------------------------------------------- HOME
body = f"""
{hero_cover("hero-hands-tools.webp", "Some things<br>deserve to last",
            "Handbound books, albums, and boxes made in Stockholm &mdash; for the moments, stories, and work that matter too much for anything ordinary.",
            "Hands binding a book, surrounded by bookbinding tools", "Home",
            source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/1f0fa009-cffa-404f-8fa5-9d96459a6e65/Banner+custom+made+prodcuts.jpg?format=2500w")}

<section id="paths">
  <div class="wrap">
    <h2 style="text-align:center;">There are two kinds of people who find their way here.</h2>
    <div class="grid-2 two-paths">
      <div>
        <h3>I want to learn</h3>
        <p><em>Your creative sanctuary in Stockholm.</em></p>
        <p>Workshops, studio membership, tools, and space. A place in Stockholm where making things by hand is taken seriously.</p>
        <a class="btn" href="studio.html">Explore the Studio</a>
        <div class="path-image">
          {img_block("Inside Enperfeitas Studio", "home-studio-interior.webp", "Home", source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/581ca391-519a-4ce0-8f41-d8106c0796ce/IMG_1184.jpg?format=1500w")}
        </div>
      </div>
      <div>
        <h3>I need something made</h3>
        <p><em>Crafted to last generations.</em></p>
        <p>A wedding guest book. A family history finally bound. A portfolio that does justice to the work inside it. Something that will still exist &mdash; and still matter &mdash; in thirty years.</p>
        <a class="btn" href="collectibles.html" aria-label="See what I can make for you">See what I can make</a>
        <div class="path-image">
          {img_block("A row of orange and patterned notebooks on a shelf", "home-books-portfolio.webp", "Home", source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/60d2a1a0-3233-4204-9f1d-502c739571e4/Enperfeitas++Portfolio-17.jpg?format=1500w")}
        </div>
      </div>
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <p class="stat-line">30+ workshop &amp; studio sessions hosted every year</p>
    <h2 style="text-align:center;">What people say after holding it in their hands</h2>
    <div class="testimonials">
      {testimonial_card("Marbling Workshop",
        "We absolutely loved our experience with Marble &amp; Sip and created so many beautiful marbled sheets. Absolutely recommend as a couple's event, a ladies' night, or for a special occasion.",
        "Jonathan Ferland", "review-marbling.webp",
        source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/f1317dff-6574-4b3c-b0dd-56abbb38d324/DSCF7991.jpg?format=500w")}
      {testimonial_card("Marbled Notebooks &mdash; Swirls",
        "Very high quality work! Price was very fair, and I love the hand made look and feel of the product. Delivery was fast and excellent. It recently made the perfect gift to a loved one.",
        "Gustav Sj&ouml;", "review-notebooks.webp",
        source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/1701085614580-MES44X5GZNBCCN5HN5TC/09.png?format=500w")}
      {testimonial_card("Bookbinding Workshop &mdash; Curved Spine",
        "Otroligt mysigt hantverk med trevligt s&auml;llskap och en pedagogisk kursledare. Bra uppl&auml;gg och niv&aring;. Tiden bara rann iv&auml;g, och r&auml;ckte n&auml;stan inte till! Men vi gick alla d&auml;rifr&aring;n med riktigt fina b&ouml;cker.",
        "Tobias Jensen", "review-curved-spine.webp",
        source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/d68ae535-7f67-46a4-8eb8-4d2317f96f7a/Enperfeitas++Portfolio-12.jpg?format=500w")}
      {testimonial_card("Bookbinding Workshop &mdash; Exposed Spine",
        "I had a lot of fun making my first book ever &mdash; warmly encouraged and mentored by Suzete! I will come back!!!",
        "Anna Pehrsson", "review-exposed-spine.webp",
        source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/10bc6f08-57d2-4cd4-b02d-e9691d4b4f4a/Enperfeitas++Portfolio-30.jpg?format=500w")}
      {testimonial_card("Bookbinding Tools",
        "A lovely complete set of tools with great quality, just what you need to start your new bookbinding. Have fun, I did, I can't stop.",
        "Malin Chapo", "review-tools.webp",
        source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/e1f0df60-026a-4b1d-bf0f-fb9ba98c8dda/Enperfeitas+Starting+Kit-3.jpg?format=500w")}
      {testimonial_card("Punching Cradle",
        "Det ska bli sp&auml;nnande att anv&auml;nda &rdquo;vaggan&rdquo;.",
        "Inger Larsson", "review-punching-cradle.webp",
        source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/1710671846005-9IIF0I2E02M24G2CUZ3H/Enperfeitas+Punching+Cradle+v1+02.png?format=500w")}
      {testimonial_card("Free Undated Monthly Planner Template",
        "Tack sn&auml;lla - det var super topp. Den var perfekt att ha i min jobb kalender f&ouml;r att snabbt f&aring; en &ouml;versikt hur m&aring;nadens projekt ser ut. Ser fram emot att forts&auml;tta f&ouml;lja ditt arbete. Skulle g&auml;rna komma till din atelj&eacute;.",
        "G&ouml;rel Karlsson", None)}
      {testimonial_card("Punching Cradle Tutorial (DIY)",
        "S&aring; pedagogisk f&ouml;rklaring f&ouml;r att bygga en punching cradle &#10084;&#65039;",
        "Ankie Glas", "review-cradle-tutorial.webp",
        source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/1716657900220-HAOHSMDVWXJLQAV5YPTG/Cradle+Tutorial_+Thumbnail.jpg")}
    </div>
    <p style="text-align:center;margin-top:36px;">
      <a href="https://www.google.com/search?q=Enperfeitas+Studio&amp;stick=H4sIAAAAAAAA_-NgU1I1qDAxM02zTDM0NDU0TTNPTUmyMqiwsDS2sEiySDYyNzRIS0pOXsQq5JpXkFqUlppZklisEFxSmpKZDwCmFu_ePgAAAA&amp;hl=en&amp;mat=CZg19H7WyqDHElYBa0lj_-eaT3FTM3GMIqpZ4xVDWW-wqfy8BgwB3WyDzeGebgLQc7ANSDsE4ZaJOOFNgZ7gHobG_EdZvpBdvITqd0u_928pPlVTBVGEw9U14deZfmeWYA&amp;authuser=1#mpd=~14384720232423110040/customers/reviews" target="_blank" rel="noopener">See more recent reviews on Google &rarr;</a>
    </p>
  </div>
</section>

<section class="alt">
  <div class="wrap" style="text-align:center;">
    <a class="btn" href="studio.html">Join the Studio</a>
    <a class="btn secondary" href="collectibles.html">Discover Collectibles</a>
  </div>
</section>
"""
page("index.html", "Enperfeitas | Handbound Books, Bookbinding Workshops & Studio in Stockholm",
     "Handmade books, bespoke albums, and bookbinding workshops in Stockholm. Made to last. Made by hand.",
     body, active="index.html")

# ---------------------------------------------------------------- ABOUT
body = f"""
<section class="page-header wrap">
  <h1>Meet the artisan behind Enperfeitas:</h1>
</section>

<section>
  <div class="wrap grid-2">
    <div>
      <p class="kicker">Crafting with Passion and Precision</p>
      <p>As an <strong>architect</strong> and <strong>illustrator</strong>, Suzete blends creativity and meticulous craftsmanship to design handmade books, boxes, and portfolios that are truly <strong>one-of-a-kind</strong>. Each piece is crafted using the finest sustainable materials and traditional bookbinding techniques, ensuring durability, functionality, and timeless beauty.</p>
      <p>Based in <strong>Stockholm, Sweden</strong>, Enperfeitas Studio is dedicated to creating <strong>bespoke journals</strong>, <strong>wedding albums</strong>, <strong>guest books</strong>, and <strong>portfolio cases</strong> tailored to your vision. Now accepting commissions for personalized, handcrafted creations that stand out and tell your story.</p>
    </div>
    <div>
      {img_block("A woman with short hair and glasses sitting in an office, smiling, with a chocolate Labrador Retriever next to her. The office has white shelves with storage boxes and various supplies.", "about-suzete.webp", "About", source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/eb080efe-43a5-41c8-a49e-3034fb99113c/IMG_8774-3.jpg?format=1500w")}
    </div>
  </div>
</section>

<section>
  <div class="wrap" style="max-width:640px;">
    <blockquote>
      <p>&ldquo;Bookbinding is more than just a craft to me &mdash; it's a way to connect people and ideas, preserve stories and create lasting memories.</p>
      <p>Whether you want to share a personal journey, design a bespoke bookbinding piece, or showcase a professional portfolio, my handmade bookbinding services in Stockholm can bring your vision to life!&rdquo;</p>
    </blockquote>
    <p style="font-weight:700;">/Suzete</p>
  </div>
</section>

<section class="alt">
  <div class="wrap" style="text-align:center;">
    <h2>Follow along</h2>
    <p>Bookbinding techniques, corner jigs, workshop announcements, spine details, and handmade book examples &mdash; on Instagram <a href="https://www.instagram.com/enperfeitas" target="_blank" rel="noopener">@enperfeitas</a>.</p>
    <a class="btn secondary" href="https://www.instagram.com/enperfeitas" target="_blank" rel="noopener">View on Instagram</a>
  </div>
</section>

<section id="newsletter">
  <div class="wrap" style="max-width:520px;text-align:center;">
    <h2>Enperfeitas Newsletter</h2>
    <p>Sign up to hear about workshops, new books, exclusive offers, and special events &mdash; plus fun, quirky insights about life as a bookbinder and the occasional simple-book tutorial.</p>
    <a class="btn" href="newsletter.html" aria-label="Sign up for the newsletter">Sign up</a>
    <p style="margin-top:14px;color:var(--muted);font-size:0.85rem;">We respect your privacy.</p>
  </div>
</section>
"""
page("about.html", "About | Enperfeitas Studio",
     "Meet Suzete, the architect and illustrator behind Enperfeitas Studio in Stockholm.",
     body, active="about.html")

# ---------------------------------------------------------------- THE STUDIO
membership_accordion = accordion([
    ("Description", "<p>You get access to the studio, bookbinding tools, and a flexible workspace. Support is available, but sessions are intended for independent work. Spaces are LIMITED.</p>"),
    ("Pricing", "<p>Regular access to the studio on set days/times with two different packages:</p><ul><li>Basic &mdash; 1,200 SEK</li><li>Premium &mdash; 1,800 SEK</li></ul>"),
    ("Members operating hours", "<p>The studio will be available for members 2 or 3 days a week (depending on the package you choose):</p><ul><li>Basic: Tuesdays and Thursdays, 17:00&ndash;20:00</li><li>Premium: Tuesdays, Wednesdays and Thursdays, 17:00&ndash;20:00</li></ul><p>The studio will be closed on public holidays and may occasionally close for special events. You will be notified as early as possible about any planned closures.</p>"),
    ("Benefits", "<ul><li>Access to dedicated workspace and all bookbinding, printing, and finishing equipment</li><li>Complimentary introduction sessions to familiarize you with the equipment</li><li>15% discount on all workshops</li><li>15% discount on materials from the Enperfeitas shop</li><li>Invitations to all special events at Enperfeitas Studio</li></ul>"),
    ("Who is this for?", "<p>From casual to serious hobbyists, busy creatives, mindful makers, aspiring pros and collectors/restoration enthusiasts. Those who value a laid-back environment over structured lessons, and people who want flexible access to a professional studio to create as a form of meditation or stress relief.</p><p>PS: to ensure a safe, efficient environment for everyone, new members must either have attended at least one Enperfeitas Studio workshop (or a comparable bookbinding course), or demonstrate prior knowledge of basic bookbinding techniques and tools usage. Unsure whether you meet the requirements? Get in touch &mdash; we're happy to guide you to the best next steps.</p>"),
])

workshop_accordion = accordion([
    ("Description", "<p>Enperfeitas Studio offers a beautifully designed, fully-equipped workspace for like-minded creators to run their workshops. Our inspiring environment is ideal for small groups (up to 6&ndash;8 people), and offers everything you need to deliver a memorable experience, whether you're teaching bookbinding, art, or any other craft.</p>"),
    ("Pricing", "<ul><li>Half-day rental (4 hours): 1,500 SEK</li><li>Full-day rental (8 hours): 2,250 SEK</li></ul><p>Prices exclude VAT. Dates available can be checked in advance by reaching us via email.</p>"),
    ("Additional fees (optional)", "<ul><li>Cleaning fee: 500 SEK</li><li>Snacks and refreshments (fika, fruit, juices, coffee, tea): 100 SEK per participant</li><li>Damage or repair fees, based on any repairs needed after your workshop</li></ul>"),
    ("Benefits", "<ul><li>Fully equipped space: access to tools and equipment to host a professional, seamless workshop</li><li>A serene atmosphere, free from big-city distractions &mdash; students can focus fully</li><li>Easy-to-access studio, convenient for you and your attendees</li><li>Become part of a community of like-minded creatives</li></ul>"),
    ("Who is this for?", "<p>Artists, crafters, and designers looking for a well-lit, fully-equipped space to teach specialized skills &mdash; watercolor painting, ceramics (if portable), calligraphy, or design tutorials. Bookbinders or craft instructors who don't have a dedicated venue but want a cosy environment that matches the handcrafted aesthetic of their lessons. Local hobby groups and instructors just testing ideas are welcome too.</p>"),
])

events_accordion = accordion([
    ("Description", "<p>A series of free, collaborative sessions designed to bring creatives together in a safe and supportive environment. These events are all about sharing knowledge, exchanging ideas, and fostering creativity across different fields. Whether you're a writer, designer, or crafter, these sessions provide a platform to learn from others, showcase your work, and connect with a vibrant community of like-minded individuals.</p>"),
    ("How it works?", "<p>No fees, just passion: these events are free to attend, and all we ask is that you come ready to share your creative journey, tips, or even challenges. To ensure a smooth experience, we'll have a sign-up list &mdash; choose whether you want to share something (a project, technique, or experience) or simply join and learn.</p>"),
    ("Event structure", "<p>Each session focuses on one or two creative topics, guided by participants who sign up to share their expertise. Everyone is encouraged to participate, either by sharing or contributing to discussions.</p>"),
    ("How to join", "<p>Sign up by reserving your (free) spot, indicating if you'd like to share or attend. Bring something to share &mdash; a work-in-progress, a technique, or just an idea &mdash; there's no pressure, just a supportive environment.</p>"),
])

body = f"""
<section>
  <div class="wrap grid-2">
    <div>
      <h1 class="title-lg">What's New at Enperfeitas Studio?</h1>
      <p>The mission is to build a thriving community where skills, ideas, and inspiration come together. Whether you're an instructor seeking the perfect workshop venue or a creator eager to explore a new craft, the studio provides the tools, space, and support to turn your passion into something extraordinary.</p>
      <p>Here&rsquo;s what you&rsquo;ll find at the studio:</p>
      <ul>
        <li><strong>Membership access:</strong> join as a studio member and enjoy access to tools, resources, and a collaborative workspace.</li>
        <li><strong>Workshop space:</strong> ideal for creators to host workshops and share their skills.</li>
        <li><strong>Creative events:</strong> participate in unique events designed to inspire, connect, and celebrate creativity.</li>
      </ul>
      <a class="btn secondary" href="#offerings">See what's right for you &darr;</a>
    </div>
    <div class="v-center-cell">
      {doodle_icon("A doodle with an interrogation mark", "studio-question-mark.webp", "The Studio", source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/e5eb8326-7b34-401e-acb9-92430fe7bf97/New+at+the+studio?format=1500w", large=True)}
    </div>
  </div>
</section>

<section class="alt" id="offerings">
  <div class="wrap grid-3">
    <div class="accordion-card featured">
      <span class="badge">Most popular</span>
      {doodle_icon("A doodle illustrating a membership pass", "studio-workshop-space.webp", "The Studio", source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/83395405-0582-4828-9297-49d68080f45a/Enperfeitas+doodles?format=1000w")}
      <h3>Membership Pass</h3>
      <div class="price">From 1,200 SEK</div>
      {membership_accordion}
      <a class="btn" href="studio-membership.html">Become a member</a>
    </div>
    <div class="accordion-card">
      {doodle_icon("A doodle illustrating collaboration and brainstorming", "studio-creative-events.webp", "The Studio", source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/42cb4145-027a-46fe-ad67-f4b778afd604/Enperfeitas+doodles?format=1000w")}
      <h3>Workshop Space</h3>
      <div class="price">From 1,500 SEK</div>
      {workshop_accordion}
      <a class="btn" href="book-workshop-space.html">Book your space</a>
    </div>
    <div class="accordion-card">
      {doodle_icon("A doodle illustrating creatives hanging out", "studio-hangout.webp", "The Studio", source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/bde8fd72-9d96-4980-9a29-cf177dc2b5d8/Enperfeitas+doodles?format=1000w")}
      <h3>Creative Events</h3>
      <div class="price">Free</div>
      {events_accordion}
      <a class="btn secondary" href="mailto:info@enperfeitas.com?subject=Creative%20Events">Join an event</a>
    </div>
  </div>
</section>

<section class="section-tight">
  <div class="wrap" style="text-align:center;">
    <h2>Want to give it a try first?</h2>
    <p style="max-width:520px;margin:0 auto 24px;color:var(--muted);">A no-pressure way to see if the studio is right for you, before committing to a membership.</p>
    <ul style="max-width:640px;margin:0 auto 28px;text-align:left;">
      <li><strong>Explore</strong> the space, use the tools and materials, and see how the calm, creative atmosphere works for you.</li>
      <li><strong>Limited</strong> spots available each day to ensure comfort and focus &mdash; book early to secure yours.</li>
      <li>If you decide to <strong>join within 48 hours</strong>, your trial fee will be deducted from your first month&rsquo;s membership.</li>
    </ul>
    <a class="btn secondary" href="studio-membership.html">See membership plans</a>
  </div>
</section>

<section class="alt">
  <div class="wrap grid-2">
    <div>
      <h2>Curious about Enperfeitas Studio?</h2>
      <p>Join me for the <strong>Open Studio</strong> events, where you can explore the space, meet fellow creatives, and get a glimpse of what we offer. It's the perfect opportunity to tour the studio, connect with the community, and learn about upcoming workshops and events.</p>
      <p>Stay updated on event dates by subscribing to our newsletter. Don&rsquo;t miss out &mdash; join today and be the first to know about everything happening at Enperfeitas Studio!</p>
      <a class="btn" href="newsletter.html" aria-label="Sign up for the newsletter">Sign up</a>
    </div>
    <div>
      {img_block("Enperfeitas studio interior", "studio-hero.webp", "The Studio", source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/c36072cd-a769-4cd4-afb1-45247360fb1a/Enperfeitas+studio?format=1000w")}
    </div>
  </div>
</section>
"""
page("studio.html", "The Studio | Enperfeitas",
     "Studio membership, workshop space rental, and creative events at Enperfeitas Studio, Stockholm.",
     body, active="studio.html")

# ---------------------------------------------------------------- STUDIO MEMBERSHIP
body = f"""
<section class="page-header wrap">
  <h1>Studio Memberships</h1>
  <p>You get access to the studio, bookbinding tools, and a flexible workspace. Support is available, but sessions are intended for independent work. Spaces are limited.</p>
</section>

<section>
  <div class="wrap grid-2">
    <div class="card shop-card">
      {img_block("A bookbinding workbench with a yellow lamp, tools, and a paper cutter, part of the Enperfeitas studio", "workshop-space-main-room-1.webp", "Studio Membership", source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/2285783b-a1c2-4ed8-8d70-360ba39c323f/IMG_1184.jpeg?format=750w")}
      <div class="shop-card-body">
        <h3>Basic</h3>
        <div class="price">1,200 SEK <span style="color:var(--muted);font-weight:400;font-size:0.85rem;">/ month</span></div>
        <ul class="offer-list">
          <li>Flexible studio access, minimal instruction</li>
          <li>Community vibe, low stress</li>
          <li>Tuesdays &amp; Thursdays, 17:00&ndash;20:00</li>
        </ul>
        <span class="btn secondary disabled">Coming soon</span>
        <p class="construction-note">Online sign-up for Basic membership is being set up. Want to join now? Email <a href="mailto:info@enperfeitas.com?subject=Studio%20Membership%20-%20Basic">info@enperfeitas.com</a> and we'll sort out payment directly.</p>
      </div>
    </div>
    <div class="card shop-card">
      {img_block("A bookbinding workbench with tools laid out, part of the Enperfeitas studio", "workshop-space-main-room-2.webp", "Studio Membership", source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/c12f7977-403f-4491-8d4c-aab380a14edd/IMG_1183.jpeg?format=750w")}
      <div class="shop-card-body">
        <h3>Premium</h3>
        <div class="price">1,800 SEK <span style="color:var(--muted);font-weight:400;font-size:0.85rem;">/ month</span></div>
        <ul class="offer-list">
          <li>Everything in Basic, plus monthly 1-on-1 coaching</li>
          <li>Community vibe, low stress</li>
          <li>Tuesdays, Wednesdays &amp; Thursdays, 17:00&ndash;20:00</li>
        </ul>
        <span class="btn secondary disabled">Coming soon</span>
        <p class="construction-note">Online sign-up for Premium membership is being set up. Want to join now? Email <a href="mailto:info@enperfeitas.com?subject=Studio%20Membership%20-%20Premium">info@enperfeitas.com</a> and we'll sort out payment directly.</p>
      </div>
    </div>
  </div>
  <div class="wrap embed-note" style="margin-top:28px;">
    The studio will be closed on public holidays and may occasionally close for special events &mdash; you'll be notified as early as possible about any planned closures. Online sign-up is on its way &mdash; in the meantime, use the email link on either membership above to join directly.
  </div>
</section>

<section class="alt">
  <div class="wrap grid-2">
    <div>
      <h2>Benefits</h2>
      <ul>
        <li>Access to dedicated workspace and all bookbinding, printing, and finishing equipment</li>
        <li>Complimentary introduction sessions to familiarize you with the equipment</li>
        <li>15% discount on all workshops</li>
        <li>15% discount on materials from the Enperfeitas shop</li>
        <li>Invitations to all special events at Enperfeitas Studio</li>
      </ul>
    </div>
    <div>
      <h2>Who is this for?</h2>
      <p>From casual to serious hobbyists, busy creatives, mindful makers, aspiring pros and collectors/restoration enthusiasts. Those who value a laid-back environment over structured lessons, and people who want flexible access to a professional studio to create as a form of meditation or stress relief.</p>
      <p style="color:var(--muted);font-size:0.92rem;">PS: to ensure a safe, efficient environment for everyone, new members must either have attended at least one Enperfeitas Studio workshop (or a comparable bookbinding course), or demonstrate prior knowledge of basic bookbinding techniques and tools usage. Unsure whether you meet the requirements? Get in touch &mdash; we're happy to guide you to the best next steps.</p>
    </div>
  </div>
</section>

<section>
  <div class="wrap" style="text-align:center;">
    <h2>Want to give it a try first?</h2>
    <ul style="max-width:640px;margin:0 auto 28px;text-align:left;">
      <li><strong>Explore</strong> the space, use the tools and materials, and see how the calm, creative atmosphere works for you.</li>
      <li><strong>Limited</strong> spots available each day to ensure comfort and focus &mdash; book early to secure yours.</li>
      <li>If you decide to <strong>join within 48 hours</strong>, your trial fee will be deducted from your first month&rsquo;s membership.</li>
    </ul>
    <span class="btn secondary disabled">Coming soon</span>
    <p class="construction-note" style="margin-left:auto;margin-right:auto;">Trial-day booking is being set up. Curious now? Email <a href="mailto:info@enperfeitas.com?subject=Membership%20trial">info@enperfeitas.com</a> and ask about a trial.</p>
  </div>
</section>
"""
page("studio-membership.html", "Studio Memberships | Enperfeitas",
     "Basic and Premium studio membership passes at Enperfeitas Studio, Stockholm.",
     body, active="studio.html")

# ---------------------------------------------------------------- BOOK WORKSHOP SPACE
body = f"""
<section class="page-header wrap">
  <h1>Rent Enperfeitas Workshop Space</h1>
  <p>Looking to host your own class or creative event?</p>
</section>

<section>
  <div class="wrap grid-2">
    <div>
      <p>Enperfeitas Studio occasionally opens its doors to other creatives, artists, and small collectives who wish to use the workshop space for aligned activities &mdash; from intimate art sessions to mindful creative gatherings.</p>
      <p>Because the studio is an active bookbinding atelier, we review all applications carefully to ensure that each activity fits the atmosphere of the space: calm, thoughtful, and rooted in craft and creativity.</p>
      <p>If you&rsquo;d like to host your event, project, or creative day here, please submit an Application for Studio Use below.</p>
    </div>
    <div>
      {img_block("A sidewalk with fallen autumn leaves outside the Enperfeitas building", "workshop-space-exterior.webp", "Book Workshop Space", source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/2777cd2c-e628-4837-9401-3590116b77d7/Enperfeitas+Studio+Images-02.jpg?format=1000w")}
    </div>
  </div>
</section>

<section class="alt">
  <div class="wrap">
    <h2>What you get</h2>
    <div class="grid-2">
      <ul>
        <li><strong>Fully-equipped workshop area:</strong> tables, chairs, and select craft tools suitable for up to 6&ndash;8 participants.</li>
        <li><strong>Flexible booking options:</strong> half-day or full-day rentals at transparent rates.</li>
        <li><strong>Inviting atmosphere:</strong> artful decor, ample lighting, and a cosy vibe that encourages creativity.</li>
        <li><strong>Optional add-ons:</strong> cleaning service, snacks/refreshments, and more.</li>
        <li><strong>Shared facilities:</strong> kitchen (coffee/tea available), WC, and lounge area.</li>
        <li><strong>Tools &amp; equipment:</strong> specialised tools, including cutting mats, paper folders, craft knives, metal rulers, paper pressers, and two guillotines (heavy-duty &amp; bookbinding).</li>
      </ul>
      <div class="grid-2" style="gap:16px;">
        {img_block("Enperfeitas main room", "workshop-space-main-room-1.webp", "Book Workshop Space", small=True, source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/2285783b-a1c2-4ed8-8d70-360ba39c323f/IMG_1184.jpeg?format=750w")}
        {img_block("Enperfeitas main room", "workshop-space-main-room-2.webp", "Book Workshop Space", small=True, source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/c12f7977-403f-4491-8d4c-aab380a14edd/IMG_1183.jpeg?format=750w")}
        {img_block("Enperfeitas living room", "workshop-space-living-room.webp", "Book Workshop Space", small=True, source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/9bbfb37b-ea7c-4a32-82ec-b113450ad092/IMG_1378+3.jpeg?format=750w")}
        {img_block("Indoor room with wooden floor, work tables and a bookshelf", "workshop-space-common-area.webp", "Book Workshop Space", small=True, source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/a73f345a-1a9d-4dcd-8d81-8eeddf18283b/Enperfeitas+Studio+Images-10.jpg?format=750w")}
      </div>
    </div>
  </div>
</section>

<section>
  <div class="wrap grid-2">
    <div>
      <h2>Pricing &amp; add-ons</h2>
      <ul>
        <li>Half-day (4 hours): <strong>1,500 SEK</strong></li>
        <li>Full day (8 hours): <strong>2,250 SEK</strong></li>
        <li>Cleaning fee (optional): +500 SEK</li>
        <li>Snacks &amp; refreshments (optional): +100 SEK per participant</li>
      </ul>
      <p style="color:var(--muted);font-size:0.9rem;">Prices exclude VAT.</p>
    </div>
    <div>
      <h2>Cancellation policy</h2>
      <ul>
        <li>More than 4 weeks before: 100% refund.</li>
        <li>2&ndash;4 weeks before: 50% refund.</li>
        <li>Less than 2 weeks before: no refund.</li>
        <li>Rescheduling is possible if requested at least 2 weeks in advance (subject to availability).</li>
      </ul>
    </div>
  </div>
</section>

<section class="alt">
  <div class="wrap">
    <h2>Additional information</h2>
    <ul>
      <li>Address: Gudmundr&aring;gatan 10, R&aring;cksta&ndash;V&auml;llingby, Stockholm.</li>
      <li>If needed, a key will be provided upon arrival.</li>
      <li>The space should be returned to its original condition.</li>
      <li>Please remove all personal belongings and dispose of any trash.</li>
      <li>If using shared facilities (kitchen, WC), ensure they are left tidy.</li>
    </ul>
  </div>
</section>

<section>
  <div class="wrap">
    <h2>How to apply</h2>
    <p><strong>1. Read before applying.</strong> The studio is designed for small-scale, creative, and respectful use. Ideal activities include:</p>
    <ul>
      <li>Art or craft workshops</li>
      <li>Creative meet-ups or co-creation sessions</li>
      <li>Photography or content creation with a focus on craftsmanship</li>
      <li>Artist-led classes, intimate talks, or creative wellness sessions</li>
    </ul>
    <p style="color:var(--muted);">We do not host loud events, parties, or commercial product launches.</p>
    <p><strong>2. Submit your application.</strong> Online applications are coming soon &mdash; for now, email your application directly (see below). You&rsquo;ll be asked to share:</p>
    <ul>
      <li>A short description of your activity</li>
      <li>Estimated number of participants (max 6)</li>
      <li>Preferred date(s) and duration</li>
      <li>Set up or equipment you&rsquo;ll need</li>
      <li>How your session aligns with the spirit of Enperfeitas Studio</li>
    </ul>
    <p><strong>3. Review process.</strong> Each request is personally reviewed by Suzete. If the proposal fits the studio&rsquo;s creative vision, you&rsquo;ll receive a follow-up email with availability, pricing, and next steps.</p>
    <p><strong>4. Confirmation.</strong> Only after approval will the booking be finalised. Payment is required to secure your date.</p>
  </div>
</section>

<section class="alt" style="text-align:center;">
  <div class="wrap" style="max-width:600px;">
    <h2>Application for Studio Use</h2>
    <span class="btn disabled">Coming soon</span>
    <p class="construction-note" style="margin-left:auto;margin-right:auto;">The online application form is being set up. To apply now, email <a href="mailto:info@enperfeitas.com?subject=Studio%20Space%20Application">info@enperfeitas.com</a> with your activity, group size, and preferred date(s) &mdash; see the details above.</p>
  </div>
</section>
"""
page("book-workshop-space.html", "Book Workshop Space | Enperfeitas",
     "Rent the Enperfeitas studio space in Stockholm for your own workshop or creative event.",
     body, active="studio.html")

# ---------------------------------------------------------------- WORKSHOPS
# Cancellation policy is identical, verbatim, on every workshop card on the
# live site (bookbinding and marbling alike) — kept as one constant so it
# stays in sync everywhere instead of drifting between copies.
WORKSHOP_CANCELLATION = (
    "<p>A full refund is possible if the course is cancelled up to 4 weeks before the starting date. "
    "After that, a refund of 50% is possible, or rebooking to a later workshop &mdash; if available. "
    "In the case of cancellation within less than 14 days before the start of the course, unfortunately, "
    "a refund isn't possible anymore and the reservation will be lost.</p>"
    "<p>I reserve the right to cancel the workshop in case of illness or too few participants. "
    "In that case, the full amount will then be refunded.</p>"
)

def workshop_card(title, photo_label, photo_filename, photo_source, items, book_url, book_label, featured=False):
    """A workshop offering: photo, title, an accordion of details (Description /
    What you'll learn / Cancellation policy, plus whatever extra items that
    particular workshop has on the live site), and a booking button. Reuses
    the .accordion-card component built for the Studio page.

    book_label can be "Reserve your seat - <Workshop Name>" to disambiguate
    which button is which for a screen-reader user tabbing through the page
    (that context is otherwise carried only by the h3 sitting above it).
    Repeating the workshop name in the *visible* label, though, is what was
    pushing these buttons onto two lines inside a narrow card. So the visible
    text is trimmed to the short, generic action ("Reserve your seat") and
    the full, disambiguated text is kept for assistive tech via aria-label."""
    cls = "accordion-card featured" if featured else "accordion-card"
    display_label = book_label.split(" - ")[0] if " - " in book_label else book_label
    return f"""
    <div class="{cls}">
      {img_block(photo_label, photo_filename, "Workshops", source=photo_source)}
      <h3>{title}</h3>
      {accordion(items)}
      <a class="btn" href="{book_url}" target="_blank" rel="noopener" aria-label="{book_label}">{display_label}</a>
    </div>
    """

body = f"""
{hero_cover("workshops-cover.webp", "Bookbinding &amp; Creative Workshops in Stockholm",
            "Learn with me for a day.",
            "Hands arranging notebooks and marbled paper on a table", "Workshops",
            source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/87788798-3932-4497-874b-5bb812ee17b3/IMG_9149.jpg?format=2500w",
            subtext2="From personalized journals to marbling techniques and artist&rsquo;s books, my workshops in Stockholm provide a hands-on, meditative space to learn, create, and connect. Perfect for beginners and experienced crafters alike, each session is designed to inspire and empower your creativity.")}

<section>
  <div class="wrap grid-2 match-height">
    <div>
      <p>Each workshop is thoughtfully designed to <strong>reduce stress</strong> and <strong>celebrate the joy of creativity</strong>. Here, the focus isn&rsquo;t on rushing but on embracing the process &mdash; learning at your pace, sharing ideas, and crafting something truly unique with your own hands.</p>
      <p>Participants will have access to premium materials, traditional bookbinding tools, and a curated library of resources for inspiration in the studio.</p>
      <p>Workshops are conducted in <strong>Swedish, English, or Portuguese</strong>, ensuring an inclusive and comfortable experience for all skill levels and backgrounds.</p>
      <div class="faq-list">
        {accordion([
          ("Where is the bookbinding studio located?",
           "<p>The studio is located in Stockholm, Sweden, with an address in Gudmundr&aring;gatan 10, V&auml;llingby &mdash; R&aring;cksta. It takes about 8 min to walk from R&aring;cksta metro station.</p>"),
          ("What to expect?",
           "<ul>"
           "<li><strong>Warm welcome &amp; orientation:</strong> Begin the day with a brief history of bookbinding traditions. Meet fellow creatives over a cup of coffee or tea, and get a sense of the day&rsquo;s flow.</li>"
           "<li><strong>Step-by-step instruction:</strong> You&rsquo;ll learn to prepare signatures (the sets of pages), properly fold and stitch using classic techniques, and secure your cover with premium fabrics or leathers. Throughout the workshop, we&rsquo;ll discuss the &ldquo;why&rdquo; behind each step &mdash; so you leave understanding both the craft and the heritage.</li>"
           "<li><strong>High-quality materials:</strong> All supplies are provided: papers, threads, covers, and professional-grade adhesives. Carefully curated for durability and a refined finish.</li>"
           "<li><strong>Small group, personalized attention:</strong> We keep the workshop cozy (no large classes!), ensuring you get hands-on help whenever needed. Feel free to ask questions at every step.</li>"
           "<li><strong>A finished book to take home:</strong> By the end, you&rsquo;ll have a completed, heirloom-quality creation &mdash; be it a journal, sketchbook, or memory keeper. It&rsquo;s the perfect gift for yourself or a loved one.</li>"
           "</ul>"),
          ("Who It&rsquo;s for?",
           "<ul>"
           "<li><strong>Beginners:</strong> No experience? No problem. We&rsquo;ll guide you through every step with patience.</li>"
           "<li><strong>Craft enthusiasts:</strong> Enhance your skill set with a new medium and elevate your DIY projects.</li>"
           "<li><strong>Gift seekers:</strong> Walk away with a thoughtful, one-of-a-kind present for weddings, birthdays, or special milestones.</li>"
           "</ul>"),
          ("Can I book a group workshop for friends or colleagues?",
           "<p>If you are looking for a one-time session for a group of friends or a team, there are more dates available to book, so please contact me for more details at <a href='mailto:info@enperfeitas.com'>info@enperfeitas.com</a>.</p>"),
        ])}
      </div>
    </div>
    <div>
      {img_block("The interior of the bookbinding studio", "workshops-hero.webp", "Workshops", source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/cb5ce03a-2c35-42b2-97f5-cf61fc0b10c5/Enperfeitas+Studio+Interior?format=1000w")}
    </div>
  </div>
</section>

<section class="alt">
  <div class="wrap" style="text-align:center;">
    <h2>Bookbinding Workshops</h2>
  </div>
  <div class="wrap">
    <div class="grid-3 cards-row" style="margin-top:28px;">
      {workshop_card("Concertina and Single Section",
        "Hands folding paper for a concertina and single-section book", "workshop-single-section.webp",
        "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/a2df02db-2cac-4075-b01f-8521377d037c/IMG_9343.jpg?format=1000w",
        [
          ("Description",
           "<p>In this workshop, I will teach you how to make a Concertina and a Single Section binding this time. "
           "Both are great beginner techniques to learn and are great to be used as sketchbooks, mini albums or journals. "
           "Together, we will be indulging in a focused, hands-on creation to remember. At the end of this workshop, "
           "you will have your own handmade books, skills and knowledge to make your own books at home.</p>"),
          ("What you will learn",
           "<ul><li>Basics in how to work paper</li><li>How to fold paper</li><li>How to prepare for sewing</li>"
           "<li>How to make book covers</li><li>How to assemble different book structures</li></ul>"),
          ("Cancellation policy", WORKSHOP_CANCELLATION),
        ],
        "https://enperfeitas.as.me/singlecase", "Reserve your seat - Single Section")}
      {workshop_card("Curved Spine",
        "Hands shaping the curved spine of a Bradel binding", "workshop-curved-spine.webp",
        "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/d68ae535-7f67-46a4-8eb8-4d2317f96f7a/Enperfeitas+Portfolio-12.jpg?format=1000w",
        [
          ("Description",
           "<p>This time I will be teaching you how to make a Bradel binding. This is a twist on the classic Perfect "
           "Spine book, where the spine is curved for a more distinct look. I have to confess that this one is my "
           "favourite. At the end of this workshop, you will have your handmade books, skills and knowledge to make "
           "your books at home.</p>"),
          ("What you will learn",
           "<ul><li>Basics in how to work paper</li><li>How to fold paper</li><li>How to prepare for sewing</li>"
           "<li>How to sew a whole book block</li><li>How to curve the spine</li><li>How to make book covers</li>"
           "<li>How to assemble the book</li></ul>"),
          ("Cancellation policy", WORKSHOP_CANCELLATION),
        ],
        "https://enperfeitas.as.me/curvedspine", "Reserve your seat - Curved Spine")}
      {workshop_card("Exposed Spine",
        "A finished exposed-spine binding showing the sewn spine and bands", "workshop-exposed-spine.webp",
        "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/4afb904c-0865-4e87-887a-d0af2f3a377e/Enperfeitas+Portfolio-29.jpg?format=1000w",
        [
          ("Description",
           "<p>This time, I will be teaching you how to make an Exposed binding. This is one of my follower&rsquo;s "
           "favourites. Where the beauty of the sewn spine gets to shine with the help of bands and cords. Here I "
           "will show you how to achieve a gorgeous look without having to use a sewing frame.</p>"),
          ("What you will learn",
           "<ul><li>Basics in how to work paper</li><li>How to fold paper</li><li>How to prepare for sewing</li>"
           "<li>How to sew a whole book block without a sewing frame</li><li>How to make book covers</li>"
           "<li>How to assemble the book</li></ul>"),
          ("Cancellation policy", WORKSHOP_CANCELLATION),
        ],
        "https://enperfeitas.as.me/exposedspine", "Reserve your seat - Exposed Spine")}
    </div>
  </div>
</section>

<section>
  <div class="wrap" style="text-align:center;">
    <h2>Marbling Workshops</h2>
  </div>
  <div class="wrap">
    <div class="grid-2 cards-row" style="margin-top:28px;">
      {workshop_card("Marble &amp; Sip",
        "A hand marbling paper with orange, yellow, and blue inks in a shallow bath", "workshops-marbling.webp",
        "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/f1317dff-6574-4b3c-b0dd-56abbb38d324/DSCF7991.jpg?format=1000w",
        [
          ("Description",
           "<p>Indulge in a unique blend of creativity and relaxation with our Marble and Sip workshop in V&auml;llingby. "
           "This hands-on event lets you unwind and create in a sophisticated setting, whether you&rsquo;re celebrating "
           "a special occasion or simply treating yourself to a memorable night out.</p>"),
          ("Highlights",
           "<ul>"
           "<li><strong>Marbling magic:</strong> Create intricate, one-of-a-kind marbled designs on paper and personal items, guided by expert tips on blending colours and experimenting with patterns.</li>"
           "<li><strong>Relaxed atmosphere:</strong> Enjoy a seasonal drink and curated music as you unwind, focus, and explore your creativity.</li>"
           "<li><strong>Take-home art:</strong> Leave with unique sheets of marbled paper, perfect for projects or display. Upgrade to a custom-bound book with your marbled paper for a special keepsake.</li>"
           "<li><strong>For all levels:</strong> Whether you're new or experienced, this workshop offers a welcoming space to learn, experiment, and enjoy.</li>"
           "</ul>"),
          ("Important details",
           "<ul>"
           "<li><strong>Languages available:</strong> The workshop can be conducted in Swedish, English, or Portuguese, ensuring you feel comfortable and connected.</li>"
           "<li><strong>Materials provided:</strong> All materials needed are included in the workshop price, so you can fully focus on the experience.</li>"
           "<li><strong>Personal touch:</strong> This workshop emphasizes free-form creation over strict technique, allowing you to play with designs and enjoy the process.</li>"
           "<li><strong>Pick-Up for marbled items:</strong> Marbled paper requires drying time. You&rsquo;ll be notified when your creations are ready for pick-up.</li>"
           "</ul>"),
          ("Cancellation policy", WORKSHOP_CANCELLATION),
          ("Private Event?",
           "<p>Want a more intimate and exclusive experience? Book a private Marble &amp; Sip session tailored just for "
           "you! Enjoy full creative freedom, schedule flexibility, and an enhanced experience for up to 10 people. "
           "Private sessions come with an additional fee to cover exclusive studio use, customized planning, and "
           "personal guidance. Get in touch to craft your perfect creative event: "
           "<a href='mailto:info@enperfeitas.com?subject=Private%20marbling%20session'>info@enperfeitas.com</a></p>"),
        ],
        "https://enperfeitas.as.me/marbleandsip", "Reserve your seat - Marble and Sip", featured=True)}
      {workshop_card("Marbling Lab (Advanced)",
        "Marbling inks and brushes laid out ready to use in the studio", "workshop-marbling-lab.webp",
        "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/251ba560-421c-4763-915f-b4588cf0b465/IMG_4682.jpeg?format=1000w",
        [
          ("Description",
           "<p>A Creative Session for Experienced Marblers. Already familiar with the magic of marbling and want to dive "
           "straight into creating? This session is designed for those who have marbled before and want access to a "
           "fully prepared studio space, hands-on creating.</p>"),
          ("What to expect",
           "<ul><li>A ready-to-use marbling bath and all essential materials are provided.</li>"
           "<li>3 hours of uninterrupted time to explore your colours, patterns, and ideas.</li>"
           "<li>A supportive studio environment with everything set up for you.</li></ul>"),
          ("Cancellation policy", WORKSHOP_CANCELLATION),
          ("Important to know",
           "<ul><li>This session skips the theory and demonstrations &mdash; basic marbling experience is required.</li>"
           "<li>Your papers will require drying time. You&rsquo;ll need to consider some last-minute drying time or decide on an alternative pickup time.</li></ul>"),
        ],
        "https://enperfeitas.as.me/marblinglab", "Reserve your seat - Marbling Lab")}
    </div>
  </div>
</section>

<section class="alt">
  <div class="wrap grid-2">
    <div>
      <h2>Seasoned Crafter?</h2>
      <p>Already have some experience with bookbinding and just need a personal bookbinding oasis when you have access to tools and just create? No rush, no pressure. Have a look at the memberships the studio has to offer to you.</p>
      <a class="btn" href="studio-membership.html" aria-label="Become a studio member">Become a member</a>
    </div>
    <div>
      {img_block("A group working on a crafting project together at a table", "workshops-team-building.webp", "Workshops", source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/4aeb087a-f6a7-4015-a4f2-1fc1811936bb/Enperfeitas+Workshop+Creations-59.jpg?format=1000w")}
    </div>
  </div>
</section>

<section>
  <div class="wrap grid-2">
    <div>
      <h2>Team-Building Bookbinding Workshops</h2>
      <p>Strengthen your team&rsquo;s bond while exploring the creative art of bookbinding. These tailored sessions offer a collaborative, stress-free environment where your team can learn, create, and connect.</p>
      <p>Whether your group consists of beginners or has a mix of crafting skills, our workshops are designed to cater to all levels. Together, you&rsquo;ll enjoy the journey of crafting something beautiful while celebrating each team member&rsquo;s unique contribution.</p>
      <div class="faq-list">
        {accordion([
          ("Good to know:",
           "<p>The final cost is adjusted according to the number of participants and travel costs to your working space.</p>"),
          ("Workshop details:",
           "<ul><li><strong>Location:</strong> Your workplace or chosen venue</li>"
           "<li><strong>Duration:</strong> 4 hours of hands-on bookbinding</li>"
           "<li><strong>Participants:</strong> Up to 10 people per session</li>"
           "<li><strong>Materials:</strong> All tools and materials are provided</li></ul>"),
          ("What you'll learn",
           "<p>During the session, participants will learn foundational bookbinding techniques, including:</p>"
           "<ul><li><strong>Paper preparation:</strong> Folding, trimming, and handling</li>"
           "<li><strong>Cover design:</strong> Preparing and customizing covers</li>"
           "<li><strong>Assembly:</strong> Constructing books using the Single-Section Case Binding method</li></ul>"
           "<p>By the end of the workshop, your team will walk away with more than handcrafted books &mdash; they&rsquo;ll "
           "gain a shared sense of accomplishment, stronger interpersonal connections, and memories of a unique creative experience.</p>"),
        ])}
      </div>
    </div>
    <div>
      {img_block("Hands holding a finished handmade book", "workshop-team-building-detail.webp", "Workshops", source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/cefdc5a9-4d20-4ee5-85f0-89cd37fd687b/IMG_4445.jpg?format=1000w")}
      <h3 style="margin-top:20px;">Get an offer for your team-building session</h3>
      <p>Ready to book a session for your team? Fill out some info and we will be in touch shortly. I am looking forward to crafting stories together!</p>
      <a class="btn secondary" href="mailto:info@enperfeitas.com?subject=Team-building%20workshop">Request a quote</a>
    </div>
  </div>
</section>
"""
page("workshops.html", "Workshops | Enperfeitas Studio",
     "Bookbinding and marbling workshops in Stockholm &mdash; single section, curved spine, exposed spine, Marble & Sip, and more.",
     body, active="workshops.html")

# ---------------------------------------------------------------- BESPOKE BINDING
body = f"""
{hero_cover("hero-hands-tools.webp", "The Book That Holds It",
            "Custom bindings for weddings, family histories, cherished editions, and objects that carry too much meaning for a standard cover.",
            "Hands binding a book, surrounded by bookbinding tools", "Bespoke Binding",
            source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/1f0fa009-cffa-404f-8fa5-9d96459a6e65/Banner+custom+made+prodcuts.jpg?format=2500w",
            subtext2="Most things wear out. A well-made binding doesn&rsquo;t. Every project in this category is treated as a legacy piece &mdash; designed with you, made by hand, and built to be passed on.")}

<section>
  <div class="wrap grid-2 offer-row match-height">
    <div class="text-col">
      <h2>Heritage Editions &mdash; Wedding and Family Albums</h2>
      <p class="kicker">For the day people will talk about for the rest of their lives.</p>
      <p>A wedding guest book from a chain store will last five years before the spine splits. A Heritage Edition will be on a shelf in fifty years, still intact, still telling the story of that day.</p>
      <p>This is for <strong>couples</strong> who have thought carefully about every other detail of their wedding &mdash; and want the physical objects from that day to reflect the same care.</p>
      <p>It&rsquo;s also for <strong>families</strong>. The person who has spent years tracing their lineage through Swedish parish records, building something no one else has, and wants it bound in a way that honours the work and survives them.</p>
      <p><strong>What to expect?</strong></p>
      <ul class="offer-list">
        <li>A consultation to understand your vision and the story behind it.</li>
        <li>Material and design choices made together.</li>
        <li>Hand-sewn binding using archival techniques.</li>
        <li>Optional clamshell box or slipcase for complete protection.</li>
      </ul>
      <div class="price"><em>Starting from 2,600 kr.</em><br><em>Each project is quoted individually based on scope and materials.</em></div>
      <a class="btn secondary" href="mailto:info@enperfeitas.com?subject=Heritage%20Editions%20inquiry" aria-label="Inquire about Heritage Editions">Inquire about this</a>
    </div>
    <div class="img-col">
      {img_block("A stack of four notebooks tied with a black ribbon", "binding-heritage.webp", "Bespoke Binding", source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/a41b2357-0279-45a1-96ab-2a25614263f9/IMG_8988.jpg?format=1000w")}
    </div>
  </div>
</section>

<section class="alt">
  <div class="wrap grid-2 offer-row match-height">
    <div class="img-col">
      {img_block("A hand lifting a small fabric-covered notebook from a gift box", "binding-rebinding.webp", "Bespoke Binding", source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/240300f5-721a-4667-980c-899ca312e357/Enperfeitas_Image-03.png?format=1000w")}
    </div>
    <div class="text-col">
      <h2>Fine Bindings &mdash; Exclusive Editions</h2>
      <p class="kicker">For the book that already means something &mdash; and deserves a cover that shows it.</p>
      <p>Some books aren&rsquo;t read. They&rsquo;re kept. A first edition, a volume that belonged to someone gone, a collection that represents years of obsession. Fine binding gives these objects a cover worthy of what they carry.</p>
      <p><strong>What to expect?</strong></p>
      <ul class="offer-list">
        <li>Consultation about the book&rsquo;s history and your vision for it.</li>
        <li>Material and design selection.</li>
        <li>Hand-sewn binding with archival materials and finishing by hand.</li>
        <li>Optional clamshell box or slipcase.</li>
      </ul>
      <div class="price"><em>Starting from 3,100 kr.</em><br><em>Each project is quoted individually based on scope and materials.</em></div>
      <a class="btn secondary" href="mailto:info@enperfeitas.com?subject=Fine%20Bindings%20inquiry" aria-label="Inquire about Fine Bindings">Inquire about this</a>
    </div>
  </div>
</section>

<section>
  <div class="wrap grid-2 offer-row match-height">
    <div class="text-col">
      <h2>Contemporary Rebinding &mdash; Cover Replacement</h2>
      <p class="kicker">The story was always worth keeping. The cover just needs to catch up.</p>
      <p>Mass-market bindings are made to a budget, not to last. If a book matters to you &mdash; a favourite novel read to pieces, a technical reference you&rsquo;ve used for years &mdash; it deserves a cover made with the same intention you&rsquo;ve brought to reading it.</p>
      <p><strong>What to expect?</strong></p>
      <ul class="offer-list">
        <li>Cover replacement in cloth or leather.</li>
        <li>Optional foil stamping or embossed details.</li>
        <li>Finished by hand.</li>
      </ul>
      <div class="price"><em>Starting from 1,200 kr.</em><br><em>Each project is quoted individually based on scope and materials.</em></div>
      <a class="btn secondary" href="mailto:info@enperfeitas.com?subject=Contemporary%20Rebinding%20inquiry" aria-label="Inquire about Contemporary Rebinding">Inquire about this</a>
    </div>
    <div class="img-col">
      {img_block("A closed leather-bound journal with a tan cover", "binding-fine.webp", "Bespoke Binding", source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/c50df721-979b-470e-aa49-52706a3ea1f3/IMG_8923.jpg?format=1000w")}
    </div>
  </div>
</section>

<section class="alt">
  <div class="wrap grid-2 offer-row match-height">
    <div class="img-col">
      {img_block("Close-up of the edge of a brown book with visible pages", "binding-restorations.webp", "Bespoke Binding", source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/ecd6cd2f-e673-4491-bdc0-6082f92f10d1/Enperfeitas+.jpg?format=1000w")}
    </div>
    <div class="text-col">
      <h2>Restorations &mdash; Preservation of Antique Books</h2>
      <p class="kicker">Old books carry history. Restoration makes sure they keep carrying it.</p>
      <p>If it belonged to someone before you, it has already survived things. Restoration work uses conservation-grade materials to repair, stabilise, and protect &mdash; without erasing what the years have left behind.</p>
      <p><strong>What to expect?</strong></p>
      <ul class="offer-list">
        <li>Spine, page, and cover repair.</li>
        <li>Cleaning and reinforcement with archival materials.</li>
        <li>The book&rsquo;s character stays intact.</li>
      </ul>
      <div class="price"><em>Pricing on consultation.</em></div>
      <a class="btn secondary" href="mailto:info@enperfeitas.com?subject=Restorations%20inquiry" aria-label="Inquire about Restorations">Inquire about this</a>
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <h2>How a bespoke project works</h2>
    <p>Every project starts with a <strong>conversation</strong> about what you&rsquo;re making, why it matters, and what you want it to look like in twenty years. From there, I prepare a <strong>tailored proposal</strong> with materials, timeline, and exact <strong>pricing</strong> before any work begins.</p>
    <p>I work on one-of-a-kind commissions and small editions up to 50 copies. Most projects take a minimum of three months &mdash; good binding can&rsquo;t be rushed, and I won&rsquo;t pretend otherwise. A <strong>50% deposit</strong> begins the work; the balance is <strong>due on completion</strong>.</p>
    <a class="btn" href="onboarding.html">See the full process</a>
  </div>
</section>

<section class="alt" style="text-align:center;">
  <div class="wrap">
    <h2>Start a project</h2>
    <p>Share a short description of your project, your rough budget, and your timeframe.<br>That&rsquo;s enough for me to come back to you with a clear proposal.</p>
    <a class="btn" href="mailto:info@enperfeitas.com?subject=Bespoke%20Binding%20project">info@enperfeitas.com</a>
  </div>
</section>
"""
page("bespoke-binding.html", "Bespoke Binding | Enperfeitas Studio",
     "Custom hand-sewn bindings, heritage wedding and family albums, fine bindings, rebinding, and restorations in Stockholm.",
     body, active="bespoke-binding.html")

# ---------------------------------------------------------------- BESPOKE BOXES
body = f"""
{hero_cover("boxes-slipcases.webp", "What You Put It In Says as Much as What's Inside",
            "Handcrafted boxes, slipcases, and portfolios for art, photography, rare books, and anything else that deserves proper protection. A box isn't just storage &mdash; it's a statement that the object inside matters.",
            "A box with a marbled interior, lined and empty", "Bespoke Boxes",
            source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/99a102ac-3308-4f8a-b4aa-d48f5872409f/IMG_9331.jpg?format=2500w")}

<section>
  <div class="wrap grid-2 offer-row match-height">
    <div class="text-col">
      <h2>Portfolios</h2>
      <p class="kicker">Your work, presented as seriously as it deserves.</p>
      <p>A handbound portfolio made for your body of work &mdash; not adapted from a generic format. Tailored sizing, material, and finish. For artists and photographers who understand that how work is presented changes how it&rsquo;s received.</p>
      <p><em>Available in linen, cloth, or leather. Ribbon closures, lined interiors, custom sizing.</em></p>
      <div class="price"><em>Starting from 1,300 kr.</em><br><em>Each project is quoted individually based on scope and materials.</em></div>
      <a class="btn secondary" href="mailto:info@enperfeitas.com?subject=Portfolio%20inquiry" aria-label="Inquire about Portfolios">Inquire about this</a>
    </div>
    <div class="img-col">
      {img_block("A person wrapping a gift with beige patterned paper and satin ribbons", "boxes-portfolios.webp", "Bespoke Boxes", source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/71d3eeed-4c4c-4cab-8ee5-b6b5c5ca0069/IMG_9040.jpg?format=1000w")}
    </div>
  </div>
</section>

<section class="alt">
  <div class="wrap grid-2 offer-row match-height">
    <div class="img-col">
      {img_block("Hands holding a stack of bound books tied with cord, resting in an open rust-orange box", "boxes-slipcases-detail.webp", "Bespoke Boxes", source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/1723469696225-SC325CJ7I0HXPXESG2DS/IMG_9014.jpg?format=1000w")}
    </div>
    <div class="text-col">
      <h2>Slipcases</h2>
      <p class="kicker">Elegant protection. Immediate access.</p>
      <p>A slipcase keeps your book shielded from light, dust, and handling, without hiding it. Precisely fitted, finished in cloth or leather, with optional foil or embossed details.</p>
      <p><em>For books and editions that deserve more than a shelf.</em></p>
      <div class="price"><em>Starting from 1,800 kr.</em><br><em>Each project is quoted individually based on scope and materials.</em></div>
      <a class="btn secondary" href="mailto:info@enperfeitas.com?subject=Slipcase%20inquiry" aria-label="Inquire about Slipcases">Inquire about this</a>
    </div>
  </div>
</section>

<section>
  <div class="wrap grid-2 offer-row match-height">
    <div class="text-col">
      <h2>Clamshell Boxes</h2>
      <p class="kicker">Museum-quality preservation. For things that need to last.</p>
      <p>The clamshell is the standard of serious preservation &mdash; used by archives, collectors, and institutions. Fully hinged, archival construction, cloth or leather exterior. Options for decorative linings, compartments, foil stamping, and fitted supports.</p>
      <p><em>For rare books, family documents, photographic prints, and collections built over a lifetime.</em></p>
      <div class="price"><em>Starting from 2,500 kr.</em><br><em>Each project is quoted individually based on scope and materials.</em></div>
      <a class="btn secondary" href="mailto:info@enperfeitas.com?subject=Clamshell%20Box%20inquiry" aria-label="Inquire about Clamshell Boxes">Inquire about this</a>
    </div>
    <div class="img-col">
      {img_block("A lime green box with a marbled interior holding a spiral-bound book", "boxes-clamshell.webp", "Bespoke Boxes", source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/82a9fe4f-972a-4243-9f99-bdc77395b4bc/IMG_9328.jpg?format=1000w")}
    </div>
  </div>
</section>

<section class="alt" style="text-align:center;">
  <div class="wrap">
    <h2>How to order</h2>
    <p>Tell me what you&rsquo;re protecting and why it matters &mdash; that&rsquo;s the best starting point.<br>Reach me with a description, your rough budget, and your timeframe.</p>
    <p style="color:var(--muted);">Most bespoke boxes and portfolios take 6&ndash;8 weeks.</p>
    <a class="btn" href="mailto:info@enperfeitas.com?subject=Bespoke%20Box%20project">info@enperfeitas.com</a>
  </div>
</section>
"""
page("bespoke-boxes.html", "Bespoke Boxes | Enperfeitas Studio",
     "Handcrafted portfolios, slipcases, and clamshell boxes for art, photography, and rare books, made in Stockholm.",
     body, active="bespoke-boxes.html")

# ---------------------------------------------------------------- COLLECTIBLES
# The live page (squarespace slug /unique-collectibles) has four offerings:
# Artisan Edition, Bespoke Binding, Bespoke Boxes & Portfolios, and The Store.
# Artisan Edition's live "pay first, then fill in a personalisation form" flow
# is adapted to a mailto (this static site has no checkout backend), following
# the same pattern already used for other commission CTAs. The Store card is
# deliberately omitted here per Suzete's request -- the shop is already one
# click away from every page via the main nav, so this page stays focused on
# the three bespoke/custom offerings.
body = f"""
<section class="page-header wrap">
  <h1>Made for the moments that deserve more than ordinary</h1>
  <p>Every piece is handbound, one of a kind, and designed to last generations. Not a product &mdash; a decision to treat something as the heirloom it already is.</p>
</section>

<section>
  <div class="wrap grid-3">
    <div class="card shop-card">
      {img_block("Close-up of a hand holding two watercolor-designed personalised notebooks, with options for blank, dotted, or lined pages", "work-09-notebooks-flatlay.webp", "Collectibles", source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/1681115714668-LEMN4KP4RUSKI0CHAQ6H/Colors+-78.jpg?format=1000w")}
      <div class="shop-card-body">
        <h3>Artisan Edition</h3>
        <p class="desc">A handbound notebook, journal, or sketchbook &mdash; made to your specifications. For those who want a beautiful object for their own daily practice, or a gift that will actually be kept.</p>
        <a class="btn secondary" href="mailto:info@enperfeitas.com?subject=Artisan%20Edition%20-%20Custom%20Notebook%2FJournal%2FSketchbook" aria-label="Personalise your own handbound book">Personalise your book</a>
      </div>
    </div>
    <div class="card shop-card">
      {img_block("A stack of four notebooks tied with a black ribbon", "binding-heritage.webp", "Collectibles", source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/a41b2357-0279-45a1-96ab-2a25614263f9/IMG_8988.jpg?format=1000w")}
      <div class="shop-card-body">
        <h3>Bespoke Binding</h3>
        <p class="desc">Wedding guest books, family albums, cherished volumes rebound. For life&rsquo;s milestones &mdash; designed together, bound by hand, built to outlast everything else from that day.</p>
        <a class="btn secondary" href="bespoke-binding.html" aria-label="Start your bespoke binding project">Start your bespoke project</a>
      </div>
    </div>
    <div class="card shop-card">
      {img_block("A lime green box with a marbled interior holding a spiral-bound book", "boxes-clamshell.webp", "Collectibles", source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/82a9fe4f-972a-4243-9f99-bdc77395b4bc/IMG_9328.jpg?format=1000w")}
      <div class="shop-card-body">
        <h3>Bespoke Boxes &amp; Portfolios</h3>
        <p class="desc">Clamshells, slipcases, and presentation portfolios for art, photography, and legacy. For artists, photographers, and families who understand that what protects something also says something about its value.</p>
        <a class="btn secondary" href="bespoke-boxes.html" aria-label="Commission a box or portfolio">Commission a box or portfolio</a>
      </div>
    </div>
  </div>
</section>

<section class="alt" style="text-align:center;">
  <div class="wrap">
    <p>Questions about a piece, or want something entirely custom?</p>
    <a class="btn" href="mailto:info@enperfeitas.com">info@enperfeitas.com</a>
  </div>
</section>
"""
page("collectibles.html", "Unique Collectibles | Enperfeitas Studio",
     "Handbound, one-of-a-kind books, boxes, and portfolios from Enperfeitas Studio in Stockholm.",
     body, active=None)

# ---------------------------------------------------------------- LATEST WORK
gallery_labels = [
    ("Close-up of a traditional woven backgammon set with white game pieces, red and brown decorative elements, and a yellow border.", "work-13-close-traditional-woven-backgammon.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/e46c4b9c-861d-470c-8b77-fe694b1de18f/Enperfeitas+Products+Images+Nov+24-114.jpg"),
    ("Close-up of a book with a yellow cover and stick-on tabs marking several pages.", "work-14-close-book-yellow-cover.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/cc83dba1-3625-4058-acfb-2de3472f1415/Enperfeitas+Products+Images+Nov+24-115.jpg"),
    ("Close-up of a pink book with a leather spine and a decorative leather strap on the spine.", "work-15-close-pink-book-leather.webp", ""),
    ("A hand holding an open book with marbled paper pages featuring colorful, swirling patterns in pastel shades of yellow, blue, green, pink, and white.", "work-01-marbled-pages.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/4227a600-b32b-4323-a750-bae60c1ad38c/Enperfeitas+Products+Images+Nov+24-110.jpg?format=1000w"),
    ("Close-up of the top corner of a blue hardcover book, showing the book's spine and cover with a blue fabric cover and a black tape reinforcement on the inner corner.", "work-16-close-top-corner-blue.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/d79e17f4-6b83-41fd-b960-f7f164e1a99b/Enperfeitas+Products+Images+Nov+24-103.jpg"),
    ("Open book with marbled paper pattern pages, held by person with dark skin, against a white background.", "work-17-open-book-marbled-paper.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/6db40472-d295-4f5b-bb88-63be612ef121/Enperfeitas+Products+Images+Nov+24-104.jpg"),
    ("Open book with marbled green and orange pages held by a person's hand, against a white background.", "work-18-open-book-marbled-green.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/8c88d450-a9b9-442f-a6c3-25f6f918bfb3/Enperfeitas+Products+Images+Nov+24-098.jpg"),
    ("Person holding a book with a yellow cover, showing the spine and edges of the pages.", "work-19-book-yellow-cover-showing.webp", ""),
    ("A person holding a hardcover yellow notebook with a textured cover and two brown loops on the spine.", "work-20-hardcover-yellow-notebook-textured.webp", ""),
    ("A person holding a beige patterned notebook with yellow and brown binding on a white background.", "work-21-beige-patterned-notebook-yellow.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/b72e3372-6327-4a98-9b2b-7dc7286228d6/Enperfeitas+Products+Images+Nov+24-083.jpg"),
    ("A person holding an open book with marbled paper inside, displaying swirling patterns of pastel colors including pink, yellow, blue, and white.", "work-22-open-book-marbled-paper.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/d8d4df8c-7c44-477c-a5b6-e5dbce93d070/Enperfeitas+Products+Images+Nov+24-089.jpg"),
    ("Close-up of a corner of a beige fabric-covered chair with a leather and wood decorative top edge in yellow and brown.", "work-23-close-corner-beige-fabric.webp", ""),
    ("Person holding a patterned book with a yellow, brown, and striped spine against a plain white background.", "work-24-patterned-book-yellow-brown.webp", ""),
    ("A hand holding a hardcover book with a fabric cover featuring a botanical design and an embroidered oval shape on the front.", "work-25-hardcover-book-fabric-cover.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/6268785e-bfb0-4aa3-8146-b8d680308a43/Enperfeitas+Products+Images+Nov+24-074.jpg"),
    ("Hand holding a fabric-covered book with embroidered abstract art on the cover, white pages, and a textured spine.", "work-26-fabric-covered-book-embroidered.webp", ""),
    ("A person holding a closed, light green hardcover notebook with a green and white striped elastic band and a light green fabric cover against a plain white background.", "work-27-closed-light-green-hardcover.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/759af381-57b6-4b60-97ff-85d9bdf55e09/Enperfeitas+Products+Images+Nov+24-062.jpg"),
    ("A person holding an open notebook with marbled paper pages in shades of green, yellow, and white.", "work-28-open-notebook-marbled-paper.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/7f4b67ca-3d55-4992-98b4-4978b4a036f1/Enperfeitas+Products+Images+Nov+24-063.jpg"),
    ("A person holding a light green notebook with a green and white elastic strap, on a white background.", "work-29-light-green-notebook-green.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/e8341d4e-a03c-4874-af9d-5874fa764703/Enperfeitas+Products+Images+Nov+24-067.jpg"),
    ("Hands holding a closed notebook with a brown cover, wrapped with a braided yellow and black cord, on a white surface.", "work-02-braided-cord-notebook.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/f4a1d3d6-e4bc-472d-8168-f0849aa54048/Enperfeitas+Products+Images+Nov+24-060.jpg?format=1000w"),
    ("Hands wrapping a red hardcover book with a colorful braided bookmark on a white surface.", "work-30-wrapping-red-hardcover-book.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/402a7b96-a8ac-49e7-bf26-ab531675ac9e/Enperfeitas+Products+Images+Nov+24-052.jpg"),
    ("A closed pink hardcover book with a braided red and green ribbon bookmark on a white background.", "work-31-closed-pink-hardcover-book.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/8622d519-b982-49b3-8bc9-ecd982dc2471/Enperfeitas+Products+Images+Nov+24-050.jpg"),
    ("Open book with marbled paper pages and a red cover, being held by a hand, against a white background.", "work-32-open-book-marbled-paper.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/4a8263cd-f158-4905-98f5-c9606d205b82/Enperfeitas+Products+Images+Nov+24-048.jpg"),
    ("Hands holding a closed red journal with a colorful elastic band wrapped around it, on a white background.", "work-33-closed-red-journal-colorful.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/527c826d-0e13-4cb7-92d8-70ad14731b1a/Enperfeitas+Products+Images+Nov+24-051.jpg"),
    ("A hand holding a brown cork-covered notebook or journal with a yellow and white bookmark ribbon.", "work-03-cork-notebook.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/b96cf808-df75-4d9e-8a15-f4bdb16c1fce/Enperfeitas+Products+Images+Nov+24-041.jpg?format=1000w"),
    ("Hand holding a yellow hardcover notebook with an orange elastic strap on a white surface.", "work-34-yellow-hardcover-notebook-orange.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/5896b93e-3793-45e5-99be-038b9bab8d84/Enperfeitas+Products+Images+Nov+24-038.jpg"),
    ("Person holding an open book with marbled green and pink pages against a white background.", "work-35-open-book-marbled-green.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/1db61359-9841-43e0-b421-aedf7a1cd812/Enperfeitas+Products+Images+Nov+24-036.jpg"),
    ("A closed gray fabric-textured notebook with a red, gray, and white striped elastic band and matching bookmark on a white background.", "work-36-closed-gray-fabric-textured.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/9b80630d-329c-4ea1-8740-cf9702daa23c/Enperfeitas+Products+Images+Nov+24-025.jpg"),
    ("A yellow hardcover book with a white and yellow braided string attached, resting on a white surface.", "work-37-yellow-hardcover-book-white.webp", ""),
    ("A person holding an open notebook with a marbled paper cover featuring yellow, purple, and white swirls and splashes.", "work-38-open-notebook-marbled-paper.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/03d7fd27-1597-4063-8233-c856912ec8b0/Enperfeitas+Products+Images+Nov+24-028.jpg"),
    ("A pair of hands tying a yellow and white braided cord around an orange notebook with a yellow cover on a white surface.", "work-39-pair-tying-yellow-white.webp", ""),
    ("Close-up of a yellow fabric notebook with a yellow and white braided bookmark resting on it, on a white surface.", "work-40-close-yellow-fabric-notebook.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/46357b3b-3458-4feb-b454-904a91ee7d6b/Enperfeitas+Products+Images+Nov+24-031.jpg"),
    ("Close-up of a blue hardcover notebook with the embossed word 'Notes' on the cover, held in a person's hand with a braided strap visible on the right side.", "work-41-close-blue-hardcover-notebook.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/f0ddecf8-e0cb-4007-87f0-312c76dfb7c7/Enperfeitas+Products+Images+Nov+24-016.jpg"),
    ("Person holding a gray fabric wallet with a red and black seam on a plain white background.", "work-42-gray-fabric-wallet-red.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/315370fa-e1ed-40c0-a04b-a01abb5bea61/Enperfeitas+Products+Images+Nov+24-006.jpg"),
    ("Person holding a gray fabric-covered notebook with a braided elastic closure.", "work-43-gray-fabric-covered-notebook.webp", ""),
    ("Person holding a box of several fabric swatches or sample strips.", "boxes-slipcases-detail.webp", ""),
    ("Person holding colorful marbled paper samples at a desk.", "work-44-colorful-marbled-paper-samples.webp", ""),
    ("Brown hardcover book with cream pages on a table, with stacked books in the background.", "binding-fine.webp", ""),
    ("Stack of wrapped gifts and notebooks on a beige table with a person in the background.", "binding-heritage.webp", ""),
    ("Fabric bag with floral print and tie closure", "work-45-fabric-bag-floral-print.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/58fa4030-80dc-45b2-a5b6-8d185a7ee6d0/IMG_9338.jpg"),
    ("Open blank notebook with white pages on a white surface, someone turning the page with their right hand.", "work-46-open-blank-notebook-white.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/4cf69e7d-3af1-4908-aea5-1d4f40bdbf1d/IMG_9350.jpg"),
    ("A person's hand with a wedding ring reaching out from behind an orange gift box on a beige surface.", "work-47-persons-wedding-ring-reaching.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/4a704878-b851-4d3c-a081-46a5769e85c7/IMG_9098.jpg"),
    ("An open box with a green exterior and marbled interior, containing a pile of white books with gold edges. A person's hands are seen closing the box.", "work-48-open-box-green-exterior.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/d070daa4-35c6-48cb-b66f-88800b8dee60/IMG_8939.jpg"),
    ("Open desk organizer with a red notepad, a brown notebook, and a black ribbon on a beige table.", "work-05-desk-organizer.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/65fd3ca3-dc1c-4d9d-b238-f5f7fabfa795/IMG_9106.jpg?format=1000w"),
    ("Person with dark skin wearing a mustard-colored shirt, holding a cardboard band, placing it on a closed book or notebook on a table.", "work-49-dark-skin-wearing-mustard.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/c57c1cfd-ea55-424a-96ec-bb504a6a61b9/IMG_9062.jpg"),
    ("A person's hand with rings on fingers resting on a table among several notebooks and books.", "work-50-persons-rings-fingers-resting.webp", ""),
    ("Open green fabric box with a marble-patterned interior and white books with gold ribbons inside.", "work-51-open-green-fabric-box.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/963cc4da-bb27-4001-8c40-eb9447bb5f37/IMG_9325.jpg"),
    ("Close-up of a colorful, abstract-patterned fabric folder with a green paper pocket and a brown fabric strap on a white background.", "work-52-close-colorful-abstract-patterned.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/86881393-d419-48d1-a837-64e5dda57fe4/IMG_9360.jpg"),
    ("Close-up of a fabric-covered object with floral pattern and a vertical strip with decorative elements, including threads, beads, and small fabric pieces.", "work-08-embroidered-cover.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/7a817581-27aa-4d7e-bb02-8f24c10fd8a0/Enperfeitas++Portfolio-27.jpg?format=1000w"),
    ("Close-up of a brown fabric-bound notebook with a white page corner visible, on a white surface.", "work-53-close-brown-fabric-bound.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/0a40c041-20eb-4843-af66-e3b9c20784a8/IMG_9347.jpg"),
    ("A person holding a thick book with a decorative cover and embedded built-in white sticks with colorful ties along the side.", "work-54-thick-book-decorative-cover.webp", ""),
    ("Red gift box with a matching notebook and an empty red square frame inside it.", "work-55-red-gift-box-matching.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/610f8460-18f9-4921-87d2-78afeaa25335/IMG_9397.jpg"),
    ("A red fabric notebook with a green ribbon tied in a bow on the upper right corner, placed on a white surface.", "work-56-red-fabric-notebook-green.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/358a2090-a45c-4b1a-a8af-be90741acbbe/IMG_9357.jpg"),
    ("Close-up of a table with a marble-like top in pink, orange, and mint green swirl pattern and a light green fabric border.", "work-57-close-table-marble-like.webp", ""),
    ("Open empty green box with textured exterior and marbled interior design.", "work-04-gift-box.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/99a102ac-3308-4f8a-b4aa-d48f5872409f/IMG_9331.jpg?format=1000w"),
    ("A stack of three books with decorative covers, placed on a green surface.", "work-11-book-stack.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/5021885d-6634-4ade-88b9-db7192f8d280/Enperfeitas++Portfolio-25.jpg?format=1000w"),
    ("Closed light green fabric-covered notebook with gold binding on a white background.", "work-58-closed-light-green-fabric.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/a2ae7af0-690b-4220-b376-70b4b12f4ddb/IMG_9342.jpg"),
    ("Close-up of a box spring with a zipper revealing neatly organized bed slats and decorative ropes inside.", "work-59-close-box-spring-zipper.webp", ""),
    ("Stacked books with plaid fabric covers on a blue background.", "work-60-stacked-books-plaid-fabric.webp", ""),
    ("Three stacked fabric-covered notebooks with colorful floral and plaid patterns on a grey surface.", "work-61-three-stacked-fabric-covered.webp", ""),
    ("Open book with marbled green and purple pages, held by a person's hand.", "work-62-open-book-marbled-green.webp", ""),
    ("A collection of Japanese folding fans with different designs and colors in a box, with craft tools and materials on the table in front.", "work-06-folding-fans.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/0b75b620-ab1b-44ee-8137-945011f0f1ae/Enperfeitas++Portfolio-18.jpg?format=1000w"),
    ("A person holding an open marbled paper book with colorful swirling patterns of green, orange, and white on a plain white background.", "work-63-open-marbled-paper-book.webp", ""),
    ("A row of orange and patterned notebooks on a shelf.", "work-12-notebook-shelf.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/60d2a1a0-3233-4204-9f1d-502c739571e4/Enperfeitas++Portfolio-17.jpg?format=1000w"),
    ("Close-up of a decorative floral fabric-covered book with embroidered details visible on the spine.", "work-64-close-decorative-floral-fabric.webp", ""),
    ("Hand holding a blank, textured, brown cork-covered book or notebook against a plain white background.", "work-65-blank-textured-brown-cork.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/1720587996696-VLT6EZKA1NP7ULPXXHH4/IMG_9234.jpg"),
    ("A closed, tan hardcover notebook with purple stitching on a white background.", "work-66-closed-tan-hardcover-notebook.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/1720587787964-33K6S42G9CE3M6E9WUE1/IMG_9241.jpg"),
    ("Open journal with a colorful marbled page on the left and a blank page on the right, with a hand holding the bottom corner.", "work-67-open-journal-colorful-marbled.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/1720587790071-0IKOB5K9U4GKSN0Q5J6W/IMG_9244.jpg"),
    ("Person holding a tan hardcover book with red stitching along the spine against a white background.", "work-68-tan-hardcover-book-red.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/1720587677119-936KYEGYS0X21X5945OU/IMG_9248.jpg"),
    ("A person holding a closed yellow hardcover book with a textured surface and visible binding on the left edge.", "work-69-closed-yellow-hardcover-book.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/1720587370202-ZZWRHL60PXZMMPVRITZO/IMG_9254.jpg"),
    ("Open journal with marbled blue, green, pink, yellow, and orange splash pattern on the inside cover, held by a person with light gray nail polish.", "work-70-open-journal-marbled-blue.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/1720587366837-GPWMG0ZJCWB358BDKMZO/IMG_9258.jpg"),
    ("Open journal with colorful marbled page on the left and blank right page with text 'This journal belongs'", "work-71-open-journal-colorful-marbled.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/1720586657814-HSLC6L6HLVUXS3521DFI/IMG_9264.jpg"),
    ("A person's hand holding a colorful marble-patterned 12-month planner.", "work-72-persons-colorful-marble-patterned.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/1720457433316-IPGK3U1PZOYSIU8B1CEN/IMG_9219.jpg"),
    ("A Marbled Notebook with bright swirling colors of yellow, pink, blue, and white on a white background.", "work-73-marbled-notebook-bright-swirling.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/1720457101429-LUZ1YW068SY2JNODA7ZR/IMG_9227.jpg"),
    ("A hand holding a floral-patterned fabric folder or notebook with small pink, orange, purple, and green flowers on a white background.", "work-74-floral-patterned-fabric-folder.webp", ""),
    ("Hand holding a white gift box with a gray botanical design on a plain white background.", "work-75-white-gift-box-gray.webp", ""),
    ("A hand holding a closed hardcover book with a brown striped cover against a plain white background.", "work-76-closed-hardcover-book-brown.webp", ""),
    ("Two sheets of marbled paper with swirling patterns in yellow, blue, red, and white.", "work-10-marbled-sheets.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/1701085614580-MES44X5GZNBCCN5HN5TC/09.png?format=1000w"),
    ("Two pastel-colored notebooks with marbled pattern covers in pink, mint green, and white, wrapped with transparent bands that feature the brand name 'Empreelitas'.", "work-77-two-pastel-colored-notebooks.webp", ""),
    ("Two pastel-colored marble-patterned notebooks, one in light blue and the other in pink, with the brand name 'Emperletas' on the covers.", "work-78-two-pastel-colored-marble.webp", ""),
    ("Two marbled notebooks with pastel colors and floral patterns, wrapped with translucent band labels that read 'Emperentas.'", "work-79-two-marbled-notebooks-pastel.webp", ""),
    ("Two marbled soap bars with red, green, and white patterns, sealed with a translucent label showing a brand name and instructions.", "work-80-two-marbled-soap-bars.webp", ""),
    ("Marbled notebooks in yellow, red, white, and green colors with a translucent band labeled \"Emperreitas.\"", "work-81-marbled-notebooks-yellow-red.webp", ""),
    ("Two marbled handmade notebooks in colorful covers, one with blue and red swirls, and the other with yellow and orange swirls, each wrapped with a transparent band labeled 'Las Empreñetas'.", "work-82-two-marbled-handmade-notebooks.webp", ""),
    ("Close-up of a brown leather-bound book with white stitching on the spine, resting on a beige surface.", "work-83-close-brown-leather-bound.webp", ""),
    ("Open notebook with blank white pages and a tropical leaf pattern on the cover, resting on a beige surface.", "work-84-open-notebook-blank-white.webp", ""),
    ("A black spiral-bound notebook with a black elastic band laced with white stitches, resting on a beige surface.", "work-07-hardcover-journal.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/1681112659146-M8NKJFYF0F97I3C0H25I/Enperfeitas+Book-16.jpg?format=1000w"),
    ("A brown notebook with white decorative lines and X's on the spine, lying on a beige surface.", "work-85-brown-notebook-white-decorative.webp", ""),
    ("Open journal with a floral patterned cover and blank white pages", "work-86-open-journal-floral-patterned.webp", ""),
    ("A hardcover book with a floral patterned cover, showing the side and spine with visible stitching and a roll of tape in the background.", "work-87-hardcover-book-floral-patterned.webp", ""),
    ("Close-up of a hand holding two watercolor-designed notebooks with the brand name 'Emperletas' on the covers. The notebooks are labeled as handcrafted personalized notebooks, with options for blank, dotted, or lined pages checked off.", "work-09-notebooks-flatlay.webp", "https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/1681115714668-LEMN4KP4RUSKI0CHAQ6H/Colors+-78.jpg?format=1000w"),
    ("Two handcrafted personalized notebooks with orange-yellow abstract covers and white labels that read \"Emperjetas.\" The labels include options for blank, dotted, and lined pages, with the blank option checked.", "work-88-two-handcrafted-personalized-notebooks.webp", ""),
    ("Two colorful, pastel-colored notebooks with a checkered pattern, held by a person with a ring on their finger, against a light green background.", "work-89-two-colorful-pastel-colored.webp", ""),
    ("Two colorful notebooks with a rainbow-colored cover, held in a person's hand. The notebooks feature the brand name 'Emprejetas' and are labeled as handcrafted personalized notebooks, with options for blank, dotted, or lined pages.", "work-90-two-colorful-notebooks-rainbow.webp", ""),
    ("Two colorful notebooks with a label that reads \"Empeignetas Handcrafted Personalized Notebooks\" held by a hand against a light blue background.", "work-91-two-colorful-notebooks-label.webp", ""),
    ("Close-up of two colorful, handcrafted personalized notebooks with abstract artwork on the covers, one being held by a person's hand.", "work-92-close-two-colorful-handcrafted.webp", ""),
    ("A hand holding two colorful, folded notebooks with a label that reads 'Enjepetlas Handcrafted Personalized Notebooks' and options for blank, dotted, or lined pages.", "work-93-two-colorful-folded-notebooks.webp", ""),
    ("A packaged notebook with a colorful abstract cover design and a translucent band with the brand name 'Snerquetas' printed on it, placed on a light blue surface.", "work-94-packaged-notebook-colorful-abstract.webp", ""),
    ("Colorful notebook with abstract pastel cover and transparent band with handwritten-style text and checkboxes on a light teal background.", "work-95-colorful-notebook-abstract-pastel.webp", ""),
]
gallery_items = "".join(img_block(label, fname, "Latest Work", small=True, source=src) for label, fname, src in gallery_labels)

body = f"""
<section class="page-header wrap">
  <h1>Latest Work</h1>
  <p>Recent pieces from the studio &mdash; notebooks and journals, marbled papers, boxes, and one-of-a-kind editions.</p>
</section>

<section>
  <div class="wrap gallery">
    {gallery_items}
  </div>
  <p class="wrap" style="margin-top:24px;color:var(--muted);">See more on <a href="https://www.instagram.com/enperfeitas" target="_blank" rel="noopener">Instagram @enperfeitas</a>.</p>
</section>
"""
page("latest-work.html", "Latest Work | Enperfeitas Studio",
     "A gallery of recent handbound notebooks, marbled papers, boxes, and editions from Enperfeitas Studio.",
     body, active="latest-work.html")

# ---------------------------------------------------------------- SHOP
#
# Each product's "stripe_link" starts empty. Buy buttons fall back to a
# pre-filled mailto until a real Stripe Payment Link is pasted in here —
# same self-healing pattern as the placeholder images. See
# STRIPE-SHOP-SETUP.md (written alongside IMAGE-MANIFEST.md below) for the
# step-by-step on creating each link and activating/deactivating a "sale day"
# with zero code changes.
#
# SHOP_PAUSED: kill-switch from when every link was on the wrong Stripe
# account. Correct-account links are wired in below, so this is back to
# False -- flip it to True again instantly if something goes wrong.
# Two items (see the "complete set of 6" Spacers and "2mm" Corner Jig
# variants below) are deliberately left without a stripe_link: Suzete's
# two links for those came through identical to each other, so rather
# than guess which product each belongs to, both fall back to the
# pre-filled mailto until she confirms the right link for each.
SHOP_PAUSED = False

PRODUCTS = [
    {
        "slug": "punching-cradle",
        "name": "Punching Cradle",
        "price": "550 kr",
        "digital": False,
        "desc": "A precision punching cradle for flawless, aligned holes across your signatures &mdash; built from durable, high-quality MDF.",
        "image": "shop-punching-cradle.webp",
        "source": "http://static1.squarespace.com/static/6287cba0410c800d0ff1f2b2/6288d8c4ef40836604a51764/65f6b142547e01097c172ce2/1787880550863/Enperfeitas+Punching+Cradle+v1+02.png?format=1500w",
        "stripe_link": "https://buy.stripe.com/3cI5kDfoqfMefDmdXj14400",
    },
    {
        "slug": "spacers",
        "name": "Bookbinding Spacers (Acrylic)",
        "price": "From 75 kr",
        "digital": False,
        "desc": "Precision acrylic spacers for perfectly even cover edges, every time. Available in 7mm, 10mm, 15mm, 20mm, 25mm, a 90&deg; L-shape, or the complete set of 6 (25cm long).",
        "image": "shop-spacers.webp",
        "source": "http://static1.squarespace.com/static/6287cba0410c800d0ff1f2b2/6288d8c4ef40836604a51764/65f6a2cb76d8e45fc30100bc/1787880548795/IMG_8818.jpg?format=1500w",
        "stripe_link": "https://buy.stripe.com/28E28rccecA2dvef1n14401",
        # One Payment Link per size is the plan (Stripe Payment Links can't
        # show a price-changing dropdown on their own -- see
        # STRIPE-SHOP-SETUP.md). Until each size has its own link, picking
        # it falls back to a mailto prefilled with that size, so nothing is
        # ever a dead end -- see shop_card().
        "variant_options": [
            {"label": "7mm", "stripe_link": "https://buy.stripe.com/28E28rccecA2dvef1n14401"},
            {"label": "10mm", "stripe_link": "https://buy.stripe.com/dRm7sL0twgQiezig5r14402"},
            {"label": "15mm", "stripe_link": "https://buy.stripe.com/cNiaEX3FI9nQezif1n14403"},
            {"label": "20mm", "stripe_link": "https://buy.stripe.com/5kQ9ATccebvY1Mw3iF14404"},
            {"label": "25mm", "stripe_link": "https://buy.stripe.com/dRm7sLekmbvY4YI5qN14405"},
            {"label": "90° L-shape", "stripe_link": "https://buy.stripe.com/3cI00jekmdE676Q7yV14406"},
            # Pasted in identical to the Corner Jig "2mm" link below -- almost
            # certainly one of the two got copied into the wrong field.
            # Left blank (falls back to mailto) until Suzete confirms which
            # link actually belongs here.
            {"label": "complete set of 6", "stripe_link": None},
        ],
    },
    {
        "slug": "corner-jig",
        "name": "Corner Cutting Jig",
        "price": "From 90 kr",
        "digital": False,
        "desc": "A 3D-printed mitring tool for precise 45&deg; cuts on cover turn-ins. Available in 2mm, 2.5mm, 3mm, or all three sizes.",
        "image": "shop-corner-jig.webp",
        "source": "http://static1.squarespace.com/static/6287cba0410c800d0ff1f2b2/6288d8c4ef40836604a51764/63e9328ae785253f65371480/1676227224944/Enperfeitas+Starting+Kit-4.jpg?format=1500w",
        "stripe_link": "https://buy.stripe.com/5kQcN5a462ZsfDmaL714408",
        "variant_options": [
            # Pasted in identical to the Spacers "complete set of 6" link
            # above -- almost certainly one of the two got copied into the
            # wrong field. Left blank (falls back to mailto) until Suzete
            # confirms which link actually belongs here.
            {"label": "2mm", "stripe_link": None},
            {"label": "2.5mm", "stripe_link": "https://buy.stripe.com/5kQcN5a462ZsfDmaL714408"},
            {"label": "3mm", "stripe_link": "https://buy.stripe.com/bJe9AT5NQ6bEgHq1ax14409"},
            {"label": "all three sizes", "stripe_link": "https://buy.stripe.com/28E6oH3FI1Vo9eYcTf1440a"},
        ],
    },
    {
        "slug": "tutorial-punching-cradle",
        "name": "Punching Cradle Tutorial (DIY)",
        "price": "90 kr",
        "digital": True,
        "desc": "Step-by-step video instructions for building your own punching cradle, for perfectly aligned holes across your signatures.",
        "image": "shop-tutorial-punching-cradle.webp",
        "source": "http://static1.squarespace.com/static/6287cba0410c800d0ff1f2b2/6288d8c4ef40836604a51764/65e198acea42fc43daa492b9/1787877129677/__Product+thumbnail+cradle.jpg?format=1500w",
        "stripe_link": "https://buy.stripe.com/3cI3cv6RU8jM4YIdXj1440b",
        "file_ext": "pdf",
    },
    {
        "slug": "tutorial-bookcloth",
        "name": "Bookcloth Tutorial (DIY)",
        "price": "90 kr",
        "digital": True,
        "desc": "Turn leftover fabric into your own bookcloth, with clear, illustrated steps &mdash; an easy, sustainable way to personalize a cover.",
        "image": "shop-tutorial-bookcloth.webp",
        "source": "http://static1.squarespace.com/static/6287cba0410c800d0ff1f2b2/6288d8c4ef40836604a51764/666ffb1092879a0ec2ae596b/1787894394543/__Product+thumbnail+cradle+bookcloth.jpg?format=1500w",
        "stripe_link": "https://buy.stripe.com/8x24gzekm43w4YI06t1440c",
        "file_ext": "pdf",
    },
    {
        "slug": "tutorial-concertina",
        "name": "Concertina (Accordion) Bookbinding Tutorial",
        "price": "90 kr",
        "digital": True,
        "desc": "Clear, illustrated steps for assembling your own concertina book &mdash; a versatile structure for displaying art, photos, or sketches.",
        "image": "shop-tutorial-concertina.webp",
        "source": "http://static1.squarespace.com/static/6287cba0410c800d0ff1f2b2/6288d8c4ef40836604a51764/666ffd4c49eb5143d0589811/1787894395279/__Product+thumbnail+cradle+concertina.jpg?format=1500w",
        "stripe_link": "https://buy.stripe.com/fZuaEX3FIdE6gHq5qN1440d",
        "file_ext": "pdf",
    },
    {
        "slug": "tutorial-singlecase",
        "name": "Single-Case Binding Tutorial",
        "price": "90 kr",
        "digital": True,
        "desc": "A beginner-friendly guide to binding a single-signature book, balancing straightforward steps with a polished, professional finish.",
        "image": "shop-tutorial-singlecase.webp",
        "source": "http://static1.squarespace.com/static/6287cba0410c800d0ff1f2b2/6288d8c4ef40836604a51764/666fff0651c1ee4ca46ccfba/1787894395596/__Product+thumbnail+cradle+single+case+binding.jpg?format=1500w",
        # Suzete's pasted link was the same URL pasted twice back-to-back
        # with no separator (an accidental double-paste) -- both halves
        # were byte-identical, so this is the de-duplicated single link,
        # not a guess. Worth a quick glance to confirm it's right.
        "stripe_link": "https://buy.stripe.com/7sY8wP2BEbvYaj2f1n1440e",
        "file_ext": "pdf",
    },
]


def shop_card(p):
    badge = '<span class="badge-digital">Digital download</span>' if p["digital"] else ""
    variants = p.get("variant_options")

    if variants:
        # One card per product, not one per size -- a <select> picks the
        # size and a tiny script swaps the Buy button's destination.
        # Each size falls back to a mailto prefilled with that exact size
        # until it has its own Stripe Payment Link (Payment Links can't
        # show a price-changing dropdown on their own -- see
        # STRIPE-SHOP-SETUP.md), so the button is never a dead end either
        # way -- just less automatic until the real link is in.
        select_id = f"variant-{p['slug']}"
        buy_id = f"buy-{p['slug']}"
        default_href = f"mailto:info@enperfeitas.com?subject=Order%20-%20{urllib.parse.quote(p['name'])}"
        options_html = '<option value="">Choose a size&hellip;</option>'
        for v in variants:
            fallback_body = urllib.parse.quote(f"Hi! I'd like to order the {p['name']} ({v['label']}).\n\n")
            fallback_href = f"{default_href}&body={fallback_body}"
            link = fallback_href if SHOP_PAUSED else (v["stripe_link"] or fallback_href)
            options_html += (
                f'<option value="{html.escape(link, quote=True)}">{html.escape(v["label"])}</option>'
            )
        buy_block = f"""
        <label class="variant-label" for="{select_id}">Size</label>
        <select class="variant-select" id="{select_id}">
          {options_html}
        </select>
        <a class="btn secondary disabled" id="{buy_id}" href="{html.escape(default_href, quote=True)}" aria-label="Buy {html.escape(p['name'])}">Choose a size first</a>
        <script>
        (function () {{
          var sel = document.getElementById("{select_id}");
          var buyEl = document.getElementById("{buy_id}");
          sel.addEventListener("change", function () {{
            if (sel.value) {{
              buyEl.href = sel.value;
              buyEl.textContent = "Buy now";
              buyEl.classList.remove("disabled");
            }} else {{
              buyEl.href = "{html.escape(default_href, quote=True)}";
              buyEl.textContent = "Choose a size first";
              buyEl.classList.add("disabled");
            }}
          }});
        }})();
        </script>
        """
    else:
        default_href = f'mailto:info@enperfeitas.com?subject=Order%20-%20{urllib.parse.quote(p["name"])}'
        buy_href = default_href if SHOP_PAUSED else (p["stripe_link"] or default_href)
        buy_block = f'<a class="btn secondary" href="{html.escape(buy_href, quote=True)}" aria-label="Buy {html.escape(p["name"])}">Buy now</a>'

    return f"""
    <div class="card shop-card">
      {img_block(p["name"], p["image"], "Shop", source=p["source"])}
      <div class="shop-card-body">
        {badge}
        <h3>{html.escape(p["name"])}</h3>
        <div class="price">{p["price"]}</div>
        <p class="desc">{p["desc"]}</p>
        {buy_block}
      </div>
    </div>
    """


tools_cards = "".join(shop_card(p) for p in PRODUCTS if not p["digital"])
tutorial_cards = "".join(shop_card(p) for p in PRODUCTS if p["digital"])

_shop_paused_notice = """
<section class="wrap">
  <div class="embed-note" style="margin-top:-8px;">
    Online payment is briefly paused while we sort out a billing hiccup &mdash; every "Buy now"
    below opens a pre-filled email instead for now. Message <a href="mailto:info@enperfeitas.com">info@enperfeitas.com</a>
    and we'll get you sorted directly.
  </div>
</section>
""" if SHOP_PAUSED else ""

body = f"""
<section class="page-header wrap">
  <h1>Shop</h1>
  <p>Tools and digital tutorials from the studio. Availability comes and goes with the studio's schedule &mdash; join the <a href="newsletter.html">newsletter</a> to hear about the next drop.</p>
</section>
{_shop_paused_notice}
<section>
  <div class="wrap">
    <h2>Tools</h2>
    <p style="color:var(--muted);margin-top:-8px;">In stock, shipped from the studio in Stockholm.</p>
    <div class="grid-3" style="margin-top:24px;">
      {tools_cards}
    </div>
  </div>
</section>

<section class="alt">
  <div class="wrap">
    <h2>Digital tutorials</h2>
    <p style="color:var(--muted);margin-top:-8px;">Instant PDF/video guides &mdash; sent by email after purchase.</p>
    <div class="grid-4" style="margin-top:24px;">
      {tutorial_cards}
    </div>
  </div>
</section>

<section>
  <div class="wrap" style="text-align:center;max-width:640px;">
    <p style="color:var(--muted);font-size:0.9rem;">Questions before you buy? <a href="mailto:info@enperfeitas.com">Get in touch</a>. See also <a href="shipping-info.html">Shipping Info</a> and <a href="refund-policy.html">Refunds and Returns</a>.</p>
  </div>
</section>
"""
page("shop.html", "Shop | Enperfeitas Studio",
     "Bookbinding tools and digital tutorials from Enperfeitas Studio &mdash; punching cradle, spacers, corner jig, and step-by-step guides.",
     body, active="shop.html")

# ---------------------------------------------------------------- DIGITAL DOWNLOADS
# One "thank you" page per digital tutorial -- this is the page each
# tutorial's Stripe Payment Link should redirect a buyer to right after
# payment (Payment Links -> pick the link -> "After payment" -> "Don't
# show confirmation page" -> redirect to this page's URL; see
# STRIPE-SHOP-SETUP.md for the exact URL per product). Not linked from the
# main nav or the Shop page -- same as onboarding.html -- since nobody
# should land here except a buyer coming from Stripe.
#
# The file itself is a self-healing placeholder, same idea as the product
# photos: the Download button points at downloads/<slug>.<ext>, and a
# small script checks (HEAD request) whether that file actually exists
# yet. Until Suzete drops the real file in, buyers see a "still being
# added, email us" message instead of a broken link -- nothing to break.
DOWNLOAD_MANIFEST = []  # (slug, name, ext, page_filename) for STRIPE-SHOP-SETUP.md

def download_page(p):
    slug = p["slug"]
    ext = p["file_ext"]
    file_path = f"downloads/{slug}.{ext}"
    page_filename = f"download-{slug}.html"
    DOWNLOAD_MANIFEST.append((slug, p["name"], ext, page_filename))
    kind = "video" if ext in ("mp4", "mov") else "PDF guide"
    mail_subject = urllib.parse.quote(f"Download - {p['name']}")
    body = f"""
<section class="page-header wrap">
  <h1>Thank you for your purchase!</h1>
  <p>Here's your {html.escape(p["name"])} &mdash; a {kind}. Save it somewhere you'll find it again; this link works any time you come back to it.</p>
</section>

<section>
  <div class="wrap" style="max-width:520px;">
    <div class="download-status">
      <a class="btn" id="dl-btn-{slug}" href="{file_path}" download hidden>Download {html.escape(p["name"])}</a>
      <span class="download-pending" id="dl-pending-{slug}">This file is still being added &mdash; check back soon, or email <a href="mailto:info@enperfeitas.com?subject={mail_subject}">info@enperfeitas.com</a> and Suzete will send it straight to you.</span>
    </div>
    <p style="margin-top:28px;color:var(--muted);font-size:0.9rem;">Questions about your order? <a href="mailto:info@enperfeitas.com">Get in touch</a>.</p>
  </div>
</section>
<script>
(function () {{
  fetch("{file_path}", {{ method: "HEAD" }}).then(function (r) {{
    if (r.ok) {{
      document.getElementById("dl-btn-{slug}").hidden = false;
      document.getElementById("dl-pending-{slug}").hidden = true;
    }}
  }}).catch(function () {{ /* leave the "still being added" message showing */ }});
}})();
</script>
"""
    page(page_filename, f"Your download: {p['name']} | Enperfeitas",
         f"Download page for {p['name']}, shown automatically after Stripe checkout.",
         body, active=None)


os.makedirs(os.path.join(DIST, "downloads"), exist_ok=True)
for _p in PRODUCTS:
    if _p["digital"]:
        download_page(_p)

# ---------------------------------------------------------------- ONBOARDING
body = f"""
<section class="page-header wrap">
  <h1>Dear client,</h1>
  <p>Here's what to expect when you commission a custom, handcrafted book from Enperfeitas &mdash; traditional craftsmanship, with modern touches.</p>
</section>

<section>
  <div class="wrap">
    <ol class="steps">
      <li><h3>Creative Assembly</h3><p>An initial consultation to discuss your vision, preferences, and specific requirements.</p></li>
      <li><h3>Crafting Contracts</h3><p>A design proposal, followed by a formal agreement with payment terms and a deposit requirement.</p></li>
      <li><h3>Production Orbit</h3><p>Your book is handcrafted with close attention to detail and quality.</p></li>
      <li><h3>Sharing is Caring</h3><p>Ongoing communication, with progress photos and status updates along the way.</p></li>
      <li><h3>Final Touches and Delivery</h3><p>Your approval, final payment, and delivery arrangements &mdash; you'll choose your preferred delivery option, and additional fees may apply.</p></li>
    </ol>
  </div>
</section>

<section class="alt" style="text-align:center;">
  <div class="wrap">
    <p>Client satisfaction matters just as much after delivery as before it &mdash; questions are always welcome.</p>
    <p><em>Making things that last.</em><br>&mdash; Suzete Pihl</p>
    <a class="btn" href="contact.html">Start a conversation</a>
  </div>
</section>
"""
page("onboarding.html", "How a Commission Works | Enperfeitas Studio",
     "The five-stage process for commissioning a custom handcrafted book from Enperfeitas Studio.",
     body, active=None)

# ---------------------------------------------------------------- NEWSLETTER
# The live page is a full-page embed of Suzete's own public Substack signup
# widget (https://enperfeitas.substack.com/embed) -- her avatar, title,
# welcome blurb, and the working email form all come from that widget
# itself, not from Squarespace page content. Our previous build only linked
# out to Substack instead of embedding it, so subscribing meant leaving the
# site. Substack's /embed endpoint is meant to be embedded on third-party
# pages (no login or token required), so it's used directly here -- a real,
# working subscribe form with zero backend of our own. The widget already
# carries its own title/description, so our own heading stays short rather
# than repeating it.
body = f"""
<section class="page-header wrap">
  <h1>Join the community</h1>
  <p>Studio news, slow process, and the occasional surprise &mdash; straight to your inbox.</p>
</section>

<section style="text-align:center;">
  <div class="wrap" style="max-width:480px;">
    <iframe src="https://enperfeitas.substack.com/embed" width="100%" height="500"
            style="border:1px solid var(--line);background:transparent;"
            frameborder="0" scrolling="no"
            title="Subscribe to the Enperfeitas Studio newsletter on Substack"></iframe>
    <p style="margin-top:18px;color:var(--muted);font-size:0.9rem;">Prefer to subscribe directly on Substack? <a href="https://enperfeitas.substack.com" target="_blank" rel="noopener">Open it here</a>.</p>
  </div>
</section>
"""
page("newsletter.html", "Newsletter | Enperfeitas Studio",
     "Subscribe to the Enperfeitas Studio newsletter on Substack for studio news, workshop dates, and new work.",
     body, active=None)

# ---------------------------------------------------------------- CONTACT
# The live site runs a real Squarespace contact form (Subject, Describe your
# order, Name, Email, Send) that posts to Squarespace's own backend -- this
# static rebuild has no server to receive that, so per Suzete's choice the
# same-looking form instead assembles its fields into a mailto: link on
# submit (see the inline script below), opening the visitor's own email app
# addressed to the studio with everything pre-filled.
body = f"""
<section class="page-header wrap">
  <h1>This is the beginning of something beautiful</h1>
  <p>Welcome to my world of personalized bookbinding. I hope to hear from you so we can create something exceptional together.</p>
</section>

<section>
  <div class="wrap grid-2 top-align">
    {img_block("Hands holding a hand-bound book", "contact-hero.webp", "Contact", source="https://images.squarespace-cdn.com/content/v1/6287cba0410c800d0ff1f2b2/95b0b3b9-08a1-48af-932c-23e269102ee4/TB-1.png", extra_class="contact-photo")}
    <div>
      <h2>Get in touch</h2>
      <p>Email: <a href="mailto:info@enperfeitas.com">info@enperfeitas.com</a></p>
      <p><strong>Enperfeitas Studio address:</strong><br>Gudmundr&aring;gatan 10<br>V&auml;llingby &mdash; Stockholm, Sweden</p>
      <p class="form-intro">Prefer to write directly? Use the email above. Or tell us more about what you have in mind with the quick form below:</p>

      <form class="contact-form" id="contact-form">
        <label for="cf-subject">Subject <span class="req">(required)</span></label>
        <input type="text" id="cf-subject" name="subject" required>

        <label for="cf-describe">Describe your order <span class="req">(required)</span></label>
        <p class="field-hint">In what you would like to collaborate with or make a special order about &hellip;</p>
        <textarea id="cf-describe" name="describe" rows="5" required></textarea>

        <p class="group-label">Name</p>
        <div class="name-row">
          <div>
            <label for="cf-first">First Name <span class="req">(required)</span></label>
            <input type="text" id="cf-first" name="first" required>
          </div>
          <div>
            <label for="cf-last">Last Name <span class="req">(required)</span></label>
            <input type="text" id="cf-last" name="last" required>
          </div>
        </div>

        <label for="cf-email">Email <span class="req">(required)</span></label>
        <input type="email" id="cf-email" name="email" required>

        <button type="submit" class="btn">Send</button>
        <p class="form-note">Opens your email app with this filled in, addressed to the studio.</p>
      </form>
    </div>
  </div>
</section>

<script>
(function () {{
  var form = document.getElementById('contact-form');
  if (!form) return;
  form.addEventListener('submit', function (e) {{
    e.preventDefault();
    var subject = form.subject.value.trim();
    var describe = form.describe.value.trim();
    var first = form.first.value.trim();
    var last = form.last.value.trim();
    var email = form.email.value.trim();
    var mailSubject = 'Website inquiry - ' + subject;
    var mailBody = 'Name: ' + first + ' ' + last + '\\n' +
      'Email: ' + email + '\\n\\n' +
      'Subject: ' + subject + '\\n\\n' +
      'Order details:\\n' + describe;
    window.location.href = 'mailto:info@enperfeitas.com?subject=' +
      encodeURIComponent(mailSubject) + '&body=' + encodeURIComponent(mailBody);
  }});
}})();
</script>
"""
page("contact.html", "Contact | Enperfeitas Studio",
     "Get in touch with Enperfeitas Studio in Vällingby, Stockholm — send an inquiry, or reach us by email, Instagram, or Facebook.",
     body, active="contact.html")

# ---------------------------------------------------------------- LINKS
link_items = [
    ("studio.html", "The Studio"),
    ("collectibles.html", "Collectibles"),
    ("workshops.html", "Workshops"),
    ("newsletter.html", "Newsletter"),
    ("contact.html", "Contact"),
]
link_html = "".join(f'<li><a href="{href}">{label}</a></li>' for href, label in link_items)
body = f"""
<section class="page-header wrap">
  <h1>Links</h1>
  <p>Everything Enperfeitas, in one place.</p>
</section>
<section>
  <div class="wrap" style="max-width:420px;">
    <ul class="list-links">{link_html}</ul>
  </div>
</section>
"""
page("links.html", "Links | Enperfeitas",
     "All Enperfeitas links in one place — studio, collectibles, workshops, newsletter, and contact.",
     body, active=None)

# ---------------------------------------------------------------- PRIVACY POLICY
# The live page runs the full text of a generated legal privacy notice (12
# numbered sections plus a summary) -- our previous build only carried a
# short paraphrase of about half of it, silently dropping legally-relevant
# sections entirely (data retention, the minors/under-18 clause, Do-Not-Track,
# and the data review/update/delete process). Policy language is a
# commitment Suzete is accountable for, so this reproduces the substance of
# every section faithfully rather than summarizing further. It's presented
# as an accordion (the site's existing FAQ pattern, see .faq-list) instead
# of one long undifferentiated scroll, since a privacy notice is something
# people skim for one specific answer rather than read start to finish.
privacy_sections = accordion([
    ("1. What information do we collect?",
     "<p>We collect personal information that you voluntarily provide when you register, "
     "contact us, or otherwise interact with our Services. This may include your "
     "<strong>name</strong> and <strong>email address</strong>. We do not process sensitive "
     "personal information (such as racial or ethnic origin, sexual orientation, or "
     "religious beliefs), and we do not collect information about you from third parties.</p>"
     "<p><strong>Payment data:</strong> if you make a purchase, data such as your payment "
     "instrument number is collected to process the transaction. All payment data is "
     "handled and stored by Stripe &mdash; see "
     "<a href=\"https://stripe.com/se/privacy\" target=\"_blank\" rel=\"noopener\">Stripe&rsquo;s "
     "privacy notice</a>.</p>"
     "<p><strong>Automatically collected data:</strong> when you visit our Services, we "
     "automatically collect information such as your IP address, browser and device "
     "characteristics, operating system, language preferences, referring URLs, and "
     "approximate location &mdash; primarily to keep the Services secure and working, and "
     "for internal analytics and reporting.</p>"),
    ("2. How do we process your information?",
     "<p>We process your information to: facilitate account creation and manage user "
     "accounts; deliver the services you request; respond to your inquiries and offer "
     "support; send administrative information, such as updates to our terms and "
     "policies; and fulfil and manage your orders, payments, returns, and exchanges. We "
     "may also process information to protect someone&rsquo;s vital interests (for example, "
     "to prevent harm). We only process your information for other purposes with your "
     "prior consent.</p>"),
    ("3. What legal bases do we rely on?",
     "<p>If you are located in the EU or UK, we rely on one or more of: your "
     "<strong>consent</strong> (which you can withdraw at any time); <strong>performance "
     "of a contract</strong>, to fulfil our obligations to you; <strong>legal "
     "obligations</strong>, such as cooperating with a regulatory body; and "
     "<strong>vital interests</strong>, where necessary to protect someone&rsquo;s safety.</p>"
     "<p>If you are located in Canada, we rely on your express or implied consent. In "
     "limited, legally-permitted circumstances (for example fraud prevention, a witness "
     "statement, or a court order) we may process information without consent, as "
     "allowed under Canadian law.</p>"),
    ("4. When and with whom do we share your information?",
     "<p>We may share your information during a business transfer &mdash; for example, in "
     "connection with a merger, sale of company assets, financing, or acquisition of "
     "all or part of the business.</p>"),
    ("5. Do we use cookies and other tracking technologies?",
     "<p>We may use cookies and similar technologies to keep our Services secure, "
     "remember your preferences, and support basic site functions. We also use "
     "<strong>Google Analytics</strong> to understand how the Services are used &mdash; you "
     "can opt out at <a href=\"https://tools.google.com/dlpage/gaoptout\" target=\"_blank\" "
     "rel=\"noopener\">Google&rsquo;s opt-out page</a>. Third parties and service providers "
     "may also use tracking technologies on our Services for analytics and "
     "advertising.</p>"),
    ("6. How long do we keep your information?",
     "<p>We keep your personal information only for as long as necessary for the "
     "purposes set out in this notice, unless a longer period is required by law (for "
     "example, tax or accounting requirements). Once there is no ongoing need to "
     "process it, we delete or anonymise it, or &mdash; where that isn&rsquo;t possible, such "
     "as information held in backup archives &mdash; we securely store it and restrict any "
     "further use until deletion is possible.</p>"),
    ("7. Do we collect information from minors?",
     "<p>We do not knowingly collect data from, or market to, children under 18 years "
     "of age. By using our Services, you represent that you are at least 18, or that "
     "you are a parent or guardian consenting on behalf of a minor dependant. If we "
     "learn that we have collected personal information from someone under 18, we will "
     "deactivate the account and take reasonable steps to delete that data. If you "
     "become aware of any data we may have collected from a child, please contact us "
     "at <a href=\"mailto:info@enperfeitas.com\">info@enperfeitas.com</a>.</p>"),
    ("8. What are your privacy rights?",
     "<p>If you are located in the EEA, UK, Switzerland, or Canada, you may have the "
     "right to: access and obtain a copy of your personal information; request "
     "correction or deletion; restrict how your information is processed; request data "
     "portability; and object to certain automated decision-making. You can exercise "
     "these rights, or withdraw consent, at any time by contacting us at "
     "<a href=\"mailto:info@enperfeitas.com\">info@enperfeitas.com</a>. If you are in the "
     "EEA or UK, you also have the right to complain to your data protection "
     "authority; in Switzerland, to the Federal Data Protection and Information "
     "Commissioner.</p>"
     "<p>You can unsubscribe from marketing emails at any time using the unsubscribe "
     "link in those emails, or by contacting us &mdash; we may still send non-marketing, "
     "service-related messages, such as those necessary to fulfil an order.</p>"),
    ("9. Do-Not-Track signals",
     "<p>No uniform standard for Do-Not-Track (DNT) browser signals currently exists, "
     "so we do not respond to them. If a standard is adopted that we&rsquo;re required to "
     "follow, we will update this notice to reflect that.</p>"),
    ("10. Do we make updates to this notice?",
     "<p>Yes &mdash; we may update this Privacy Notice from time to time to stay compliant "
     "with relevant laws. The &ldquo;Last updated&rdquo; date at the top reflects the most "
     "recent revision, and we&rsquo;ll note any material changes.</p>"),
    ("11. How can you contact us about this notice?",
     "<p>Email: <a href=\"mailto:info@enperfeitas.com\">info@enperfeitas.com</a><br>"
     "Or by post: Enperfeitas, Gudmundr&aring;gatan 10, V&auml;llingby, Stockholm 16243, "
     "Sweden</p>"),
    ("12. How can you review, update, or delete your data?",
     "<p>Depending on the laws that apply to you, you may have the right to request "
     "access to the personal information we hold about you, ask us to correct "
     "inaccuracies, or request deletion. To make such a request, please contact us at "
     "<a href=\"mailto:info@enperfeitas.com\">info@enperfeitas.com</a>.</p>"),
])
body = f"""
<section class="page-header wrap">
  <h1>Privacy Policy</h1>
  <p>Last updated: January 18, 2026</p>
</section>
<section>
  <div class="wrap" style="max-width:720px;">
    <p>This Privacy Notice for Enperfeitas (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) describes how and why we might access, collect, store, use, and/or share your personal information when you use our Services &mdash; including when you visit enperfeitas.com, or engage with us in other related ways, such as marketing or events.</p>
    <p>Reading this notice will help you understand your privacy rights and choices. If you do not agree with our policies and practices, please do not use our Services. If you have any questions or concerns, please contact us at <a href="mailto:info@enperfeitas.com">info@enperfeitas.com</a>.</p>
    <div class="faq-list">
      {privacy_sections}
    </div>
  </div>
</section>
"""
page("privacy-policy.html", "Privacy Policy | Enperfeitas Studio", "Enperfeitas Studio privacy policy — what information we collect, how it's used, and your rights.", body)

# ---------------------------------------------------------------- REFUND POLICY
body = f"""
<section class="page-header wrap">
  <h1>Refund Policy</h1>
</section>
<section>
  <div class="wrap">
    <h2>Return process</h2>
    <p>Enperfeitas offers a 14-day return policy from the day of reception, for unused items in original condition. Contact <a href="mailto:info@enperfeitas.com">info@enperfeitas.com</a> with your name and order number or proof of purchase to start a return. Return shipping costs are the buyer's responsibility, except for damaged or faulty items. <strong>Items sent back without first requesting a return will not be accepted.</strong></p>
    <h2>Damaged or defective items</h2>
    <p>Products that arrive defective, damaged, or incorrect should be reported immediately to <a href="mailto:info@enperfeitas.com">info@enperfeitas.com</a> for evaluation and resolution.</p>
    <h2>Non-returnable items</h2>
    <p>Custom or personalised items, and discounted merchandise, are excluded from returns.</p>
    <h2>Contact</h2>
    <p>All return inquiries: <a href="mailto:info@enperfeitas.com">info@enperfeitas.com</a>, with your name and order number or proof of purchase. Return shipping instructions are provided only after a request is approved.</p>
  </div>
</section>
"""
page("refund-policy.html", "Refund Policy | Enperfeitas Studio", "Enperfeitas Studio refund and returns policy.", body)

# ---------------------------------------------------------------- SHIPPING INFO
body = f"""
<section class="page-header wrap">
  <h1>Shipping Information</h1>
</section>
<section>
  <div class="wrap">
    <h2>Where we ship</h2>
    <p>Enperfeitas currently ships to Europe, the United Kingdom, and the United States, with plans to expand.</p>
    <h2>Processing timelines</h2>
    <p>Standard orders: 3 to 7 business days. Custom orders: 3 weeks to 2 months for creation and shipment.</p>
    <h2>Notifications</h2>
    <p>You'll receive an email confirmation when your order is placed, and another when it ships.</p>
    <h2>Shipping costs</h2>
    <p>Shipping costs are calculated based on the total weight of your purchase, at the same rate PostNord charges the studio &mdash; no additional packaging fees. Alternative carriers require contacting the studio beforehand.</p>
    <h2>International fees</h2>
    <p>Customs duties may apply depending on your location relative to Sweden. The recipient is responsible for these charges.</p>
  </div>
</section>
"""
page("shipping-info.html", "Shipping Info | Enperfeitas Studio", "Enperfeitas Studio shipping information.", body)

# ---------------------------------------------------------------- TERMS OF SERVICE
body = f"""
<section class="page-header wrap">
  <h1>Terms of Service</h1>
</section>
<section>
  <div class="wrap" style="text-align:center;">
    <p>If you have any specific questions regarding our terms of service, please state them carefully in an email to <a href="mailto:info@enperfeitas.com">info@enperfeitas.com</a>.</p>
  </div>
</section>
"""
page("terms-of-service.html", "Terms of Service | Enperfeitas Studio", "Enperfeitas Studio terms of service.", body)

# ---------------------------------------------------------------- 404
# The live site's 404 has real on-brand personality (bookbinding puns, in
# Suzete's own voice) -- our previous build used generic placeholder copy
# ("Page not found... Try the homepage") that could belong to any site.
# Reproducing the live copy here isn't just fidelity, it's a real UX
# upgrade too: a distinctive, charming 404 reassures a lost visitor they're
# still in the right place, instead of reading as a broken/abandoned site.
body = f"""
<section class="page-header wrap" style="padding:110px 0 90px;">
  <h1>Oops! This page is Unbound!</h1>
  <div style="max-width:520px;margin:0 auto;">
    <p>Just like a book missing a page, we couldn&rsquo;t find the one you&rsquo;re looking for.</p>
    <p>Hey there, book lover! It seems you&rsquo;ve stumbled upon a page that&rsquo;s yet to be bound in my collection. While my expertise lies in binding beautiful books, sometimes even I lose a page or two in the vast library of the internet.</p>
    <p>But don&rsquo;t worry, I&rsquo;ve got plenty of threads and glue to fix things up!</p>
  </div>
  <p style="margin-top:24px;"><a class="btn" href="index.html">Bind me back to the homepage!</a></p>
</section>
"""
page("404.html", "Page Not Found | Enperfeitas Studio", "Oops! This page is Unbound — but we've got plenty of threads and glue to fix things up.", body)

print("legal / 404 pages done")

# ---------------------------------------------------------------- IMAGE MANIFEST
_still_missing = [
    (filename, label, pg, source) for (filename, label, pg, source) in IMAGE_MANIFEST
    if not os.path.exists(os.path.join(DIST, "images", filename))
]
with open(os.path.join(os.path.dirname(DIST), "IMAGE-MANIFEST.md"), "w", encoding="utf-8") as f:
    f.write("# Image manifest\n\n")
    f.write(f"{len(IMAGE_MANIFEST) - len(_still_missing)} of {len(IMAGE_MANIFEST)} photo slots are already filled in. The table below lists only what's still a placeholder. I pulled the real image URLs straight from your live site, so filling one in is just: click the link, save the file, rename it to match, drop it in `website/images/`. The placeholder disappears automatically — no code changes needed.\n\n")
    f.write("| Page | What the photo shows | Save as | Download |\n|---|---|---|---|\n")
    for filename, label, pg, source in _still_missing:
        clean_label = label.replace("&mdash;", "-").replace("&rsquo;", "'")
        link = f"[Original]({source})" if source else "_(not found — see note below)_"
        f.write(f"| {pg} | {clean_label} | `images/{filename}` | {link} |\n")
    f.write(
        "\nTip: right-click each \"Original\" link and choose **Save Link As…**, saving it with the exact "
        "filename from the **Save as** column. A couple of the source files are `.png`/`.webp` rather than "
        "`.jpg` — that's fine, just keep the filename from this table exactly as written and the browser will "
        "save it correctly regardless of the source format.\n"
    )
print(f"image manifest: {len(IMAGE_MANIFEST)} entries, {len(_still_missing)} still missing, {sum(1 for *_, s in _still_missing if s)} with direct links")

# ---------------------------------------------------------------- STRIPE SHOP SETUP GUIDE
with open(os.path.join(os.path.dirname(DIST), "STRIPE-SHOP-SETUP.md"), "w", encoding="utf-8") as f:
    f.write("# Shop & digital delivery\n\n")
    if SHOP_PAUSED:
        f.write(
            "## The shop is paused\n\n"
            "Every \"Buy now\" button currently falls back to a pre-filled email instead of "
            "taking a real payment — all 18 Payment Links (7 products + 11 size variants) were "
            "created on the wrong Stripe account, so checkout is paused until they're recreated "
            "on the right one.\n\n"
            "**To fix it:** in the *correct* Stripe account, recreate each Payment Link below "
            "(same steps as before: **Payment links → +New → +Add a new product**, set the "
            "name/price, **Create link**), then send me the new links and I'll wire them back in "
            "and flip the shop back on (`SHOP_PAUSED = False` in `build.py`).\n\n"
            "| Product | Price |\n|---|---|\n"
        )
        for p in PRODUCTS:
            if p.get("variant_options"):
                for v in p["variant_options"]:
                    f.write(f"| {p['name']} — {v['label']} | (set in the correct account) |\n")
            else:
                f.write(f"| {p['name']} | {p['price']} |\n")
        f.write("\n")
    else:
        f.write(
            "## The shop is live\n\n"
            "\"Buy now\" buttons on the Shop page are connected to real Stripe Payment Links on the "
            "correct account. If any sizes are still waiting on a link, they're listed under "
            "\"Size variants still needed\" below.\n\n"
        )
    f.write(
        "## Turn on automatic digital delivery\n\n"
        "Each digital tutorial has its own \"thank you\" page on the site, ready to receive a "
        "buyer the moment they pay. To connect it: in the Stripe Dashboard, go to **Payment "
        "links**, open that product's link, click **Edit**, scroll to **After payment**, choose "
        "**Don't show confirmation page**, and paste in that product's URL below. Repeat for "
        "all four — once set, buyers land straight on their download page after paying, no "
        "action needed from you per sale.\n\n"
        "| Product | Redirect this Payment Link to |\n|---|---|\n"
    )
    for slug, name, ext, page_filename in DOWNLOAD_MANIFEST:
        f.write(f"| {name} | `https://enperfeitas.com/{page_filename}` |\n")

    _missing_downloads = [
        (slug, name, ext, page_filename) for (slug, name, ext, page_filename) in DOWNLOAD_MANIFEST
        if not os.path.exists(os.path.join(DIST, "downloads", f"{slug}.{ext}"))
    ]
    if _missing_downloads:
        f.write(
            "\n## Files still needed\n\n"
            "Each download page is built but empty until the real file is in place — until then, "
            "buyers see a \"still being added, email us\" message instead of a broken link, so "
            "nothing is broken in the meantime. Send these to me (or drop them yourself into "
            "`website/downloads/`, named exactly as below) and I'll wire them in:\n\n"
            "| Product | Save as | Type |\n|---|---|---|\n"
        )
        for slug, name, ext, page_filename in _missing_downloads:
            kind = "Video" if ext in ("mp4", "mov") else "PDF"
            f.write(f"| {name} | `downloads/{slug}.{ext}` | {kind} |\n")
        f.write(
            "\nIf one of these is actually a video already hosted somewhere (YouTube, Vimeo, "
            "Google Drive), send me that link instead of the file itself — large video files "
            "aren't a great fit for the GitHub repo, and the download page can point straight at "
            "it instead.\n"
        )
    else:
        f.write("\n## Files\n\nAll four tutorial files are in place. Nothing more to do here.\n")
    f.write(
        "\n**Note on privacy:** these download pages aren't password-protected or checked against "
        "an actual Stripe payment — anyone with the direct link could open one. For 90 kr "
        "tutorials this is a common, low-risk trade-off among small shops; if that ever matters "
        "more, a paid delivery tool (like SendOwl) can add real access control later.\n\n"
    )
    if SHOP_PAUSED:
        f.write(
            "## Size variants\n\nCovered above — the size picker on Spacers and Corner Cutting "
            "Jig needs a fresh Payment Link per size on the correct account, same as every other "
            "product right now.\n\n"
        )
    else:
        _missing_variants = [
            (p["name"], [v["label"] for v in p["variant_options"] if not v["stripe_link"]])
            for p in PRODUCTS if p.get("variant_options")
        ]
        _missing_variants = [(name, labels) for name, labels in _missing_variants if labels]
        if _missing_variants:
            f.write(
                "## Size variants still needed\n\n"
                "A single Payment Link can only charge one fixed price — it can't show a dropdown "
                "that changes the price per size. The Shop page has a size picker for both variant "
                "products, but each size below still needs its own Payment Link before it charges "
                "automatically; until then, picking that size falls back to a pre-filled email "
                "instead.\n\n"
                "For each size: **Payment links → +New → +Add a new product**, name it so you can "
                "tell it apart later (e.g. \"Bookbinding Spacers — 10mm\"), set its price, **Create "
                "link**, then send me the size and its link so I can wire it in.\n\n"
                "| Product | Sizes still needing their own link |\n|---|---|\n"
            )
            for name, labels in _missing_variants:
                f.write(f"| {name} | {', '.join(labels)} |\n")
            f.write("\n")
        else:
            f.write(
                "## Size variants\n\nEvery size of Spacers and Corner Cutting Jig has its own "
                "Payment Link — the dropdown on the Shop page charges the right price automatically "
                "for every option. Nothing more to do here.\n\n"
            )
    f.write(
        "## Photos still needed\n\n"
        "The product photos are the same self-healing placeholders as the rest of the site — see "
        "`IMAGE-MANIFEST.md` for the filenames and direct links to the originals.\n"
    )
print("wrote STRIPE-SHOP-SETUP.md")
