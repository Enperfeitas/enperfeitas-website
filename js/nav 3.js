// Mobile nav toggle. No dependencies.
(function () {
  var header = document.querySelector('header.site');
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('nav.primary');
  if (!header || !toggle || !nav) return;

  function closeNav() {
    header.classList.remove('nav-open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  toggle.addEventListener('click', function () {
    var isOpen = header.classList.toggle('nav-open');
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  // Close after choosing a link, and if the viewport is widened past the
  // hamburger breakpoint. Must match the CSS breakpoint that switches
  // nav.primary between the hamburger panel and the inline list
  // (currently 960px, see .nav-toggle / nav.primary in style.css) --
  // otherwise a menu left open while narrow could get stuck open (or a
  // still-narrow-enough width could get wrongly force-closed) after a
  // resize that a hardcoded 760 here wouldn't recognize as "still mobile".
  var MOBILE_NAV_BREAKPOINT = 960;
  nav.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') closeNav();
  });
  window.addEventListener('resize', function () {
    if (window.innerWidth > MOBILE_NAV_BREAKPOINT) closeNav();
  });

  // On mobile/tablet, the header takes up a large share of the screen (at
  // iPad-portrait's 768x1024 it's ~16%). Hide it while scrolling down
  // (reading), bring it back the instant the user scrolls up (wants the
  // logo/nav again). Left alone on desktop, near the very top of the page,
  // or while the mobile menu itself is open. Tied to the same breakpoint
  // as the hamburger menu itself (see above) rather than a separate
  // number, since this behavior exists specifically because the hamburger
  // header is compact/stacked -- it should apply exactly when that's true.
  var lastY = window.scrollY;
  var ticking = false;

  function handleScroll() {
    var y = window.scrollY;
    if (window.innerWidth <= MOBILE_NAV_BREAKPOINT && !header.classList.contains('nav-open')) {
      var headerH = header.offsetHeight;
      if (y > lastY && y > headerH) {
        header.classList.add('header-hidden');
      } else if (y < lastY) {
        header.classList.remove('header-hidden');
      }
    } else {
      header.classList.remove('header-hidden');
    }
    lastY = y;
    ticking = false;
  }

  window.addEventListener('scroll', function () {
    if (!ticking) {
      window.requestAnimationFrame(handleScroll);
      ticking = true;
    }
  }, { passive: true });
})();
