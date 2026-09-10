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

  // Close after choosing a link, and if the viewport is widened past mobile.
  nav.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') closeNav();
  });
  window.addEventListener('resize', function () {
    if (window.innerWidth > 760) closeNav();
  });

  // On mobile, the header takes up a large share of a small screen. Hide it
  // while scrolling down (reading), bring it back the instant the user
  // scrolls up (wants the logo/nav again). Left alone on desktop, near the
  // very top of the page, or while the mobile menu itself is open.
  var lastY = window.scrollY;
  var ticking = false;

  function handleScroll() {
    var y = window.scrollY;
    if (window.innerWidth <= 760 && !header.classList.contains('nav-open')) {
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
