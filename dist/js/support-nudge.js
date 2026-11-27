/* A gentle "pay if you like" reminder for the free tools.
 *
 * When: right after someone gets their result (the Box Maker's "Print / PDF" button, or any
 * "Download..." button in Booklet Imposition), a small card slides up in the corner. It never
 * blocks the tool, never takes the keyboard focus, and closes with the x, "Close" or Escape.
 *
 * How often:
 *   - at most once per visit, and at most once every 3 days
 *   - never again after "Don't show this again"
 *   - not for 60 days after someone clicks one of the donation links (on the card or the page)
 *
 * The three options (label, amount, link) come from the JSON block #donate-options, which
 * build.py writes from its DONATIONS list, so the amounts live in one place only.
 */
(function () {
  'use strict';

  var DAY = 24 * 60 * 60 * 1000;
  var KEY_OFF = 'ep-nudge-off', KEY_LAST = 'ep-nudge-last', KEY_GAVE = 'ep-nudge-gave';

  function get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* private window: fine */ } }
  function ago(k) { var t = Number(get(k)); return t ? Date.now() - t : Infinity; }

  var options = [];
  try { options = JSON.parse(document.getElementById('donate-options').textContent) || []; } catch (e) { return; }
  if (!options.length) return;

  var shownThisVisit = false;
  function allowed() {
    return !shownThisVisit && get(KEY_OFF) !== '1' && ago(KEY_LAST) > 3 * DAY && ago(KEY_GAVE) > 60 * DAY;
  }

  // Remember a donation click anywhere on the page (the cards at the bottom too).
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="https://donate.stripe.com/"]');
    if (a) set(KEY_GAVE, String(Date.now()));
  }, true);

  // The moments that mean "it worked": the tool's own print or download buttons.
  var TRIGGER = /^\s*(print\s*\/\s*pdf|download)/i;
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#boxmaker-root button, #imposition-root button, #boxmaker-root a, #imposition-root a');
    if (!b || !TRIGGER.test(b.textContent || '')) return;
    if (!allowed()) return;
    shownThisVisit = true;
    // Let the download start, or the print dialog open and close, before the card appears.
    window.setTimeout(show, 1500);
  }, true);

  var card = null;

  function show() {
    if (card) return;
    set(KEY_LAST, String(Date.now()));

    card = document.createElement('aside');
    card.className = 'nudge';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'false');
    card.setAttribute('aria-labelledby', 'nudge-title');

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'nudge-x';
    close.setAttribute('aria-label', 'Close');
    close.innerHTML = '&times;';

    var h = document.createElement('p');
    h.className = 'nudge-title';
    h.id = 'nudge-title';
    h.textContent = 'Did this save you some time?';

    var p = document.createElement('p');
    p.className = 'nudge-text';
    p.textContent = 'This tool is free and stays free. If you would like to say thanks, any of these helps me keep making them.';

    var list = document.createElement('div');
    list.className = 'nudge-options';
    options.forEach(function (o) {
      var a = document.createElement('a');
      a.className = 'btn secondary nudge-btn';
      a.href = /^https:\/\//.test(o.href) ? o.href : '#support';
      a.target = '_blank';
      a.rel = 'noopener';
      var label = document.createElement('span');
      label.textContent = o.label;
      var amount = document.createElement('strong');
      amount.textContent = o.amount + ' kr';
      a.appendChild(label);
      a.appendChild(amount);
      a.addEventListener('click', function () { set(KEY_GAVE, String(Date.now())); window.setTimeout(hide, 300); });
      list.appendChild(a);
    });

    var foot = document.createElement('div');
    foot.className = 'nudge-foot';
    var lab = document.createElement('label');
    var box = document.createElement('input');
    box.type = 'checkbox';
    lab.appendChild(box);
    lab.appendChild(document.createTextNode(' Don’t show this again'));
    var done = document.createElement('button');
    done.type = 'button';
    done.className = 'nudge-close';
    done.textContent = 'Close';
    foot.appendChild(lab);
    foot.appendChild(done);

    card.appendChild(close);
    card.appendChild(h);
    card.appendChild(p);
    card.appendChild(list);
    card.appendChild(foot);
    document.body.appendChild(card);
    window.requestAnimationFrame(function () { card.classList.add('is-open'); });

    function finish() { if (box.checked) set(KEY_OFF, '1'); hide(); }
    close.addEventListener('click', finish);
    done.addEventListener('click', finish);
    document.addEventListener('keydown', onKey);
  }

  function onKey(e) { if (e.key === 'Escape') hide(); }

  function hide() {
    if (!card) return;
    var c = card;
    card = null;
    document.removeEventListener('keydown', onKey);
    var box = c.querySelector('input[type=checkbox]');
    if (box && box.checked) set(KEY_OFF, '1');
    c.classList.remove('is-open');
    window.setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 250);
  }
})();
