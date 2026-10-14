/**
 * Enperfeitas invitation-only bidding tool
 * Google Apps Script, bound to the Google Sheet (Extensions > Apps Script).
 *
 * This script is the only place where the bidding rules are enforced.
 * The web page only displays what this script returns.
 *
 * Sheet tabs (see SETUP.md):
 *   Invitees  the tab linked to the sign-up Google Form, plus three columns
 *             on the right headed: status, code, sent
 *   Bids      timestamp, code, display name, amount, void
 *   Config    key in column A, value in column B
 *
 * All amounts are whole SEK, moms included.
 */

var TZ = 'Europe/Stockholm';
var SHEET_INVITEES = 'Invitees';
var SHEET_BIDS = 'Bids';
var SHEET_CONFIG = 'Config';

// No 0, O, 1, I or L, so codes are easy to read out and type.
var CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
var CODE_LENGTH = 7;

var MAX_BID = 10000000;
var STATE_CACHE_SECONDS = 3;
var CACHE_KEY = 'public_state_v1';

/* ------------------------------------------------------------------ */
/* Menu                                                                */
/* ------------------------------------------------------------------ */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Invitations')
    .addItem('Generate codes', 'generateCodes')
    .addItem('Send invitations', 'sendInvitations')
    .addSeparator()
    .addItem('Close auction', 'closeAuction')
    .addItem('Reset test bids', 'resetTestBids')
    .addSeparator()
    .addItem('Create Bids and Config tabs (first time only)', 'createTabs')
    .addToUi();
}

/* ------------------------------------------------------------------ */
/* Web app entry points                                                */
/* ------------------------------------------------------------------ */

function doGet(e) {
  try {
    var action = e && e.parameter ? String(e.parameter.action || '') : '';
    if (action === 'state') {
      return json_(withServerTime_(getPublicStateCached_()));
    }
    if (action === 'whoami') {
      return json_(whoami_(e.parameter.code));
    }
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return json_({ ok: false, error: 'server_error' });
  }
}

function doPost(e) {
  try {
    var body = {};
    try {
      body = JSON.parse(e.postData && e.postData.contents ? e.postData.contents : '{}');
    } catch (parseErr) {
      return json_({ ok: false, error: 'bad_request' });
    }
    if (body.action === 'bid') {
      return json_(placeBid_(body.code, body.amount));
    }
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return json_({ ok: false, error: 'server_error' });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------------------ */
/* Reading the sheet                                                   */
/* ------------------------------------------------------------------ */

function getSheet_(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) {
    throw new Error('The tab "' + name + '" is missing. See SETUP.md.');
  }
  return sh;
}

function normKey_(s) {
  return String(s === null || s === undefined ? '' : s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function str_(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

// Photo names: lowercase letters, numbers and hyphens only. Spaces become hyphens.
// This keeps the value safe: it can only ever name a file in images/bidding.
function cleanPrefix_(v) {
  return str_(v).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 80);
}

// Text that may contain several lines (description, details).
function strMulti_(v) {
  return v === null || v === undefined ? '' : String(v).replace(/\r\n?/g, '\n').trim();
}

function toInt_(v, fallback) {
  if (typeof v === 'number' && isFinite(v)) return Math.floor(v);
  var s = str_(v).replace(/\s/g, '');
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  return fallback;
}

function toMs_(v) {
  if (v instanceof Date) {
    var t = v.getTime();
    return isNaN(t) ? null : t;
  }
  var s = str_(v);
  if (!s) return null;
  var ms = Date.parse(s);
  return isNaN(ms) ? null : ms;
}

function isTrue_(v) {
  if (v === true) return true;
  var s = str_(v).toLowerCase();
  return s === 'true' || s === 'yes' || s === '1';
}

function iso_(ms) {
  return ms === null || ms === undefined ? null : Utilities.formatDate(new Date(ms), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

// The start time only counts when it is set and comes before the closing time.
// If it is blank (or by mistake after the closing time), bidding is open from the start.
function effectiveStart_(cfg) {
  if (cfg.startMs === null) return null;
  if (cfg.closingMs !== null && cfg.startMs >= cfg.closingMs) return null;
  return cfg.startMs;
}

function readConfig_() {
  var values = getSheet_(SHEET_CONFIG).getDataRange().getValues();
  var cfg = {};
  for (var i = 0; i < values.length; i++) {
    var key = normKey_(values[i][0]);
    if (key) cfg[key] = values[i][1];
  }
  return {
    pieceTitle: str_(cfg.piece_title),
    openingBid: toInt_(cfg.opening_bid, 0),
    minStep: toInt_(cfg.min_step, 100),
    startMs: toMs_(cfg.start_time),
    closingMs: toMs_(cfg.closing_time),
    extensionMinutes: toInt_(cfg.extension_minutes, 5),
    status: str_(cfg.status).toLowerCase() || 'open',
    testMode: isTrue_(cfg.test_mode),
    baseUrl: str_(cfg.page_base_url),
    replyBy: str_(cfg.reply_by),
    photoPrefix: cleanPrefix_(cfg.photo_prefix),
    photoCount: toInt_(cfg.photo_count, null),
    photoAlt: str_(cfg.photo_alt),
    description: strMulti_(cfg.description),
    details: strMulti_(cfg.details)
  };
}

function writeConfigValue_(key, value, asText) {
  var sh = getSheet_(SHEET_CONFIG);
  var values = sh.getDataRange().getValues();
  for (var i = 0; i < values.length; i++) {
    if (normKey_(values[i][0]) === key) {
      var cell = sh.getRange(i + 1, 2);
      if (asText) cell.setNumberFormat('@');
      cell.setValue(value);
      return;
    }
  }
  var row = values.length + 1;
  sh.getRange(row, 1).setValue(key);
  var newCell = sh.getRange(row, 2);
  if (asText) newCell.setNumberFormat('@');
  newCell.setValue(value);
}

function findCol_(headers, exact, startsWith) {
  var i;
  for (i = 0; i < headers.length; i++) {
    if (exact.indexOf(headers[i]) !== -1) return i;
  }
  for (i = 0; i < headers.length; i++) {
    for (var j = 0; j < startsWith.length; j++) {
      if (headers[i].indexOf(startsWith[j]) === 0) return i;
    }
  }
  return -1;
}

/**
 * Reads the Invitees tab. Columns are found by their headings, so the order
 * of the Form questions does not matter.
 */
function readInvitees_() {
  var sh = getSheet_(SHEET_INVITEES);
  var data = sh.getDataRange().getValues();
  if (data.length < 1) throw new Error('The Invitees tab is empty.');
  var headers = data[0].map(normKey_);
  var cols = {
    first: findCol_(headers, ['first_name', 'firstname', 'first', 'name', 'fornamn'], ['first_name', 'first', 'name']),
    email: findCol_(headers, ['email', 'e_mail', 'email_address'], ['email', 'e_mail']),
    status: findCol_(headers, ['status'], []),
    code: findCol_(headers, ['code'], []),
    sent: findCol_(headers, ['sent'], [])
  };
  var missing = [];
  if (cols.first < 0) missing.push('first name');
  if (cols.email < 0) missing.push('email');
  if (cols.status < 0) missing.push('status');
  if (cols.code < 0) missing.push('code');
  if (cols.sent < 0) missing.push('sent');
  if (missing.length) {
    throw new Error('The Invitees tab needs columns headed: ' + missing.join(', ') + '.');
  }
  var rows = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var first = str_(row[cols.first]).split(/\s+/)[0];
    var status = str_(row[cols.status]).toLowerCase() || 'pending';
    rows.push({
      row: r + 1,
      first: first,
      email: str_(row[cols.email]),
      status: status,
      code: str_(row[cols.code]),
      sent: str_(row[cols.sent])
    });
  }
  return { sheet: sh, cols: cols, rows: rows };
}

function normCode_(s) {
  return String(s === null || s === undefined ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * First name only. If two different codes share a first name, a number is
 * added to tell them apart (Anna 1, Anna 2), in sheet order.
 */
function buildDisplayNames_(inviteeRows) {
  var byName = {};
  inviteeRows.forEach(function (p) {
    if (!p.code || !p.first) return;
    var k = p.first.toLowerCase();
    if (!byName[k]) byName[k] = [];
    byName[k].push(p);
  });
  var map = {};
  Object.keys(byName).forEach(function (k) {
    var list = byName[k];
    list.forEach(function (p, idx) {
      map[normCode_(p.code)] = list.length > 1 ? p.first + ' ' + (idx + 1) : p.first;
    });
  });
  return map;
}

function readBids_() {
  var sh = getSheet_(SHEET_BIDS);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var data = sh.getRange(2, 1, last - 1, 5).getValues();
  var bids = [];
  data.forEach(function (row) {
    var amount = toInt_(row[3], null);
    if (amount === null) return;
    if (isTrue_(row[4]) || str_(row[4]).toLowerCase() === 'void' || str_(row[4]).toLowerCase() === 'x') return;
    bids.push({
      ms: toMs_(row[0]),
      code: normCode_(row[1]),
      name: str_(row[2]),
      amount: amount
    });
  });
  return bids;
}

function highestBid_(bids) {
  var high = null;
  bids.forEach(function (b) {
    if (!high || b.amount > high.amount) high = b;
  });
  return high;
}

/* ------------------------------------------------------------------ */
/* Public state (never contains codes, emails or handles)              */
/* ------------------------------------------------------------------ */

function buildPublicState_() {
  var cfg = readConfig_();
  var bids = readBids_();
  var now = Date.now();
  var high = highestBid_(bids);
  var closed = cfg.status === 'closed' || cfg.closingMs === null || now >= cfg.closingMs;
  var startMs = effectiveStart_(cfg);
  var status = closed ? 'closed' : startMs !== null && now < startMs ? 'upcoming' : 'open';
  var history = bids
    .slice()
    .reverse()
    .map(function (b) {
      return { name: b.name, amount: b.amount, time: iso_(b.ms) };
    });
  return {
    ok: true,
    pieceTitle: cfg.pieceTitle,
    openingBid: cfg.openingBid,
    minStep: cfg.minStep,
    minNextBid: high ? high.amount + cfg.minStep : cfg.openingBid,
    highBid: high ? high.amount : null,
    highBidder: high ? high.name : null,
    bidCount: bids.length,
    history: history,
    closingTime: iso_(cfg.closingMs),
    closingMs: cfg.closingMs,
    extensionMinutes: cfg.extensionMinutes,
    status: status,
    startTime: iso_(startMs),
    startMs: startMs,
    photoPrefix: cfg.photoPrefix,
    photoCount: cfg.photoCount === null ? null : Math.max(0, Math.min(12, cfg.photoCount)),
    photoAlt: cfg.photoAlt.slice(0, 300),
    description: cfg.description.slice(0, 3000),
    details: cfg.details.slice(0, 1500)
  };
}

function getPublicStateCached_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(CACHE_KEY);
  if (hit) return JSON.parse(hit);
  var state = buildPublicState_();
  cache.put(CACHE_KEY, JSON.stringify(state), STATE_CACHE_SECONDS);
  return state;
}

function clearStateCache_() {
  CacheService.getScriptCache().remove(CACHE_KEY);
}

function withServerTime_(state) {
  var now = Date.now();
  var copy = JSON.parse(JSON.stringify(state));
  copy.serverTime = iso_(now);
  copy.serverTimeMs = now;
  // Status is recalculated so it is never a few seconds late near closing.
  if (copy.closingMs !== null && now >= copy.closingMs) copy.status = 'closed';
  else if (copy.status === 'upcoming' && copy.startMs !== null && now >= copy.startMs) copy.status = 'open';
  return copy;
}

/* ------------------------------------------------------------------ */
/* whoami                                                              */
/* ------------------------------------------------------------------ */

function findInvitee_(inviteeData, code) {
  var c = normCode_(code);
  if (!c) return null;
  for (var i = 0; i < inviteeData.rows.length; i++) {
    if (inviteeData.rows[i].code && normCode_(inviteeData.rows[i].code) === c) return inviteeData.rows[i];
  }
  return null;
}

function whoami_(code) {
  var data = readInvitees_();
  var me = findInvitee_(data, code);
  if (!me) return { ok: true, valid: false, reason: 'invalid' };
  if (me.status === 'revoked') return { ok: true, valid: false, reason: 'revoked' };
  if (me.status !== 'approved') return { ok: true, valid: false, reason: 'invalid' };
  var names = buildDisplayNames_(data.rows);
  var displayName = names[normCode_(me.code)] || me.first;
  var high = highestBid_(readBids_());
  return {
    ok: true,
    valid: true,
    firstName: me.first,
    displayName: displayName,
    isHighBidder: !!(high && high.code === normCode_(me.code))
  };
}

/* ------------------------------------------------------------------ */
/* Placing a bid                                                       */
/* ------------------------------------------------------------------ */

function fail_(error, extra) {
  var out = { ok: false, error: error };
  if (extra) {
    for (var k in extra) out[k] = extra[k];
  }
  return out;
}

function placeBid_(code, amountRaw) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return fail_('busy');
  try {
    var cfg = readConfig_();
    var data = readInvitees_();
    var me = findInvitee_(data, code);
    if (!me) return fail_('invalid_code');
    if (me.status === 'revoked') return fail_('revoked');
    if (me.status !== 'approved') return fail_('invalid_code');

    var now = Date.now();
    if (cfg.status === 'closed' || cfg.closingMs === null || now >= cfg.closingMs) {
      return fail_('closed');
    }
    var startMs = effectiveStart_(cfg);
    if (startMs !== null && now < startMs) {
      return fail_('not_open_yet', { startTime: iso_(startMs) });
    }

    var s = String(amountRaw === null || amountRaw === undefined ? '' : amountRaw).replace(/\s/g, '');
    if (!/^\d{1,9}$/.test(s)) return fail_('bad_amount');
    var amount = parseInt(s, 10);
    if (amount < 1 || amount > MAX_BID) return fail_('bad_amount');

    var myCode = normCode_(me.code);
    var bids = readBids_();
    var high = highestBid_(bids);
    if (high && high.code === myCode) return fail_('already_high');

    var minimum = high ? high.amount + cfg.minStep : cfg.openingBid;
    if (amount < minimum) return fail_('too_low', { minimum: minimum });

    var names = buildDisplayNames_(data.rows);
    var displayName = names[myCode] || me.first;

    var sh = getSheet_(SHEET_BIDS);
    var rowNumber = sh.getLastRow() + 1;
    var range = sh.getRange(rowNumber, 1, 1, 5);
    range.setNumberFormats([['yyyy-mm-dd hh:mm:ss', '@', '@', '0', '@']]);
    range.setValues([[new Date(now), me.code, displayName, amount, '']]);

    // Soft close: a bid in the last N minutes moves closing to bid time + N minutes.
    var windowMs = Math.max(0, cfg.extensionMinutes) * 60000;
    var extended = false;
    if (windowMs > 0 && cfg.closingMs - now <= windowMs) {
      writeConfigValue_('closing_time', iso_(now + windowMs), true);
      extended = true;
    }

    SpreadsheetApp.flush();
    clearStateCache_();
    var state = withServerTime_(buildPublicState_());
    return {
      ok: true,
      extended: extended,
      state: state,
      you: { displayName: displayName, isHighBidder: true }
    };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ */
/* Menu: Generate codes                                                */
/* ------------------------------------------------------------------ */

function randomCode_() {
  var u = Utilities.getUuid().replace(/-/g, '');
  var out = '';
  for (var i = 0; i < CODE_LENGTH; i++) {
    var n = parseInt(u.substr(i * 4, 4), 16);
    out += CODE_ALPHABET.charAt(n % CODE_ALPHABET.length);
  }
  return out;
}

function generateCodes() {
  var ui = SpreadsheetApp.getUi();
  var data = readInvitees_();
  var existing = {};
  data.rows.forEach(function (r) {
    if (r.code) existing[normCode_(r.code)] = true;
  });
  var made = 0;
  var skipped = 0;
  data.rows.forEach(function (r) {
    if (r.status !== 'approved' || r.code) return;
    if (!r.first || !r.email) {
      skipped++;
      return;
    }
    var c;
    do {
      c = randomCode_();
    } while (existing[c]);
    existing[c] = true;
    var cell = data.sheet.getRange(r.row, data.cols.code + 1);
    cell.setNumberFormat('@');
    cell.setValue(c);
    made++;
  });
  var msg = made + ' code(s) created.';
  if (skipped) msg += ' ' + skipped + ' approved row(s) were skipped because the first name or email is empty.';
  ui.alert('Generate codes', msg, ui.ButtonSet.OK);
}

/* ------------------------------------------------------------------ */
/* Menu: Send invitations                                              */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Invitation email                                                    */
/*                                                                     */
/* Two versions are sent in one message: a designed HTML version and a */
/* plain text version for mail apps that do not show HTML.             */
/* The wording lives in the three small functions right below, so you  */
/* can change a sentence without touching the layout code.             */
/* ------------------------------------------------------------------ */

// The steps shown under "How bidding works".
function invitationSteps_(cfg) {
  var ext = cfg.extensionMinutes;
  return [
    'Open your personal link.',
    'Look at the minimum bid shown, and enter a whole number of Swedish kronor. Amounts include moms.',
    'Check the amount and confirm. Every bid is binding and cannot be withdrawn while bidding is open.',
    'If a bid arrives in the last ' + ext + ' minutes, the closing time moves to ' + ext + ' minutes after that bid, so that everyone has a calm moment to answer.'
  ];
}

// The points shown under "If you win".
function invitationAfterWinning_() {
  return [
    'The winner is invoiced within 24 hours and pays within 48 hours.',
    'Shipping is added by location, or the piece can be collected at the studio in Stockholm.',
    'It is dispatched within 7 days of payment, and you have 14 days from delivery to withdraw from the purchase.'
  ];
}

// The sentence under the button.
var INVITATION_LINK_NOTE = 'The link is personal, so please keep it to yourself.';

function escapeHtml_(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtSek_(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' SEK';
}

// Everything both versions of the email need, worked out once.
function invitationFacts_(cfg, invitee) {
  var dateFormat = "EEEE d MMMM yyyy 'at' HH:mm";
  var startMs = effectiveStart_(cfg);
  var upcoming = startMs !== null && startMs > Date.now();
  return {
    first: invitee.first,
    title: cfg.pieceTitle,
    link: cfg.baseUrl + (cfg.baseUrl.indexOf('?') === -1 ? '?' : '&') + 'code=' + encodeURIComponent(invitee.code),
    upcoming: upcoming,
    opens: upcoming ? Utilities.formatDate(new Date(startMs), TZ, dateFormat) + ' Swedish time' : '',
    closes: Utilities.formatDate(new Date(cfg.closingMs), TZ, dateFormat) + ' Swedish time',
    openingBid: fmtSek_(cfg.openingBid) + ', moms included',
    steps: invitationSteps_(cfg),
    afterWinning: invitationAfterWinning_(),
    replyBy: cfg.replyBy
  };
}

// Plain text version. Short blocks with a blank line between them.
function buildInvitationBody_(cfg, invitee) {
  var f = invitationFacts_(cfg, invitee);
  var lines = [];
  lines.push('Hello ' + f.first + ',');
  lines.push('');
  lines.push('Thank you for signing up. You are invited to place bids on one piece:');
  lines.push(f.title);
  lines.push('');
  lines.push('YOUR PERSONAL LINK');
  lines.push(f.link);
  lines.push(INVITATION_LINK_NOTE);
  if (f.upcoming) lines.push('Until it opens, your link shows the piece but no bid form.');
  lines.push('');
  lines.push('THE DETAILS');
  if (f.upcoming) lines.push('Opens: ' + f.opens);
  lines.push('Closes: ' + f.closes);
  lines.push('Opening bid: ' + f.openingBid);
  lines.push('');
  lines.push('HOW BIDDING WORKS');
  f.steps.forEach(function (s, i) {
    lines.push((i + 1) + '. ' + s);
  });
  lines.push('');
  lines.push('IF YOU WIN');
  f.afterWinning.forEach(function (s) {
    lines.push('- ' + s);
  });
  if (f.replyBy) {
    lines.push('');
    lines.push('If you have not received this by ' + f.replyBy + ', reply to this email.');
  }
  lines.push('');
  lines.push('Warmly,');
  lines.push('Suzete');
  lines.push('Enperfeitas Studio');
  return lines.join('\n');
}

// Designed version. It follows the website: Roboto Slab headings and Roboto text
// (with Georgia and Arial as fallbacks), black on white, thin #e6e6e6 lines,
// the white pill button with a black outline, and the same spacing rhythm.
// It is built with tables and inline styles because that is what mail apps
// (Gmail, Outlook, Apple Mail) display reliably.
//
// Type scale, matching the website:
//   body 18px / 1.6      small text 15px / 1.5      labels 13px, uppercase
//   piece title 21px / 1.25    heading 20px / 1.25     main heading 32px / 1.12
// Spacing: steps of 8px (8, 16, 24, 32, 48). A heading sits closer to the text
// below it than to the text above it, so each block reads as one unit.
function buildInvitationHtml_(cfg, invitee, testNote) {
  var f = invitationFacts_(cfg, invitee);
  var e = escapeHtml_;
  var SLAB = "font-family:'Roboto Slab',Georgia,'Times New Roman',serif;font-weight:700;letter-spacing:-0.01em;";
  var SANS = "font-family:'Roboto',Arial,Helvetica,sans-serif;";
  var origin = cfg.baseUrl.replace(/^(https?:\/\/[^\/]+).*$/, '$1');
  if (!/^https?:\/\//.test(origin)) origin = 'https://enperfeitas.com';
  var logoUrl = origin + '/images/email/logo.png';
  var h = [];

  function cell(content, style) {
    h.push('<tr><td class="pad" style="padding:' + (style || '0 40px') + ';text-align:left;">' + content + '</td></tr>');
  }
  function h3(text) {
    return '<h3 style="' + SLAB + 'font-size:20px;line-height:1.25;margin:0 0 12px;color:#000000;">' + e(text) + '</h3>';
  }
  function list(tag, items) {
    return '<' + tag + ' style="margin:0;padding-left:24px;' + SANS + 'font-size:18px;line-height:1.6;color:#000000;">' +
      items.map(function (s) {
        return '<li style="margin:0 0 10px;padding-left:4px;">' + e(s) + '</li>';
      }).join('') + '</' + tag + '>';
  }

  h.push('<!doctype html><html lang="en"><head><meta charset="utf-8">');
  h.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  h.push('<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">');
  h.push('<title>' + e('Your invitation to bid: ' + f.title) + '</title>');
  // The site fonts, for mail apps that can load them (Apple Mail, iOS Mail). Others use the fallbacks.
  h.push('<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Roboto+Slab:wght@700&display=swap" rel="stylesheet">');
  h.push('<style>');
  h.push('.btn:hover{background-color:#954a1e !important;border-color:#954a1e !important;}');
  h.push('.btn:hover a{color:#ffffff !important;}');
  h.push('@media only screen and (max-width:520px){.pad{padding-left:22px !important;padding-right:22px !important;}.h1{font-size:28px !important;}.ptitle{font-size:19px !important;}}');
  h.push('</style></head>');
  h.push('<body style="margin:0;padding:0;background-color:#fafafa;' + SANS + 'font-size:18px;line-height:1.6;color:#000000;">');
  // Preview line shown next to the subject in the inbox (not visible in the email).
  h.push('<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#fafafa;">Your personal link to bid on ' + e(f.title) + '.</div>');
  h.push('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fafafa;"><tr><td align="center" style="padding:32px 12px;">');
  h.push('<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e6e6e6;border-radius:10px;">');

  // Logo, centred like the website header, with a thin line under it
  h.push('<tr><td align="center" style="padding:32px 40px 24px;border-bottom:1px solid #e6e6e6;">' +
         '<img src="' + e(logoUrl) + '" width="200" alt="Enperfeitas" style="display:block;width:200px;max-width:100%;height:auto;border:0;' + SLAB + 'font-size:28px;color:#000000;">' +
         '</td></tr>');

  if (testNote) {
    cell('<div style="margin:24px 0 0;padding:10px 16px;border-left:3px solid #954a1e;background-color:#fafafa;' + SANS + 'font-size:15px;line-height:1.5;color:#5a5a5a;">' + e(testNote) + '</div>', '0 40px');
  }

  // Kicker, main heading, greeting, the piece
  cell('<p style="margin:40px 0 8px;text-align:center;' + SANS + 'font-size:13px;line-height:1.4;letter-spacing:0.08em;text-transform:uppercase;color:#5a5a5a;">Invitation-only bidding</p>' +
       '<h1 class="h1" style="' + SLAB + 'font-size:32px;line-height:1.12;margin:0 0 24px;text-align:center;color:#000000;">You are invited to bid</h1>' +
       '<p style="margin:0 0 8px;' + SANS + 'font-size:18px;line-height:1.6;color:#000000;">Hello ' + e(f.first) + ',</p>' +
       '<p style="margin:0 0 16px;' + SANS + 'font-size:18px;line-height:1.6;color:#000000;">Thank you for signing up. You are invited to place bids on one piece:</p>' +
       '<p class="ptitle" style="' + SLAB + 'margin:0;font-size:21px;line-height:1.25;color:#000000;">' + e(f.title) + '</p>', '0 40px');

  // The button: white, black outline, pill shape, as on the website
  cell('<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr>' +
       '<td class="btn" align="center" bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #000000;border-radius:300px;">' +
       '<a href="' + e(f.link) + '" style="display:inline-block;padding:17px 38px;' + SANS + 'font-size:17px;font-weight:500;line-height:1.2;color:#000000;text-decoration:none;border-radius:300px;">Open your bidding page</a>' +
       '</td></tr></table>' +
       '<p style="margin:16px 0 0;text-align:center;' + SANS + 'font-size:15px;line-height:1.5;color:#5a5a5a;">' + e(INVITATION_LINK_NOTE) +
       (f.upcoming ? ' Until it opens, your link shows the piece but no bid form.' : '') + '</p>' +
       '<p style="margin:8px 0 0;text-align:center;' + SANS + 'font-size:14px;line-height:1.5;color:#5a5a5a;word-break:break-all;">If the button does not work, copy this address into your browser:<br>' + e(f.link) + '</p>',
       '32px 40px 0');

  // The facts, in the same style as the figures on the bidding page
  var facts = [];
  if (f.upcoming) facts.push(['Opens', f.opens]);
  facts.push(['Closes', f.closes]);
  facts.push(['Opening bid', f.openingBid]);
  var factRows = facts.map(function (x, i) {
    return '<tr><td style="padding:14px 0;' + (i < facts.length - 1 ? 'border-bottom:1px solid #e6e6e6;' : '') + 'text-align:left;">' +
      '<div style="' + SANS + 'font-size:13px;line-height:1.4;letter-spacing:0.08em;text-transform:uppercase;color:#5a5a5a;margin:0 0 4px;">' + e(x[0]) + '</div>' +
      '<div style="' + SANS + 'font-size:18px;line-height:1.5;font-weight:400;color:#000000;">' + e(x[1]) + '</div></td></tr>';
  }).join('');
  cell('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fafafa;border-radius:10px;"><tr><td style="padding:6px 24px;">' +
       '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' + factRows + '</table></td></tr></table>', '40px 40px 0');

  // How bidding works, and what happens if you win
  cell(h3('How bidding works') + list('ol', f.steps), '48px 40px 0');
  cell(h3('If you win') + list('ul', f.afterWinning), '32px 40px 0');

  // Reply line and sign-off
  var closing = '';
  if (f.replyBy) {
    closing += '<p style="margin:0 0 24px;' + SANS + 'font-size:18px;line-height:1.6;color:#000000;">If you have not received this by ' + e(f.replyBy) + ', reply to this email.</p>';
  }
  closing += '<p style="margin:0;' + SANS + 'font-size:18px;line-height:1.6;color:#000000;">Warmly,<br>' +
             '<span style="' + SLAB + 'font-size:20px;">Suzete</span><br>' +
             '<span style="font-size:16px;color:#5a5a5a;">Enperfeitas Studio</span></p>';
  cell(closing, '48px 40px 48px');

  // Footer
  h.push('<tr><td class="pad" style="padding:24px 40px 28px;border-top:1px solid #e6e6e6;text-align:left;' + SANS + 'font-size:13px;line-height:1.6;color:#5a5a5a;">' +
         'You are receiving this because you signed up for the bidding round at enperfeitas.com. If it reached you by mistake, please reply and let me know.</td></tr>');

  h.push('</table></td></tr></table></body></html>');
  return h.join('');
}

function sendInvitations() {
  var ui = SpreadsheetApp.getUi();
  var cfg = readConfig_();
  var data = readInvitees_();

  var problems = [];
  if (!cfg.pieceTitle) problems.push('piece_title');
  if (!cfg.baseUrl) problems.push('page_base_url');
  if (cfg.closingMs === null) problems.push('closing_time');
  if (problems.length) {
    ui.alert('Send invitations', 'Please fill in these Config values first: ' + problems.join(', ') + '.', ui.ButtonSet.OK);
    return;
  }

  var todo = data.rows.filter(function (r) {
    return r.status === 'approved' && r.code && !r.sent && r.email && r.first;
  });
  if (!todo.length) {
    ui.alert('Send invitations', 'Nothing to send. Approved rows with a code and an empty "sent" cell are sent.', ui.ButtonSet.OK);
    return;
  }

  var quota = MailApp.getRemainingDailyQuota();
  if (quota < todo.length) {
    ui.alert(
      'Send invitations',
      'Only ' + quota + ' email(s) can be sent today, but ' + todo.length + ' are waiting. ' +
        'Nothing was sent. Try again tomorrow, or send fewer by changing some rows to pending.',
      ui.ButtonSet.OK
    );
    return;
  }

  var testAddress = Session.getEffectiveUser().getEmail() || Session.getActiveUser().getEmail();
  if (cfg.testMode && !testAddress) {
    ui.alert('Send invitations', 'Test mode is on, but your own email address could not be found. Nothing was sent.', ui.ButtonSet.OK);
    return;
  }

  var question = cfg.testMode
    ? 'Test mode is ON. ' + todo.length + ' test email(s) will be sent to ' + testAddress + ' only. Nobody else receives anything. Continue?'
    : todo.length + ' invitation(s) will be sent to the invitees. Continue?';
  if (ui.alert('Send invitations', question, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  var sent = 0;
  var stoppedForQuota = false;
  for (var i = 0; i < todo.length; i++) {
    if (MailApp.getRemainingDailyQuota() < 1) {
      stoppedForQuota = true;
      break;
    }
    var p = todo[i];
    var subject = 'Your invitation to bid: ' + cfg.pieceTitle;
    var body = buildInvitationBody_(cfg, p);
    var testNote = '';
    if (cfg.testMode) {
      subject = '[TEST] ' + subject;
      testNote = 'TEST MODE. In the real round this would go to: ' + p.email;
      body = testNote + '\n\n' + body;
    }
    var htmlBody = buildInvitationHtml_(cfg, p, testNote);
    MailApp.sendEmail({
      to: cfg.testMode ? testAddress : p.email,
      subject: subject,
      body: body,
      htmlBody: htmlBody,
      name: 'Enperfeitas Studio'
    });
    if (!cfg.testMode) {
      var cell = data.sheet.getRange(p.row, data.cols.sent + 1);
      cell.setNumberFormat('@');
      cell.setValue(iso_(Date.now()));
    }
    sent++;
  }

  var msg = sent + ' email(s) sent' + (cfg.testMode ? ' to ' + testAddress + ' (test mode, "sent" cells left empty).' : '.');
  if (stoppedForQuota) msg += ' Stopped early because the daily email limit was reached. Run it again tomorrow for the rest.';
  ui.alert('Send invitations', msg, ui.ButtonSet.OK);
}

/* ------------------------------------------------------------------ */
/* Menu: Close auction, Reset test bids                                */
/* ------------------------------------------------------------------ */

function closeAuction() {
  var ui = SpreadsheetApp.getUi();
  if (ui.alert('Close auction', 'Close the auction now? No more bids will be accepted.', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  writeConfigValue_('status', 'closed', true);
  SpreadsheetApp.flush();
  clearStateCache_();
  ui.alert('Close auction', 'The auction is closed.', ui.ButtonSet.OK);
}

function resetTestBids() {
  var ui = SpreadsheetApp.getUi();
  var cfg = readConfig_();
  if (!cfg.testMode) {
    ui.alert('Reset test bids', 'This only works while test_mode is true in Config. Nothing was changed.', ui.ButtonSet.OK);
    return;
  }
  if (ui.alert('Reset test bids', 'Delete every row in the Bids tab? This cannot be undone.', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  var sh = getSheet_(SHEET_BIDS);
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, 5).clearContent();
  SpreadsheetApp.flush();
  clearStateCache_();
  ui.alert(
    'Reset test bids',
    'The Bids tab is empty again. If the test moved the closing time or closed the auction, set closing_time and status in Config again.',
    ui.ButtonSet.OK
  );
}

/* ------------------------------------------------------------------ */
/* Menu: first-time setup of the Bids and Config tabs                  */
/* ------------------------------------------------------------------ */

function createTabs() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var made = [];

  if (!ss.getSheetByName(SHEET_BIDS)) {
    var bids = ss.insertSheet(SHEET_BIDS);
    bids.getRange(1, 1, 1, 5).setValues([['timestamp', 'code', 'display name', 'amount', 'void']]);
    bids.getRange(1, 1, 1, 5).setFontWeight('bold');
    bids.getRange(2, 1, 998, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
    bids.getRange(2, 2, 998, 1).setNumberFormat('@');
    bids.setFrozenRows(1);
    made.push(SHEET_BIDS);
  }

  var configDefaults = [
    ['piece_title', 'Title of the piece'],
    ['opening_bid', 1000],
    ['min_step', 100],
    ['start_time', ''],
    ['closing_time', '2026-11-01T20:00:00+01:00'],
    ['extension_minutes', 5],
    ['status', 'open'],
    ['test_mode', 'TRUE'],
    ['page_base_url', 'https://enperfeitas.com/bidding.html'],
    ['reply_by', ''],
    ['photo_prefix', 'beige-jeand-de-g'],
    ['photo_count', 4],
    ['photo_alt', 'Beige linen book with a mustard leather spine'],
    ['description', 'Write two or three plain sentences about the piece here.'],
    ['details', 'Size: \nMaterials: \nMade: ']
  ];
  var existingConfig = ss.getSheetByName(SHEET_CONFIG);
  if (!existingConfig) {
    var cfg = ss.insertSheet(SHEET_CONFIG);
    cfg.getRange(1, 1, configDefaults.length, 1).setValues(configDefaults.map(function (r) { return [r[0]]; }));
    cfg.getRange(1, 2, configDefaults.length, 1).setNumberFormat('@');
    cfg.getRange(1, 2, configDefaults.length, 1).setValues(configDefaults.map(function (r) { return [r[1]]; }));
    cfg.getRange(1, 1, configDefaults.length, 1).setFontWeight('bold');
    cfg.setColumnWidth(1, 180);
    cfg.setColumnWidth(2, 340);
    made.push(SHEET_CONFIG);
  } else {
    // The tab already exists: only add rows that are missing, never change existing values.
    var have = {};
    existingConfig.getDataRange().getValues().forEach(function (row) {
      var k = normKey_(row[0]);
      if (k) have[k] = true;
    });
    var added = [];
    configDefaults.forEach(function (r) {
      if (!have[r[0]]) {
        var rowNo = existingConfig.getLastRow() + 1;
        existingConfig.getRange(rowNo, 1).setValue(r[0]).setFontWeight('bold');
        var cell = existingConfig.getRange(rowNo, 2);
        cell.setNumberFormat('@');
        cell.setValue(r[1]);
        added.push(r[0]);
      }
    });
    if (added.length) made.push('new Config rows (' + added.join(', ') + ')');
  }
  ui.alert(
    'Create tabs',
    made.length ? 'Created or added: ' + made.join(', ') + '. Now fill in the Config values.' : 'Both tabs already exist and are complete. Nothing was changed.',
    ui.ButtonSet.OK
  );
}
