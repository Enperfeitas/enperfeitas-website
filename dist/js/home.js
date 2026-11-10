/* ==========================================================================
   Home page behaviour. Plain JavaScript, no libraries.
   1. The header floats over the photo and turns solid white after a little scrolling.
   2. The arrows next to the reviews scroll the row sideways.
   ========================================================================== */

/* 1. Header over the photo */
(function () {
  var bar = document.querySelector('.topbar');
  function setBar() { if (bar) document.documentElement.style.setProperty('--hv-bar', bar.offsetHeight + 'px'); }
  function onScroll() { document.body.classList.toggle('hv-scrolled', window.scrollY > 8); }
  setBar(); onScroll();
  window.addEventListener('resize', setBar);
  window.addEventListener('scroll', onScroll, { passive: true });
})();

/* 2. Review arrows */
(function () {
  var box = document.getElementById('reviews'), prev = document.getElementById('rev-prev'), next = document.getElementById('rev-next');
  if (!box || !prev || !next) return;
  function step() { var card = box.querySelector('.testimonial'); return card ? card.getBoundingClientRect().width + 20 : 340; }
  function update() {
    prev.disabled = box.scrollLeft <= 4;
    next.disabled = box.scrollLeft + box.clientWidth >= box.scrollWidth - 4;
  }
  // The CSS (scroll-behavior) decides whether it glides or jumps, so visitors who ask for reduced motion get a jump.
  prev.addEventListener('click', function () { box.scrollBy({ left: -step() }); refresh(); });
  next.addEventListener('click', function () { box.scrollBy({ left: step() }); refresh(); });
  // Also check shortly after a click, once the scroll has finished, so the arrows are always right.
  function refresh() { setTimeout(update, 120); setTimeout(update, 450); setTimeout(update, 900); }
  box.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
})();
