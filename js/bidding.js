/* ==========================================================================
   Enperfeitas invitation-only bidding page
   Plain JavaScript, no libraries. All rules are enforced by the Google Apps
   Script (apps-script/Code.gs). This file only shows what the script returns.
   ========================================================================== */

// Paste the web app URL from Google Apps Script here (it ends in /exec).
// While this is empty the page runs in demo mode and sends nothing.
var WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxAsMpgPnNCepmEUy3UHtQkAo2kCpjjAMDaWb7FXJW-FMqQx3jBr3toSEqLSkGmaJY/exec';

// Link to the sign-up Google Form (placeholder).
var SIGNUP_FORM_URL = 'https://forms.gle/M8LoSd8ixQLTDtif8';

(function () {
  'use strict';

  var POLL_MS = 5000;
  var STORAGE_KEY = 'enperfeitas_bid_code';
  var TZ = 'Europe/Stockholm';
  var DEMO = !WEB_APP_URL;

  var ui = {};
  var app = {
    code: '',
    me: null, // { firstName, displayName, isHighBidder } when the code is valid
    codeProblem: '', // 'invalid' | 'revoked' | ''
    state: null,
    offsetMs: 0, // server time minus this device's time
    lost: false,
    busy: false,
    pending: null, // amount waiting for confirmation
    lastHigh: null,
    closedHandled: false,
    lastStatus: '',
    pieceKey: '', // what the gallery and text were last built from
    photoIndex: 1
  };
  var pollTimer = null;
  var polling = false;

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */

  function $(id) {
    return document.getElementById(id);
  }

  function setText(el, text) {
    el.textContent = text === null || text === undefined ? '' : String(text);
  }

  function fmtAmount(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' SEK';
  }

  function fmtDateLong(ms) {
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: TZ,
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(ms));
    } catch (e) {
      return new Date(ms).toString();
    }
  }

  function fmtDateShort(iso) {
    var ms = Date.parse(iso);
    if (isNaN(ms)) return '';
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: TZ,
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(ms));
    } catch (e) {
      return '';
    }
  }

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function fmtCountdown(ms) {
    if (ms < 0) ms = 0;
    var total = Math.floor(ms / 1000);
    var d = Math.floor(total / 86400);
    var h = Math.floor((total % 86400) / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    var clock = pad2(h) + ':' + pad2(m) + ':' + pad2(s);
    return d > 0 ? d + (d === 1 ? ' day ' : ' days ') + clock : clock;
  }

  function normCode(s) {
    return String(s || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 16);
  }

  function nowServerMs() {
    return Date.now() + app.offsetMs;
  }

  /* ------------------------------------------------------------------ */
  /* Talking to the Apps Script                                          */
  /* ------------------------------------------------------------------ */

  function apiGet(params) {
    var q = Object.keys(params)
      .map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      })
      .join('&');
    return fetch(WEB_APP_URL + '?' + q, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    });
  }

  function apiPostBid(code, amount) {
    // text/plain avoids a CORS preflight request, which Apps Script does not answer.
    return fetch(WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'bid', code: code, amount: amount })
    }).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Demo mode (only when WEB_APP_URL is empty)                          */
  /* ------------------------------------------------------------------ */

  function demoState() {
    var now = Date.now();
    var closed = /[?&]demo=closed/.test(location.search);
    var upcoming = /[?&]demo=upcoming/.test(location.search);
    var closing = closed ? now - 3600000 : now + (upcoming ? 3 * 86400000 : 2 * 3600000 + 14 * 60000);
    var start = upcoming ? now + 2 * 3600000 + 30 * 60000 : null;
    function iso(ms) {
      return new Date(ms).toISOString();
    }
    return {
      ok: true,
      pieceTitle: 'Demo piece (not a real auction)',
      openingBid: 1000,
      minStep: 100,
      minNextBid: upcoming ? 1000 : 1900,
      highBid: upcoming ? null : 1800,
      highBidder: upcoming ? null : 'Mira',
      bidCount: upcoming ? 0 : 3,
      history: upcoming
        ? []
        : [
            { name: 'Mira', amount: 1800, time: iso(now - 12 * 60000) },
            { name: 'Jonas', amount: 1500, time: iso(now - 55 * 60000) },
            { name: 'Mira', amount: 1000, time: iso(now - 3 * 3600000) }
          ],
      closingTime: iso(closing),
      closingMs: closing,
      extensionMinutes: 5,
      status: closed ? 'closed' : upcoming ? 'upcoming' : 'open',
      startTime: start ? iso(start) : null,
      startMs: start,
      photoPrefix: 'beige-jeand-de-g',
      photoCount: 4,
      photoAlt: 'Beige linen book with a mustard leather spine',
      description: 'Demo text. In the real round this comes from the description row in the Config tab.\nA new line in that cell becomes a new paragraph here.',
      details: 'Size: 20 x 13 cm (example)\nMaterials: Example linen and leather\nMade: Example year',
      serverTime: iso(now),
      serverTimeMs: now
    };
  }

  function demoWhoami(code) {
    if (code === 'BADCODE') return { ok: true, valid: false, reason: 'invalid' };
    if (code === 'REVOKED') return { ok: true, valid: false, reason: 'revoked' };
    return { ok: true, valid: true, firstName: 'Demo', displayName: 'Demo', isHighBidder: false };
  }

  /* ------------------------------------------------------------------ */
  /* Rendering                                                           */
  /* ------------------------------------------------------------------ */

  function showMessage(text, kind) {
    var el = ui.message;
    setText(el, text);
    el.className = 'bid-message' + (text ? ' is-visible' : '') + (kind ? ' is-' + kind : '');
  }

  function renderHistory(history) {
    var list = ui.history;
    while (list.firstChild) list.removeChild(list.firstChild);
    var items = history || [];
    ui.noHistory.hidden = items.length > 0;
    items.slice(0, 50).forEach(function (h, i) {
      var li = document.createElement('li');
      if (i === 0) li.className = 'is-top';
      var who = document.createElement('span');
      who.className = 'h-name';
      var label = h.name;
      if (app.me && app.me.displayName === h.name) label += ' (you)';
      setText(who, label);
      var amt = document.createElement('span');
      amt.className = 'h-amount';
      setText(amt, fmtAmount(h.amount));
      var time = document.createElement('span');
      time.className = 'h-time';
      setText(time, fmtDateShort(h.time));
      li.appendChild(who);
      li.appendChild(amt);
      li.appendChild(time);
      list.appendChild(li);
    });
  }

  function isHighBidder() {
    return !!(app.me && app.state && app.state.highBidder && app.state.highBidder === app.me.displayName);
  }

  function renderCountdown() {
    var s = app.state;
    if (!s) return;
    if (s.status === 'closed') {
      setText(ui.countdown, 'Closed');
      return;
    }
    var upcoming = s.status === 'upcoming' && typeof s.startMs === 'number';
    var remaining = (upcoming ? s.startMs : s.closingMs) - nowServerMs();
    if (remaining <= 0) {
      setText(ui.countdown, upcoming ? 'Opening now' : 'Closing now');
      if (!app.closedHandled) {
        app.closedHandled = true;
        refresh();
      }
      return;
    }
    app.closedHandled = false;
    setText(ui.countdown, fmtCountdown(remaining));
  }

  /* ------------------------------------------------------------------ */
  /* The piece: photos, description and details (from the Config tab)    */
  /* ------------------------------------------------------------------ */

  var MAX_PHOTOS = 12;
  var PROBE_PHOTOS = 8;

  function photoUrl(prefix, n) {
    return 'images/bidding/' + prefix + '-' + n + '.webp';
  }

  // When no photo count is set, look for photo-1, photo-2 ... until one is missing.
  function probePhotos(prefix) {
    return new Promise(function (resolve) {
      var n = 0;
      function next() {
        if (n >= PROBE_PHOTOS) return resolve(n);
        var img = new Image();
        img.onload = function () {
          n++;
          next();
        };
        img.onerror = function () {
          resolve(n);
        };
        img.src = photoUrl(prefix, n + 1);
      }
      next();
    });
  }

  function showPhoto(prefix, count, alt, index) {
    app.photoIndex = index;
    ui.photo.setAttribute('src', photoUrl(prefix, index));
    ui.photo.setAttribute('alt', count > 1 ? alt + ' (photo ' + index + ' of ' + count + ')' : alt);
    var buttons = ui.thumbs.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      if (i + 1 === index) buttons[i].setAttribute('aria-current', 'true');
      else buttons[i].removeAttribute('aria-current');
    }
  }

  function buildGallery(prefix, count, alt) {
    while (ui.thumbs.firstChild) ui.thumbs.removeChild(ui.thumbs.firstChild);
    if (!prefix || count < 1) {
      ui.gallery.hidden = true;
      ui.layout.classList.remove('has-photo');
      return;
    }
    ui.gallery.hidden = false;
    ui.layout.classList.add('has-photo');
    ui.thumbs.hidden = count < 2;
    for (var i = 1; i <= count; i++) {
      (function (n) {
        var li = document.createElement('li');
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Show photo ' + n + ' of ' + count);
        var img = document.createElement('img');
        img.setAttribute('src', photoUrl(prefix, n));
        img.setAttribute('alt', '');
        btn.appendChild(img);
        btn.addEventListener('click', function () {
          showPhoto(prefix, count, alt, n);
        });
        li.appendChild(btn);
        ui.thumbs.appendChild(li);
      })(i);
    }
    showPhoto(prefix, count, alt, 1);
  }

  function renderText(s) {
    var i;
    while (ui.desc.firstChild) ui.desc.removeChild(ui.desc.firstChild);
    var paragraphs = String(s.description || '')
      .split(/\n+/)
      .map(function (x) {
        return x.trim();
      })
      .filter(Boolean);
    paragraphs.forEach(function (text) {
      var p = document.createElement('p');
      setText(p, text);
      ui.desc.appendChild(p);
    });
    ui.desc.hidden = paragraphs.length === 0;

    while (ui.details.firstChild) ui.details.removeChild(ui.details.firstChild);
    var lines = String(s.details || '').split(/\n+/);
    var shown = 0;
    for (i = 0; i < lines.length; i++) {
      var at = lines[i].indexOf(':');
      if (at < 1) continue;
      var label = lines[i].slice(0, at).trim();
      var value = lines[i].slice(at + 1).trim();
      if (!label || !value) continue;
      var row = document.createElement('div');
      var dt = document.createElement('dt');
      var dd = document.createElement('dd');
      setText(dt, label);
      setText(dd, value);
      row.appendChild(dt);
      row.appendChild(dd);
      ui.details.appendChild(row);
      shown++;
    }
    ui.details.hidden = shown === 0;
  }

  function renderPiece(s) {
    var prefix = /^[a-z0-9-]{1,80}$/.test(s.photoPrefix || '') ? s.photoPrefix : '';
    var count = typeof s.photoCount === 'number' ? Math.min(MAX_PHOTOS, s.photoCount) : null;
    var alt = s.photoAlt || s.pieceTitle || 'Photo of the piece';
    var key = [prefix, count, alt, s.description, s.details].join('|');
    if (key === app.pieceKey) return;
    app.pieceKey = key;
    renderText(s);
    if (!prefix) {
      buildGallery('', 0, alt);
    } else if (count !== null) {
      buildGallery(prefix, count, alt);
    } else {
      probePhotos(prefix).then(function (found) {
        if (app.pieceKey === key) buildGallery(prefix, found, alt);
      });
    }
  }

  function render() {
    var s = app.state;
    if (!s) return;
    renderPiece(s);
    var closed = s.status === 'closed';
    var upcoming = s.status === 'upcoming';
    var justOpened = app.lastStatus === 'upcoming' && s.status === 'open';
    app.lastStatus = s.status;

    setText(ui.title, s.pieceTitle || 'The piece');
    document.title = (s.pieceTitle ? s.pieceTitle + ' | ' : '') + 'Bidding | Enperfeitas Studio';

    if (s.highBid === null || s.highBid === undefined) {
      setText(ui.high, 'No bids yet');
      setText(ui.bidder, 'Opening bid ' + fmtAmount(s.openingBid));
    } else {
      setText(ui.high, fmtAmount(s.highBid));
      setText(ui.bidder, 'Held by ' + s.highBidder + (isHighBidder() ? ' (you)' : ''));
      if (app.lastHigh !== null && app.lastHigh !== s.highBid) {
        ui.high.classList.remove('bid-flash');
        void ui.high.offsetWidth; // restart the (optional) highlight
        ui.high.classList.add('bid-flash');
      }
    }
    app.lastHigh = s.highBid;

    setText(ui.timeLabel, closed ? 'Bidding' : upcoming ? 'Opens in' : 'Time left');
    setText(
      ui.closing,
      upcoming
        ? 'Opens ' + fmtDateLong(s.startMs) + '. Closes ' + fmtDateLong(s.closingMs) + ' (Swedish time)'
        : (closed ? 'Closed ' : 'Closes ') + fmtDateLong(s.closingMs) + ' (Swedish time)'
    );
    setText(ui.min, closed ? '-' : fmtAmount(s.minNextBid));
    setText(ui.ext, s.extensionMinutes || 5);
    renderCountdown();
    renderHistory(s.history);

    // Who is looking, and what can they do
    var canBid = !!app.me && s.status === 'open';
    ui.form.hidden = !canBid;
    ui.readonly.hidden = !!app.me || closed;
    ui.final.hidden = !closed;
    ui.you.hidden = !app.me;

    if (app.me) {
      var youText = 'Signed in as ' + app.me.firstName + '.';
      if (!closed && !upcoming && isHighBidder()) youText += ' You hold the highest bid.';
      if (upcoming) youText += ' Bidding has not opened yet. The bid form will appear here at the opening time.';
      setText(ui.you, youText);
      if (justOpened) showMessage('Bidding is now open.', 'info');
    }

    if (closed) {
      if (s.highBid === null || s.highBid === undefined) {
        setText(ui.finalText, 'Bidding has closed. No bids were placed.');
      } else {
        setText(ui.finalText, 'Bidding has closed. The final bid is ' + fmtAmount(s.highBid) + ', held by ' + s.highBidder + '.');
      }
      ui.confirm.hidden = true;
    }

    if (!app.me && !closed) {
      var note;
      if (app.codeProblem === 'revoked') {
        note = 'This invitation is no longer active. If you think this is a mistake, please reply to your invitation email.';
      } else if (app.codeProblem === 'invalid') {
        note = 'This code was not recognised. Please use the link from your invitation email, or reply to that email and I will help.';
      } else {
        note = 'Bidding is for invited people only. You can still follow along here.';
      }
      setText(ui.readonlyNote, note);
    }

    if (canBid) {
      ui.amount.setAttribute('placeholder', String(s.minNextBid));
      var holds = isHighBidder();
      ui.submit.disabled = app.busy || holds || !ui.confirm.hidden;
      ui.amount.disabled = app.busy || holds || !ui.confirm.hidden;
      setText(
        ui.hint,
        holds
          ? 'You hold the highest bid. You can bid again once someone else has bid.'
          : 'Whole kronor, moms included. The minimum is ' + fmtAmount(s.minNextBid) + '.'
      );
    }
  }

  function setLost(lost) {
    if (app.lost === lost) return;
    app.lost = lost;
    ui.banner.hidden = !lost;
  }

  /* ------------------------------------------------------------------ */
  /* Loading state and polling                                           */
  /* ------------------------------------------------------------------ */

  function applyState(state, t0, t1) {
    app.state = state;
    if (typeof state.serverTimeMs === 'number') {
      var mid = t0 !== undefined ? (t0 + t1) / 2 : Date.now();
      app.offsetMs = state.serverTimeMs - mid;
    }
  }

  function refresh() {
    if (polling) return Promise.resolve();
    polling = true;
    var t0 = Date.now();
    var request = DEMO ? Promise.resolve(demoState()) : apiGet({ action: 'state' });
    return request
      .then(function (state) {
        if (!state || !state.ok) throw new Error('bad state');
        applyState(state, t0, Date.now());
        setLost(false);
        render();
      })
      .catch(function () {
        setLost(true);
      })
      .then(function () {
        polling = false;
      });
  }

  function schedule() {
    clearTimeout(pollTimer);
    if (document.hidden) return;
    if (app.state && app.state.status === 'closed') return; // nothing more will change
    pollTimer = setTimeout(tick, POLL_MS);
  }

  function tick() {
    refresh()
      .then(function () {
        // If the code could not be checked earlier (for example a lost connection), try again.
        if (app.code && !app.me && !app.codeProblem && !app.lost) {
          return checkCode().then(render);
        }
      })
      .then(schedule);
  }

  function checkCode() {
    if (!app.code) return Promise.resolve();
    var request = DEMO ? Promise.resolve(demoWhoami(app.code)) : apiGet({ action: 'whoami', code: app.code });
    return request
      .then(function (w) {
        if (w && w.ok && w.valid) {
          app.me = { firstName: w.firstName, displayName: w.displayName, isHighBidder: !!w.isHighBidder };
          app.codeProblem = '';
        } else {
          app.me = null;
          app.codeProblem = w && w.reason === 'revoked' ? 'revoked' : 'invalid';
          try {
            sessionStorage.removeItem(STORAGE_KEY);
          } catch (e) {
            /* storage may be unavailable; nothing to do */
          }
        }
      })
      .catch(function () {
        // Could not check the code right now. Keep it and try again with the next poll.
        setLost(true);
      });
  }

  /* ------------------------------------------------------------------ */
  /* Placing a bid                                                       */
  /* ------------------------------------------------------------------ */

  function errorText(r) {
    switch (r && r.error) {
      case 'too_low':
        return 'That is below the minimum. The minimum bid is ' + fmtAmount(r.minimum) + '.';
      case 'already_high':
        return 'You already hold the highest bid. You can bid again once someone else has bid.';
      case 'closed':
        return 'Bidding has closed.';
      case 'not_open_yet':
        return 'Bidding has not opened yet.';
      case 'invalid_code':
        return 'This code was not recognised.';
      case 'revoked':
        return 'This invitation is no longer active.';
      case 'bad_amount':
        return 'Please enter a whole number of kronor, for example 1500.';
      case 'busy':
        return 'Several bids arrived at the same moment. Please try again in a few seconds.';
      default:
        return 'Something went wrong and the bid could not be confirmed. Please look at the bid history before trying again.';
    }
  }

  function parseAmount(raw) {
    var s = String(raw || '').replace(/\s/g, '');
    if (!s) return { error: 'Please enter an amount.' };
    if (!/^\d+$/.test(s)) return { error: 'Please use whole numbers only, for example 1500.' };
    if (s.length > 9) return { error: 'That amount is too large.' };
    return { value: parseInt(s, 10) };
  }

  function onSubmit(ev) {
    ev.preventDefault();
    if (app.busy || !app.state) return;
    showMessage('', '');
    var p = parseAmount(ui.amount.value);
    if (p.error) {
      showMessage(p.error, 'error');
      ui.amount.focus();
      return;
    }
    if (p.value < app.state.minNextBid) {
      showMessage('The minimum bid is ' + fmtAmount(app.state.minNextBid) + '.', 'error');
      ui.amount.focus();
      return;
    }
    app.pending = p.value;
    setText(ui.confirmText, 'You are about to bid ' + fmtAmount(p.value) + ', moms included. Every bid is binding and cannot be withdrawn.');
    ui.confirm.hidden = false;
    ui.amount.disabled = true;
    ui.submit.disabled = true;
    ui.confirmYes.focus();
  }

  function cancelConfirm() {
    app.pending = null;
    ui.confirm.hidden = true;
    ui.amount.disabled = false;
    ui.submit.disabled = false;
    render();
    ui.amount.focus();
  }

  function setBusy(busy) {
    app.busy = busy;
    ui.confirmYes.disabled = busy;
    ui.confirmNo.disabled = busy;
    ui.confirmYes.textContent = busy ? 'Sending...' : 'Confirm bid';
  }

  function confirmBid() {
    if (app.busy || app.pending === null) return;
    var amount = app.pending;
    setBusy(true);

    if (DEMO) {
      setTimeout(function () {
        setBusy(false);
        cancelConfirm();
        showMessage('Demo view: nothing was sent.', 'info');
      }, 400);
      return;
    }

    apiPostBid(app.code, amount)
      .then(function (r) {
        setBusy(false);
        app.pending = null;
        ui.confirm.hidden = true;
        ui.amount.disabled = false;
        ui.submit.disabled = false;
        if (r && r.ok) {
          applyState(r.state);
          ui.amount.value = '';
          var text = 'Your bid of ' + fmtAmount(amount) + ' is placed.';
          if (r.extended) text += ' The closing time moved forward by ' + (r.state.extensionMinutes || 5) + ' minutes.';
          showMessage(text, 'ok');
          render();
          ui.amount.focus();
        } else {
          showMessage(errorText(r), 'error');
          if (r && (r.error === 'invalid_code' || r.error === 'revoked')) {
            app.me = null;
            app.codeProblem = r.error === 'revoked' ? 'revoked' : 'invalid';
          }
          refresh();
        }
      })
      .catch(function () {
        setBusy(false);
        app.pending = null;
        ui.confirm.hidden = true;
        ui.amount.disabled = false;
        ui.submit.disabled = false;
        showMessage(errorText(null), 'error');
        refresh();
      });
  }

  /* ------------------------------------------------------------------ */
  /* Start                                                               */
  /* ------------------------------------------------------------------ */

  function readCode() {
    var fromUrl = '';
    try {
      fromUrl = normCode(new URLSearchParams(location.search).get('code'));
    } catch (e) {
      fromUrl = '';
    }
    var stored = '';
    try {
      stored = normCode(sessionStorage.getItem(STORAGE_KEY));
    } catch (e) {
      stored = '';
    }
    if (fromUrl) {
      try {
        sessionStorage.setItem(STORAGE_KEY, fromUrl);
      } catch (e) {
        /* private mode: the code stays in memory for this visit */
      }
      // Keep the personal code out of the address bar, screenshots and history.
      try {
        var clean = location.pathname + location.search.replace(/([?&])code=[^&]*&?/, '$1').replace(/[?&]$/, '') + location.hash;
        history.replaceState(null, '', clean);
      } catch (e) {
        /* not important */
      }
      return fromUrl;
    }
    return stored;
  }

  function init() {
    ui = {
      title: $('bid-title'),
      layout: document.querySelector('.bid-layout'),
      gallery: document.querySelector('.bid-gallery'),
      photo: $('bid-photo'),
      thumbs: $('bid-thumbs'),
      desc: $('bid-desc'),
      details: $('bid-details'),
      banner: $('bid-banner'),
      demo: $('bid-demo'),
      high: $('bid-high'),
      bidder: $('bid-bidder'),
      timeLabel: $('bid-time-label'),
      countdown: $('bid-countdown'),
      closing: $('bid-closing'),
      min: $('bid-min'),
      ext: $('bid-ext'),
      you: $('bid-you'),
      form: $('bid-form'),
      amount: $('bid-amount'),
      submit: $('bid-submit'),
      hint: $('bid-hint'),
      confirm: $('bid-confirm'),
      confirmText: $('bid-confirm-text'),
      confirmYes: $('bid-confirm-yes'),
      confirmNo: $('bid-confirm-no'),
      message: $('bid-message'),
      readonly: $('bid-readonly'),
      readonlyNote: $('bid-readonly-note'),
      signup: $('bid-signup'),
      final: $('bid-final'),
      finalText: $('bid-final-text'),
      history: $('bid-history'),
      noHistory: $('bid-no-history')
    };

    ui.signup.setAttribute('href', SIGNUP_FORM_URL);
    ui.photo.addEventListener('error', function () {
      ui.gallery.hidden = true;
      ui.layout.classList.remove('has-photo');
    });
    ui.demo.hidden = !DEMO;
    app.code = readCode();

    ui.form.addEventListener('submit', onSubmit);
    ui.confirmYes.addEventListener('click', confirmBid);
    ui.confirmNo.addEventListener('click', cancelConfirm);
    ui.confirm.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') cancelConfirm();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        clearTimeout(pollTimer);
      } else {
        refresh().then(schedule);
      }
    });

    setInterval(renderCountdown, 1000);

    checkCode()
      .then(refresh)
      .then(function () {
        render();
        schedule();
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
