/* ==========================================================================
   Enperfeitas invitation-only bidding page
   Plain JavaScript, no libraries. All rules are enforced by the Google Apps
   Script (apps-script/Code.gs). This file only shows what the script returns.
   ========================================================================== */

// Paste the web app URL from Google Apps Script here (it ends in /exec).
// While this is empty the page runs in demo mode and sends nothing.
var WEB_APP_URL = '';

// Link to the sign-up Google Form (placeholder).
var SIGNUP_FORM_URL = 'https://forms.gle/REPLACE-WITH-YOUR-FORM-LINK';

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
    closedHandled: false
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
    var closing = closed ? now - 3600000 : now + 2 * 3600000 + 14 * 60000;
    function iso(ms) {
      return new Date(ms).toISOString();
    }
    return {
      ok: true,
      pieceTitle: 'Demo piece (not a real auction)',
      openingBid: 1000,
      minStep: 100,
      minNextBid: 1900,
      highBid: 1800,
      highBidder: 'Mira',
      bidCount: 3,
      history: [
        { name: 'Mira', amount: 1800, time: iso(now - 12 * 60000) },
        { name: 'Jonas', amount: 1500, time: iso(now - 55 * 60000) },
        { name: 'Mira', amount: 1000, time: iso(now - 3 * 3600000) }
      ],
      closingTime: iso(closing),
      closingMs: closing,
      extensionMinutes: 5,
      status: closed ? 'closed' : 'open',
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
    var remaining = s.closingMs - nowServerMs();
    if (remaining <= 0) {
      setText(ui.countdown, 'Closing now');
      if (!app.closedHandled) {
        app.closedHandled = true;
        refresh();
      }
      return;
    }
    app.closedHandled = false;
    setText(ui.countdown, fmtCountdown(remaining));
  }

  function render() {
    var s = app.state;
    if (!s) return;
    var closed = s.status === 'closed';

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

    setText(ui.timeLabel, closed ? 'Bidding' : 'Time left');
    setText(ui.closing, (closed ? 'Closed ' : 'Closes ') + fmtDateLong(s.closingMs) + ' (Swedish time)');
    setText(ui.min, closed ? '-' : fmtAmount(s.minNextBid));
    setText(ui.ext, s.extensionMinutes || 5);
    renderCountdown();
    renderHistory(s.history);

    // Who is looking, and what can they do
    var canBid = !!app.me && !closed;
    ui.form.hidden = !canBid;
    ui.readonly.hidden = !!app.me || closed;
    ui.final.hidden = !closed;
    ui.you.hidden = !app.me;

    if (app.me) {
      var youText = 'Signed in as ' + app.me.firstName + '.';
      if (!closed && isHighBidder()) youText += ' You hold the highest bid.';
      setText(ui.you, youText);
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
