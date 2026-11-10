/**
 * Enperfeitas invitation-only bidding tool
 * Google Apps Script, bound to the Google Sheet (Extensions > Apps Script).
 *
 * This script is the only place where the bidding rules are enforced.
 * The web page only displays what this script returns.
 *
 * Sheet tabs (see SETUP.md):
 *   Invitees  the tab linked to the sign-up Google Form, plus the columns
 *             status, code and sent. Other columns (reminded, asked, answered,
 *             delivery note, payment requested, paid, dispatched) are added
 *             automatically the first time they are needed.
 *   Bids      timestamp, code, display name, amount, void
 *   Config    key in column A, value in column B
 *
 * All amounts are whole SEK, moms included.
 *
 * How this file is organised, top to bottom:
 *   1. Settings and the Invitations menu
 *   2. Web app entry points (what the bidding page and the answer page call)
 *   3. Reading and writing the Sheet
 *   4. The public bidding state, whoami and placing a bid
 *   5. Generate codes
 *   6. Emails: wording, one layout, one sending routine
 *   7. Menu actions: invitations, reminders, winner, payment, dispatch, rounds
 *   8. Close auction, reset test bids, first-time setup
 */

var TZ = 'Europe/Stockholm';
var SHEET_INVITEES = 'Invitees';
var SHEET_BIDS = 'Bids';
var SHEET_CONFIG = 'Config';

// The values of the "status" column on the Invitees tab.
var STATUS = {
  PENDING: 'pending',          // new sign-up waiting for you to approve (also an empty cell)
  APPROVED: 'approved',        // invited to bid in the current round
  REVOKED: 'revoked',          // blocked by you
  RETURNING: 'returning',      // took part before, paused until they answer
  DECLINED: 'declined',        // answered "not this round"
  UNSUBSCRIBED: 'unsubscribed' // answered "remove me from the list"
};

// Columns the script adds to the Invitees tab when it first needs them.
var COL = {
  REMINDED: 'reminded',
  ASKED: 'asked',
  ANSWERED: 'answered',
  DELIVERY_NOTE: 'delivery note',
  PAYMENT_REQUESTED: 'payment requested',
  PAID: 'paid',
  DISPATCHED: 'dispatched'
};
// Added together when the real winner email is sent.
var ORDER_COLUMNS = [COL.DELIVERY_NOTE, COL.PAYMENT_REQUESTED, COL.PAID, COL.DISPATCHED];
// Belong to one round only. Emptied when a new round starts.
var ROUND_COLUMNS = [COL.REMINDED].concat(ORDER_COLUMNS, [COL.ASKED, COL.ANSWERED]);

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
    .addItem('Send reminders', 'sendReminders')
    .addSeparator()
    .addItem('Close auction', 'closeAuction')
    .addItem('Send winner email', 'sendWinnerEmail')
    .addItem('Send payment details', 'sendPaymentDetails')
    .addItem('Send dispatch email', 'sendDispatchEmail')
    .addSeparator()
    .addItem('Start new round', 'startNewRound')
    .addItem('Ask previous participants', 'askPreviousParticipants')
    .addSeparator()
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
    if (action === 'roundinfo') {
      return json_(roundInfo_(e.parameter.code));
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
    if (body.action === 'respond') {
      return json_(respondToRound_(body.code, body.answer));
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
    details: strMulti_(cfg.details),
    winnerEmailed: str_(cfg.winner_emailed),
    roundStarted: str_(cfg.round_started),
    paymentLink: /^https:\/\//i.test(str_(cfg.payment_link)) ? str_(cfg.payment_link) : '',
    paymentLinkNoShipping: /^https:\/\//i.test(str_(cfg.payment_link_no_shipping)) ? str_(cfg.payment_link_no_shipping) : ''
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
    var status = str_(row[cols.status]).toLowerCase() || STATUS.PENDING;
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

/* ---- Extra columns on the Invitees tab (added when first needed) ---- */

// Finds each named column, adding any that are missing to the right of the table.
// Returns { name: zero-based column index }. The headings are read once.
function ensureColumns_(sheet, names) {
  var lastCol = Math.max(1, sheet.getLastColumn());
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(normKey_);
  var out = {};
  names.forEach(function (name) {
    var i = headers.indexOf(normKey_(name));
    if (i < 0) {
      sheet.getRange(1, headers.length + 1).setValue(name).setFontWeight('bold');
      headers.push(normKey_(name));
      i = headers.length - 1;
    }
    out[name] = i;
  });
  return out;
}

function ensureColumn_(sheet, name) {
  return ensureColumns_(sheet, [name])[name];
}

// Values of extra columns by sheet row, for the columns that exist:
// { row: { 'asked': '...', ... } }. A column that does not exist yet reads as empty.
function readExtraCols_(sheet, names) {
  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(normKey_);
  var idx = {};
  names.forEach(function (n) {
    var i = headers.indexOf(normKey_(n));
    if (i >= 0) idx[n] = i;
  });
  var out = {};
  for (var r = 1; r < values.length; r++) {
    var rec = {};
    names.forEach(function (n) {
      rec[n] = n in idx ? str_(values[r][idx[n]]) : '';
    });
    out[r + 1] = rec;
  }
  return out;
}

// Writes text into one cell. The cell is set to plain text first, so a value
// like 2026-11-09T10:00:00 stays exactly as written and is not turned into a date.
function setCell_(sheet, row, colIndex, value) {
  var cell = sheet.getRange(row, colIndex + 1);
  cell.setNumberFormat('@');
  cell.setValue(value);
}

// A small question box. Returns the trimmed text, or null if cancelled.
function askText_(ui, title, text) {
  var r = ui.prompt(title, text, ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return null;
  return str_(r.getResponseText());
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

// cfg and bids can be passed in by a caller that has just read them (placeBid_ does),
// so the Sheet is not read a second time.
function buildPublicState_(cfg, bids) {
  cfg = cfg || readConfig_();
  bids = bids || readBids_();
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
  if (me.status === STATUS.REVOKED) return { ok: true, valid: false, reason: 'revoked' };
  if (me.status !== STATUS.APPROVED) return { ok: true, valid: false, reason: 'invalid' };
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
    if (me.status === STATUS.REVOKED) return fail_('revoked');
    if (me.status !== STATUS.APPROVED) return fail_('invalid_code');

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
      cfg.closingMs = toMs_(iso_(now + windowMs));   // as the Sheet now holds it (whole seconds)
      extended = true;
    }

    SpreadsheetApp.flush();
    clearStateCache_();
    // Built from what was just read plus this bid, instead of reading the Sheet again.
    bids.push({ ms: now, code: myCode, name: displayName, amount: amount });
    var state = withServerTime_(buildPublicState_(cfg, bids));
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
  runMenu_('Generate codes', function () {
    var ui = SpreadsheetApp.getUi();
    var data = readInvitees_();
    var existing = {};
    data.rows.forEach(function (r) {
      if (r.code) existing[normCode_(r.code)] = true;
    });
    var made = 0;
    var skipped = 0;
    data.rows.forEach(function (r) {
      if (r.status !== STATUS.APPROVED || r.code) return;
      if (!r.first || !r.email) {
        skipped++;
        return;
      }
      var c;
      do {
        c = randomCode_();
      } while (existing[c]);
      existing[c] = true;
      setCell_(data.sheet, r.row, data.cols.code, c);
      made++;
    });
    var msg = made + ' code(s) created.';
    if (skipped) msg += ' ' + skipped + ' approved row(s) were skipped because the first name or email is empty.';
    ui.alert('Generate codes', msg, ui.ButtonSet.OK);
  });
}

/* ================================================================== */
/* EMAILS                                                              */
/*                                                                     */
/* Every email the script sends (invitation, reminder, winner,         */
/* payment, collection, dispatch, "will you join the next round") is   */
/* built the same way:                                                 */
/*   1. a small function describes it as a "notice": the wording and   */
/*      the order of its blocks (facts, button, steps, text);          */
/*   2. one layout function turns any notice into the designed HTML    */
/*      version and the plain text version.                            */
/* To change a sentence, edit the wording lines below. The layout code */
/* never needs to change for that.                                     */
/* ================================================================== */

/* ---- Wording ------------------------------------------------------ */

var SENDER_NAME = 'Enperfeitas Studio';

// Invitation
function invitationSteps_(cfg) {
  var ext = cfg.extensionMinutes;
  return [
    'Open your personal link.',
    'Look at the minimum bid shown, and enter a whole number of Swedish kronor. Amounts include moms.',
    'Check the amount and confirm. Every bid is binding and cannot be withdrawn while bidding is open.',
    'If a bid arrives in the last ' + ext + ' minutes, the closing time moves to ' + ext + ' minutes after that bid, so that everyone has a calm moment to answer.'
  ];
}

function invitationAfterWinning_() {
  return [
    'After bidding closes, the winner is emailed and replies with whether the piece should be shipped or collected. The payment details then follow, and payment is due within 48 hours of receiving them.',
    'Shipping is added by location, or the piece can be collected at the studio in Stockholm with no shipping cost.',
    'It is dispatched within 7 days of payment, and you have 14 days from delivery to withdraw from the purchase.'
  ];
}

var INVITATION_LINK_NOTE = 'The link is personal, so please keep it to yourself.';
var INVITATION_UPCOMING_NOTE = ' Until it opens, your link shows the piece but no bid form.';
var INVITATION_FOOTER = 'You are receiving this because you signed up for the bidding round at enperfeitas.com. If it reached you by mistake, please reply and let me know.';

// Reminder
var REMINDER_SUBJECT = 'Reminder: ';              // followed by the piece title
var REMINDER_LABEL = 'A gentle reminder';         // small line above the heading
var REMINDER_HEADING = 'A reminder about the bidding';
var REMINDER_INTRO_OPEN = 'A small reminder that bidding is open on this piece:';
var REMINDER_INTRO_UPCOMING = 'A small reminder about this piece. Bidding has not opened yet:';
var REMINDER_ALREADY_BID = 'If you have already placed a bid, thank you. You can see how it stands on your personal page.';
var REMINDER_WINNING_NOTE = 'What happens if you win is in your first email, and the rules are at the bottom of the bidding page.';
var REMINDER_QUESTIONS = 'If you have any questions, just reply to this email.';

// Winner
var WINNER_SUBJECT = 'You won: ';                 // followed by the piece title
var WINNER_LABEL = 'Bidding has closed';
var WINNER_HEADING = 'Congratulations, you won';
var WINNER_INTRO = 'Bidding has closed, and yours was the highest bid. The piece is yours:';
var WINNER_NEXT_HEADING = 'What happens next';
var WINNER_THANKS = 'Thank you for taking part.';
var WINNER_QUESTIONS = 'If you have any questions, just reply to this email.';
var WINNER_FOOTER = 'You are receiving this because you placed the winning bid in the bidding round at enperfeitas.com. If it reached you by mistake, please reply and let me know.';
var WINNER_PAY_BUTTON = 'Pay securely online';
var WINNER_PAY_NOTE = 'The link works for any amount, so please enter the amount shown above.';

// The winner email has no payment link: the winner first replies with shipping or
// collection, and the payment details follow in a second email.
function winnerSteps_() {
  return [
    'Please reply to this email and tell me if you would like the piece shipped (with your delivery address) or collected at the studio in Stockholm. Shipping is added by location.',
    'I will then send you the payment details, with the shipping cost if the piece is shipped. Payment is due within 48 hours of receiving them.',
    'The piece is dispatched within 7 days of payment, and you have 14 days from delivery to withdraw from the purchase.'
  ];
}

// Shipping and payment
var PAYMENT_SUBJECT = 'Shipping and payment: ';   // followed by the piece title
var PAYMENT_LABEL = 'Shipping and payment';
var PAYMENT_HEADING = 'Shipping for your piece';
var PAYMENT_INTRO = 'Thank you for your delivery details. Here is the shipping cost for your piece:';
var PAYMENT_NOTE = 'If you have already paid your winning bid, please pay only the shipping amount. If not, you can pay the total in one go, or the two amounts separately.';
var PAYMENT_NOTE_INVOICE = 'I will send you an invoice for the shipping amount, or for the total if your winning bid has not been paid yet.';
var PAYMENT_STEPS = [
  'Once the payment has arrived, I will dispatch the piece within 7 days.',
  'I will email you the tracking details when it is on its way.'
];

// Collection at the studio (no shipping)
var COLLECT_SUBJECT = 'Collection and payment: ';  // followed by the piece title
var COLLECT_LABEL = 'Collection and payment';
var COLLECT_HEADING = 'Collecting your piece';
var COLLECT_INTRO = 'Thank you for letting me know. The piece will be ready for you to collect at the studio in Stockholm:';
var COLLECT_NOTE = 'There is no shipping cost. If you have not already paid your winning bid, please do so with the link below.';
var COLLECT_NOTE_INVOICE = 'There is no shipping cost. I will send you an invoice for your winning bid if you have not already paid it.';
var COLLECT_STEPS = [
  'Once the payment has arrived, I will contact you to agree a time to collect the piece.',
  'You have 14 days from the day you receive it to withdraw from the purchase.'
];

// Dispatch
var DISPATCH_SUBJECT = 'On its way: ';            // followed by the piece title
var DISPATCH_LABEL = 'Dispatched';
var DISPATCH_HEADING = 'Your piece is on its way';
var DISPATCH_INTRO = 'Your piece has been dispatched:';
var DISPATCH_NOTE = 'You have 14 days from delivery to withdraw from the purchase. Please let me know when the piece has arrived safely.';

// Asking previous participants, and the gentle nudge
var ASK_SUBJECT = 'Would you like to join the next round?';
var ASK_LABEL = 'A new round';
var ASK_HEADING = 'Will you join the next round?';
var ASK_INTRO = 'A new round of bidding is coming. You took part in the last one, and I would love for you to join again. Would you like to be invited?';
var ASK_PARAS = [
  'If you say yes, I will email you an invitation before bidding opens, with a preview of the piece and how bidding works.',
  'If you would rather skip this one, or not hear from me about bidding again, that is fine too. There is a choice for each on the page.',
  'If you do not answer, I will not send you anything about this round.'
];
var ASK_BUTTON = 'Tell me your answer';
var ASK_BUTTON_NOTE = 'Your personal link. It opens a page with three choices: yes, not this round, or remove me from the list.';
var ASK_FOOTER = 'You are receiving this because you took part in an earlier bidding round at enperfeitas.com. I will not send you anything about this round unless you say yes.';
var NUDGE_SUBJECT = 'A gentle reminder: would you like to join the next round?';
var NUDGE_LABEL = 'A gentle reminder';
var NUDGE_HEADING = 'Still thinking about the next round?';
var NUDGE_INTRO = 'A small reminder about the new round of bidding. I have not heard from you yet, and that is perfectly fine. Would you like to be invited?';

/* ---- Small helpers ------------------------------------------------ */

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

function originOf_(cfg) {
  var origin = cfg.baseUrl.replace(/^(https?:\/\/[^\/]+).*$/, '$1');
  return /^https?:\/\//.test(origin) ? origin : 'https://enperfeitas.com';
}

// Everything the bidding emails need about the piece and the dates, worked out once.
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

/* ---- Notices: what each email says -------------------------------- */
/*                                                                     */
/* A notice is { subject, label, heading, intro, piece, blocks,        */
/* closing, footer, preview }. Blocks, in the order they appear:       */
/*   { k:'facts',   rows:[[label, value]] }                            */
/*   { k:'button',  text, link, label, note, center }                  */
/*   { k:'section', heading, items, ordered }                          */
/*   { k:'text',    paras:[{ text, small }] }                          */
/* Any block can carry gap: the space above it, as CSS padding.        */

function invitationBlocks_(f) {
  var facts = [];
  if (f.upcoming) facts.push(['Opens', f.opens]);
  facts.push(['Closes', f.closes]);
  facts.push(['Opening bid', f.openingBid]);
  return {
    button: { k: 'button', text: 'Open your bidding page', link: f.link, label: 'YOUR PERSONAL LINK', note: INVITATION_LINK_NOTE + (f.upcoming ? INVITATION_UPCOMING_NOTE : '') },
    facts: { k: 'facts', rows: facts },
    how: { k: 'section', heading: 'How bidding works', items: f.steps, ordered: true }
  };
}

function invitationNotice_(cfg, p) {
  var f = invitationFacts_(cfg, p);
  var b = invitationBlocks_(f);
  return {
    subject: 'Your invitation to bid: ' + f.title,
    label: 'Invitation-only bidding',
    heading: 'You are invited to bid',
    intro: 'Thank you for signing up. You are invited to place bids on one piece:',
    piece: f.title,
    blocks: [b.button, b.facts, b.how, { k: 'section', heading: 'If you win', items: f.afterWinning, ordered: false, gap: '24px 32px 0' }],
    closing: f.replyBy ? 'If you have not received this by ' + f.replyBy + ', reply to this email.' : '',
    footer: INVITATION_FOOTER,
    preview: 'Your personal link to bid on ' + f.title + '.'
  };
}

function reminderNotice_(cfg, p) {
  var f = invitationFacts_(cfg, p);
  var b = invitationBlocks_(f);
  return {
    subject: REMINDER_SUBJECT + f.title,
    label: REMINDER_LABEL,
    heading: REMINDER_HEADING,
    intro: f.upcoming ? REMINDER_INTRO_UPCOMING : REMINDER_INTRO_OPEN,
    piece: f.title,
    blocks: [b.button, b.facts, b.how, { k: 'text', paras: [{ text: REMINDER_ALREADY_BID }, { text: REMINDER_WINNING_NOTE, small: true }] }],
    closing: REMINDER_QUESTIONS,
    footer: INVITATION_FOOTER,
    preview: 'A reminder about ' + f.title + '. Bidding closes ' + f.closes + '.'
  };
}

// w.amount is the winning bid in SEK.
function winnerNotice_(cfg, w) {
  var f = invitationFacts_(cfg, w);
  return {
    subject: WINNER_SUBJECT + f.title,
    label: WINNER_LABEL,
    heading: WINNER_HEADING,
    intro: WINNER_INTRO,
    piece: f.title,
    blocks: [
      { k: 'facts', rows: [['Your winning bid', fmtSek_(w.amount) + ', moms included'], ['Closed', f.closes]] },
      { k: 'section', heading: WINNER_NEXT_HEADING, items: winnerSteps_(), ordered: true }
    ],
    closing: WINNER_THANKS + ' ' + WINNER_QUESTIONS,
    footer: WINNER_FOOTER,
    preview: 'Your bid won ' + f.title + '. Here is what happens next.'
  };
}

// shipping = 0 means the winner collects the piece. link may be empty (then an invoice follows).
function paymentNotice_(cfg, w, shipping, link) {
  var collect = shipping === 0;
  var rows = collect
    ? [['Your winning bid', fmtSek_(w.amount) + ', moms included']]
    : [
        ['Shipping', fmtSek_(shipping) + ', moms included'],
        ['Your winning bid', fmtSek_(w.amount) + ', moms included'],
        ['Total with your bid', fmtSek_(w.amount + shipping) + ', moms included']
      ];
  var note = collect ? (link ? COLLECT_NOTE : COLLECT_NOTE_INVOICE) : (link ? PAYMENT_NOTE : PAYMENT_NOTE_INVOICE);
  var blocks = [{ k: 'facts', rows: rows }, { k: 'text', paras: [{ text: note }] }];
  if (link) blocks.push({ k: 'button', text: WINNER_PAY_BUTTON, link: link, label: 'PAYMENT LINK', note: WINNER_PAY_NOTE, center: true });
  blocks.push({ k: 'section', heading: WINNER_NEXT_HEADING, items: collect ? COLLECT_STEPS : PAYMENT_STEPS, ordered: true });
  return {
    subject: (collect ? COLLECT_SUBJECT : PAYMENT_SUBJECT) + cfg.pieceTitle,
    label: collect ? COLLECT_LABEL : PAYMENT_LABEL,
    heading: collect ? COLLECT_HEADING : PAYMENT_HEADING,
    intro: collect ? COLLECT_INTRO : PAYMENT_INTRO,
    piece: cfg.pieceTitle,
    blocks: blocks,
    closing: WINNER_QUESTIONS,
    footer: WINNER_FOOTER,
    preview: collect ? 'Collecting ' + cfg.pieceTitle + ' and how to pay.' : 'The shipping cost for ' + cfg.pieceTitle + ' and how to pay.'
  };
}

function dispatchNotice_(cfg, tracking) {
  var rows = [['Dispatched', Utilities.formatDate(new Date(), TZ, 'EEEE d MMMM yyyy')]];
  if (tracking) rows.push(['Tracking', tracking]);
  return {
    subject: DISPATCH_SUBJECT + cfg.pieceTitle,
    label: DISPATCH_LABEL,
    heading: DISPATCH_HEADING,
    intro: DISPATCH_INTRO,
    piece: cfg.pieceTitle,
    blocks: [{ k: 'facts', rows: rows }, { k: 'text', paras: [{ text: DISPATCH_NOTE }] }],
    closing: WINNER_QUESTIONS,
    footer: WINNER_FOOTER,
    preview: cfg.pieceTitle + ' has been dispatched.'
  };
}

function askNotice_(cfg, p, nudge) {
  var blocks = ASK_PARAS.map(function (t) {
    return { k: 'text', paras: [{ text: t }] };
  });
  blocks.push({ k: 'button', text: ASK_BUTTON, link: originOf_(cfg) + '/join-round.html?code=' + encodeURIComponent(p.code), label: 'YOUR PERSONAL LINK', note: ASK_BUTTON_NOTE, center: true });
  return {
    subject: nudge ? NUDGE_SUBJECT : ASK_SUBJECT,
    label: nudge ? NUDGE_LABEL : ASK_LABEL,
    heading: nudge ? NUDGE_HEADING : ASK_HEADING,
    intro: nudge ? NUDGE_INTRO : ASK_INTRO,
    piece: '',
    blocks: blocks,
    closing: WINNER_QUESTIONS,
    footer: ASK_FOOTER,
    preview: 'Would you like to be invited to the next round of bidding?'
  };
}

/* ---- Layout: one notice in, HTML and plain text out --------------- */

// Plain text version. Short blocks with a blank line between them.
function renderPlain_(first, n) {
  var L = ['Hello ' + first + ',', '', n.intro];
  if (n.piece) L.push(n.piece);
  L.push('');
  n.blocks.forEach(function (b) {
    if (b.k === 'facts') {
      L.push('THE DETAILS');
      b.rows.forEach(function (r) { L.push(r[0] + ': ' + r[1]); });
    } else if (b.k === 'button') {
      L.push(b.label);
      L.push(b.link);
      if (b.note) L.push(b.note);
    } else if (b.k === 'section') {
      L.push(b.heading.toUpperCase());
      b.items.forEach(function (it, i) { L.push((b.ordered ? (i + 1) + '. ' : '- ') + it); });
    } else if (b.k === 'text') {
      b.paras.forEach(function (p) { L.push(p.text); });
    }
    L.push('');
  });
  if (n.closing) {
    L.push(n.closing);
    L.push('');
  }
  L.push('Warmly,', 'Suzete', SENDER_NAME);
  return L.join('\n');
}

// Shown only in the test banner, so you can tell which layout your Sheet is running.
var EMAIL_DESIGN_VERSION = '8';

// Designed version. It follows the website as closely as an email can: Roboto
// Slab headings and Roboto text, black on white, thin #e6e6e6 lines, the white
// pill button with a black outline, and the same spacing rhythm.
//
// The website is the base: the same fonts (Roboto Slab for headings, Roboto for
// text, with the website's own fallbacks), the same colours, the same pill
// button and the same floating white card.
//
// About fonts: mail apps only show fonts they can load. Apple Mail and iOS Mail
// load Roboto Slab and Roboto from Google Fonts, exactly as on the website.
// Gmail and Outlook cannot, so they use the next font in the list that exists
// on the reader's device (Georgia for headings, Arial for text, which is what
// the website falls back to too). That is a limit of email, not of this design.
//
// Type scale (px), the website's text size on a phone:
//   text 15 / 1.6      small 13 / 1.5      labels 12, uppercase
//   piece name 18 / 1.3     section heading 18 / 1.3     main heading 26 / 1.15
// Spacing: steps of 8px (8, 16, 24, 32). A heading sits closer to the text
// below it than to the text above it, so each block reads as one unit.
function renderHtml_(cfg, first, n, testNote) {
  var e = escapeHtml_;
  var SLAB = "font-family:'Roboto Slab',Georgia,serif;font-weight:700;letter-spacing:-0.01em;";
  var SANS = "font-family:'Roboto',Arial,Helvetica,sans-serif;";
  var logoUrl = originOf_(cfg) + '/images/email/logo.png';
  var h = [];

  function cell(content, padding) {
    h.push('<tr><td class="pad" style="padding:' + (padding || '0 32px') + ';text-align:left;">' + content + '</td></tr>');
  }

  h.push('<!doctype html><html lang="en"><head><meta charset="utf-8">');
  h.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  h.push('<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">');
  h.push('<title>' + e(n.subject) + '</title>');
  // The site fonts, for mail apps that can load them (Apple Mail, iOS Mail). Others use the fallbacks.
  h.push('<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Roboto+Slab:wght@700&display=swap" rel="stylesheet">');
  h.push('<style>');
  h.push('.btn:hover{background-color:#954a1e !important;border-color:#954a1e !important;}');
  h.push('.btn:hover a{color:#ffffff !important;}');
  h.push('@media only screen and (max-width:520px){.pad{padding-left:20px !important;padding-right:20px !important;}.h1{font-size:24px !important;}.ptitle{font-size:17px !important;}}');
  h.push('</style></head>');
  h.push('<body style="margin:0;padding:0;background-color:#ffffff;' + SANS + 'font-size:15px;line-height:1.6;color:#000000;">');
  // Preview line shown next to the subject in the inbox (not visible in the email).
  h.push('<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#ffffff;">' + e(n.preview) + '</div>');
  h.push('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;"><tr><td align="center" style="padding:24px 12px;">');
  h.push('<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background-color:#ffffff;border:1px solid #e6e6e6;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,0.08);">');

  // Logo, centred like the website header, with a thin line under it
  h.push('<tr><td align="center" style="padding:24px 32px 20px;border-bottom:1px solid #e6e6e6;">' +
         '<img src="' + e(logoUrl) + '" width="170" alt="Enperfeitas" style="display:block;width:170px;max-width:100%;height:auto;border:0;' + SLAB + 'font-size:24px;color:#000000;">' +
         '</td></tr>');

  if (testNote) {
    cell('<div style="margin:24px 0 0;padding:10px 16px;border-left:3px solid #954a1e;background-color:#fafafa;' + SANS + 'font-size:13px;line-height:1.5;color:#5a5a5a;">' + e(testNote) + ' Layout version ' + e(EMAIL_DESIGN_VERSION) + '.</div>', '0 32px');
  }

  // Label, main heading (centred), greeting, the piece
  cell('<p style="margin:32px 0 8px;text-align:center;' + SANS + 'font-size:12px;line-height:1.4;letter-spacing:0.08em;text-transform:uppercase;color:#5a5a5a;">' + e(n.label) + '</p>' +
       '<h1 class="h1" style="' + SLAB + 'font-size:26px;line-height:1.15;margin:0 0 24px;text-align:center;color:#000000;">' + e(n.heading) + '</h1>' +
       '<p style="margin:0 0 8px;' + SANS + 'font-size:15px;line-height:1.6;color:#000000;">Hello ' + e(first) + ',</p>' +
       '<p style="margin:0' + (n.piece ? ' 0 16px' : '') + ';' + SANS + 'font-size:15px;line-height:1.6;color:#000000;">' + e(n.intro) + '</p>' +
       (n.piece ? '<p class="ptitle" style="' + SLAB + 'margin:0;font-size:18px;line-height:1.3;color:#000000;">' + e(n.piece) + '</p>' : ''), '0 32px');

  n.blocks.forEach(function (b) {
    if (b.k === 'facts') {
      // The facts, in the style of the figures on the bidding page
      var rows = b.rows.map(function (x, i) {
        return '<tr><td style="padding:12px 0;' + (i < b.rows.length - 1 ? 'border-bottom:1px solid #e6e6e6;' : '') + 'text-align:left;">' +
          '<div style="' + SANS + 'font-size:12px;line-height:1.4;letter-spacing:0.08em;text-transform:uppercase;color:#5a5a5a;margin:0 0 4px;">' + e(x[0]) + '</div>' +
          '<div style="' + SANS + 'font-size:15px;line-height:1.5;font-weight:400;color:#000000;">' + e(x[1]) + '</div></td></tr>';
      }).join('');
      cell('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fafafa;border-radius:10px;"><tr><td style="padding:4px 20px;">' +
           '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' + rows + '</table></td></tr></table>', b.gap || '32px 32px 0');
    } else if (b.k === 'button') {
      // The button (centred): white, black outline, pill shape, as on the website
      cell('<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr>' +
           '<td class="btn" align="center" bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #000000;border-radius:300px;">' +
           '<a href="' + e(b.link) + '" style="display:inline-block;padding:13px 32px;' + SANS + 'font-size:16px;font-weight:400;line-height:1.2;color:#000000;text-decoration:none;border-radius:300px;">' + e(b.text) + '</a>' +
           '</td></tr></table>' +
           (b.note ? '<p style="margin:16px 0 0;' + (b.center ? 'text-align:center;' : '') + SANS + 'font-size:13px;line-height:1.5;color:#5a5a5a;">' + e(b.note) + '</p>' : '') +
           '<p style="margin:8px 0 0;' + SANS + 'font-size:13px;line-height:1.5;color:#5a5a5a;word-break:break-all;">If the button does not work, copy this address into your browser:<br>' + e(b.link) + '</p>',
           b.gap || '24px 32px 0');
    } else if (b.k === 'section') {
      var tag = b.ordered ? 'ol' : 'ul';
      cell('<h3 style="' + SLAB + 'font-size:18px;line-height:1.3;margin:0 0 10px;color:#000000;">' + e(b.heading) + '</h3>' +
           '<' + tag + ' style="margin:0;padding-left:22px;' + SANS + 'font-size:15px;line-height:1.6;color:#000000;">' +
           b.items.map(function (it) { return '<li style="margin:0 0 8px;padding-left:4px;">' + e(it) + '</li>'; }).join('') +
           '</' + tag + '>', b.gap || '32px 32px 0');
    } else if (b.k === 'text') {
      cell(b.paras.map(function (p, i) {
        var last = i === b.paras.length - 1;
        return '<p style="margin:0' + (last ? '' : ' 0 8px') + ';' + SANS + (p.small ? 'font-size:13px;line-height:1.5;color:#5a5a5a;' : 'font-size:15px;line-height:1.6;color:#000000;') + '">' + e(p.text) + '</p>';
      }).join(''), b.gap || '24px 32px 0');
    }
  });

  // Reply line and sign-off
  cell((n.closing ? '<p style="margin:0 0 16px;' + SANS + 'font-size:15px;line-height:1.6;color:#000000;">' + e(n.closing) + '</p>' : '') +
       '<p style="margin:0;' + SANS + 'font-size:15px;line-height:1.6;color:#000000;">Warmly,<br>' +
       '<span style="' + SLAB + 'font-size:18px;">Suzete</span><br>' +
       '<span style="font-size:15px;color:#5a5a5a;">' + e(SENDER_NAME) + '</span></p>', '32px 32px 32px');

  // Footer
  h.push('<tr><td class="pad" style="padding:20px 32px 24px;border-top:1px solid #e6e6e6;text-align:left;' + SANS + 'font-size:12px;line-height:1.6;color:#5a5a5a;">' + e(n.footer) + '</td></tr>');
  h.push('</table></td></tr></table></body></html>');
  return h.join('');
}

/* ---- Sending ------------------------------------------------------ */

// Sends one notice. In test mode it goes to the owner only, marked [TEST].
function deliver_(cfg, testAddress, to, first, n) {
  var subject = n.subject;
  var body = renderPlain_(first, n);
  var testNote = '';
  if (cfg.testMode) {
    subject = '[TEST] ' + subject;
    testNote = 'TEST MODE. In the real round this would go to: ' + to;
    body = testNote + '\n\n' + body;
    to = testAddress;
  }
  MailApp.sendEmail({
    to: to,
    subject: subject,
    body: body,
    htmlBody: renderHtml_(cfg, first, n, testNote),
    name: SENDER_NAME
  });
}

// Sends one notice per recipient, stopping if the daily limit is reached.
// opts: { cfg, testAddress, recipients, notice(p), afterSend(p) }
// afterSend runs right after each real send, so a crash never leaves a sent email unrecorded.
function sendNotices_(opts) {
  var sent = 0;
  var stoppedForQuota = false;
  for (var i = 0; i < opts.recipients.length; i++) {
    if (MailApp.getRemainingDailyQuota() < 1) {
      stoppedForQuota = true;
      break;
    }
    var p = opts.recipients[i];
    deliver_(opts.cfg, opts.testAddress, p.email, p.first, opts.notice(p));
    if (!opts.cfg.testMode && opts.afterSend) opts.afterSend(p);
    sent++;
  }
  return { sent: sent, stoppedForQuota: stoppedForQuota };
}

function reportSent_(ui, title, r, cfg, testAddress, noun, cellName) {
  var msg = r.sent + ' ' + noun + ' sent' + (cfg.testMode ? ' to ' + testAddress + ' (test mode, "' + cellName + '" cells left empty).' : '.');
  if (r.stoppedForQuota) msg += ' Stopped early because the daily email limit was reached. Run it again tomorrow for the rest.';
  ui.alert(title, msg, ui.ButtonSet.OK);
}

/* ================================================================== */
/* MENU ACTIONS                                                        */
/* ================================================================== */

// Runs a menu action. An unexpected error becomes a readable message
// instead of Google's generic one, and is also written to the log.
function runMenu_(title, fn) {
  try {
    return fn();
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    var ui = SpreadsheetApp.getUi();
    ui.alert(title, 'Something went wrong, and nothing more was done after this point.\n\n' + (err && err.message ? err.message : err), ui.ButtonSet.OK);
  }
}

// The Config values every email needs. Explains what is missing and returns false.
function requireConfig_(ui, title, cfg) {
  var problems = [];
  if (!cfg.pieceTitle) problems.push('piece_title');
  if (!cfg.baseUrl) problems.push('page_base_url');
  if (cfg.closingMs === null) problems.push('closing_time');
  if (!problems.length) return true;
  ui.alert(title, 'Please fill in these Config values first: ' + problems.join(', ') + '.', ui.ButtonSet.OK);
  return false;
}

// The address test emails go to (yours). Returns null, after explaining, if test
// mode is on and it cannot be found.
function resolveTestAddress_(ui, title, cfg) {
  var address = Session.getEffectiveUser().getEmail() || Session.getActiveUser().getEmail();
  if (cfg.testMode && !address) {
    ui.alert(title, 'Test mode is on, but your own email address could not be found. Nothing was sent.', ui.ButtonSet.OK);
    return null;
  }
  return address || '';
}

function checkQuota_(ui, title, count, hint) {
  var quota = MailApp.getRemainingDailyQuota();
  if (quota >= count) return true;
  ui.alert(title, 'Only ' + quota + ' email(s) can be sent today, but ' + count + ' are waiting. Nothing was sent. ' + hint, ui.ButtonSet.OK);
  return false;
}

/* ---- Invitations and reminders ------------------------------------ */

function sendInvitations() {
  runMenu_('Send invitations', function () {
    var title = 'Send invitations';
    var ui = SpreadsheetApp.getUi();
    var cfg = readConfig_();
    var data = readInvitees_();
    if (!requireConfig_(ui, title, cfg)) return;

    var todo = data.rows.filter(function (r) {
      return r.status === STATUS.APPROVED && r.code && !r.sent && r.email && r.first;
    });
    if (!todo.length) {
      ui.alert(title, 'Nothing to send. Approved rows with a code and an empty "sent" cell are sent.', ui.ButtonSet.OK);
      return;
    }
    if (!checkQuota_(ui, title, todo.length, 'Try again tomorrow, or send fewer by changing some rows to pending.')) return;
    var testAddress = resolveTestAddress_(ui, title, cfg);
    if (testAddress === null) return;

    var question = cfg.testMode
      ? 'Test mode is ON. ' + todo.length + ' test email(s) will be sent to ' + testAddress + ' only. Nobody else receives anything. Continue?'
      : todo.length + ' invitation(s) will be sent to the invitees. Continue?';
    if (ui.alert(title, question, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

    var r = sendNotices_({
      cfg: cfg,
      testAddress: testAddress,
      recipients: todo,
      notice: function (p) { return invitationNotice_(cfg, p); },
      afterSend: function (p) { setCell_(data.sheet, p.row, data.cols.sent, iso_(Date.now())); }
    });
    reportSent_(ui, title, r, cfg, testAddress, 'email(s)', 'sent');
  });
}

/*
 * Send reminders: the reminder email goes to people who already received their
 * invitation. It can go to everyone invited, or only to people with no bid yet.
 * A "reminded" column holds the time, so you can see who has had one.
 */
function sendReminders() {
  runMenu_('Send reminders', function () {
    var title = 'Send reminders';
    var ui = SpreadsheetApp.getUi();
    var cfg = readConfig_();
    var data = readInvitees_();
    if (!requireConfig_(ui, title, cfg)) return;
    if (cfg.status === 'closed' || cfg.closingMs <= Date.now()) {
      ui.alert(title, 'Bidding is already closed, so there is nothing to remind anyone about. Nothing was sent.', ui.ButtonSet.OK);
      return;
    }

    // Everyone who has been invited. In test mode the "sent" cells stay empty,
    // so test mode counts every approved row that has a code.
    var invited = data.rows.filter(function (r) {
      return r.status === STATUS.APPROVED && r.code && r.email && r.first && (cfg.testMode || r.sent);
    });
    if (!invited.length) {
      ui.alert(title, 'Nobody to remind. Reminders go to approved rows that already received their invitation.', ui.ButtonSet.OK);
      return;
    }
    var hasBid = {};
    readBids_().forEach(function (b) { hasBid[b.code] = true; });
    var notBid = invited.filter(function (r) { return !hasBid[normCode_(r.code)]; });

    var testAddress = resolveTestAddress_(ui, title, cfg);
    if (testAddress === null) return;

    var choice = ui.alert(title,
      'Invited so far: ' + invited.length + '\nNo bid placed yet: ' + notBid.length + '\n\n' +
      'YES: send the reminder only to the ' + notBid.length + ' with no bid yet.\n' +
      'NO: send it to all ' + invited.length + ' invited people.\n' +
      'CANCEL: send nothing.' +
      (cfg.testMode ? '\n\nTest mode is ON: the emails go to ' + testAddress + ' only, nobody else receives anything.' : ''),
      ui.ButtonSet.YES_NO_CANCEL);
    if (choice !== ui.Button.YES && choice !== ui.Button.NO) return;
    var todo = choice === ui.Button.YES ? notBid : invited;
    if (!todo.length) {
      ui.alert(title, 'Nobody is left to remind. Nothing was sent.', ui.ButtonSet.OK);
      return;
    }
    if (!checkQuota_(ui, title, todo.length, 'Try again tomorrow.')) return;

    var remindedCol = cfg.testMode ? -1 : ensureColumn_(data.sheet, COL.REMINDED);
    var r = sendNotices_({
      cfg: cfg,
      testAddress: testAddress,
      recipients: todo,
      notice: function (p) { return reminderNotice_(cfg, p); },
      afterSend: function (p) { setCell_(data.sheet, p.row, remindedCol, iso_(Date.now())); }
    });
    reportSent_(ui, title, r, cfg, testAddress, 'reminder(s)', COL.REMINDED);
  });
}

/* ---- After the auction: winner, payment, dispatch ------------------ */
/*                                                                     */
/* Four columns are added to the Invitees tab (the first time the real */
/* winner email is sent, or the first time one of the two emails below */
/* is sent): delivery note, payment requested, paid, dispatched.       */
/* "delivery note" and "paid" are for you to fill in by hand. The two  */
/* emails fill in "payment requested" and "dispatched" with the time   */
/* they were sent. Only the winner's row is ever touched.              */

// Shared by the winner menu items: checks the Config values, finds the winning
// bid and the winner's row on the Invitees tab. Explains and returns null when
// something is missing, so the caller just stops.
function winnerContext_(title) {
  var ui = SpreadsheetApp.getUi();
  var cfg = readConfig_();
  if (!requireConfig_(ui, title, cfg)) return null;

  var isClosed = cfg.status === 'closed' || cfg.closingMs <= Date.now();
  if (!isClosed && !cfg.testMode) {
    ui.alert(title, 'Bidding is still open, so there is no winner yet. Nothing was sent. Close the auction first, or wait for the closing time.', ui.ButtonSet.OK);
    return null;
  }

  var high = highestBid_(readBids_());
  if (!high) {
    ui.alert(title, 'There are no bids, so there is no winner. Nothing was sent.', ui.ButtonSet.OK);
    return null;
  }

  var data = readInvitees_();
  var winner = findInvitee_(data, high.code);
  if (!winner) {
    ui.alert(title, 'The highest bid (' + fmtSek_(high.amount) + ', code ' + high.code + ') does not match any code on the Invitees tab. Nothing was sent.', ui.ButtonSet.OK);
    return null;
  }
  if (!winner.email || !winner.first) {
    ui.alert(title, 'The winner (code ' + high.code + ', row ' + winner.row + ' on the Invitees tab) has no email address or first name. Nothing was sent.', ui.ButtonSet.OK);
    return null;
  }
  winner.amount = high.amount;

  var testAddress = resolveTestAddress_(ui, title, cfg);
  if (testAddress === null) return null;
  return { ui: ui, cfg: cfg, data: data, high: high, winner: winner, isClosed: isClosed, testAddress: testAddress };
}

// YES/NO question before a winner email. summary describes who and what; alreadyText is
// shown instead of the plain question when this email was sent before (null if not).
function confirmWinnerSend_(c, title, summary, alreadyText, freshText) {
  var q = summary + '\n\n';
  if (c.cfg.testMode) q += 'Test mode is ON: the email goes to ' + c.testAddress + ' only, nobody else receives anything. Send it?';
  else if (alreadyText) q += alreadyText;
  else q += freshText;
  return c.ui.alert(title, q, c.ui.ButtonSet.YES_NO) === c.ui.Button.YES;
}

// Sends one notice to the winner. Returns false (after explaining) if the daily limit is reached.
function sendToWinner_(c, title, notice) {
  if (MailApp.getRemainingDailyQuota() < 1) {
    c.ui.alert(title, 'The daily email limit has been reached. Nothing was sent. Try again tomorrow.', c.ui.ButtonSet.OK);
    return false;
  }
  deliver_(c.cfg, c.testAddress, c.winner.email, c.winner.first, notice);
  return true;
}

// What is already written for the winner in one of the order columns.
function orderCell_(c, name) {
  var extras = readExtraCols_(c.data.sheet, [name]);
  return extras[c.winner.row] ? extras[c.winner.row][name] : '';
}

function recordOrderTime_(c, name) {
  var cols = ensureColumns_(c.data.sheet, ORDER_COLUMNS);
  setCell_(c.data.sheet, c.winner.row, cols[name], iso_(Date.now()));
}

function testSentText_(c) {
  return 'Test email sent to ' + c.testAddress + ' (test mode, nothing was recorded).';
}

function sendWinnerEmail() {
  runMenu_('Send winner email', function () {
    var title = 'Send winner email';
    var c = winnerContext_(title);
    if (!c) return;
    var cfg = c.cfg, winner = c.winner;

    var summary = 'Winner: ' + winner.first + ' (' + winner.email + ')\n' +
      'Winning bid: ' + fmtSek_(winner.amount) + ', moms included\n' +
      'Piece: ' + cfg.pieceTitle + '\n' +
      'The email asks the winner to reply with shipping or collection. It has no payment link: the payment details follow in a second email.';
    if (!c.isClosed) summary += '\n\nBidding is still open (test mode), so this is only a preview of the email.';
    if (!confirmWinnerSend_(c, title, summary,
        cfg.winnerEmailed ? 'The winner email was already sent (' + cfg.winnerEmailed + '). Send it again?' : null,
        'Send the winner email to ' + winner.first + ' now?')) return;
    if (!sendToWinner_(c, title, winnerNotice_(cfg, winner))) return;
    if (!cfg.testMode) {
      writeConfigValue_('winner_emailed', iso_(Date.now()), true);
      ensureColumns_(c.data.sheet, ORDER_COLUMNS);   // so the tracking columns are there to fill in
    }
    c.ui.alert(title,
      cfg.testMode
        ? testSentText_(c)
        : 'The winner email was sent to ' + winner.first + ' (' + winner.email + ').\n\nNext: when they reply with shipping or collection, use Invitations > Send payment details.',
      c.ui.ButtonSet.OK);
  });
}

function sendPaymentDetails() {
  runMenu_('Send payment details', function () {
    var title = 'Send payment details';
    var c = winnerContext_(title);
    if (!c) return;
    var ui = c.ui, cfg = c.cfg, winner = c.winner;

    var choice = ui.alert(title,
      'Is ' + winner.first + ' having the piece shipped, or collecting it at the studio?\n\n' +
      'YES: shipped (you will be asked for the shipping cost)\n' +
      'NO: collected at the studio, no shipping\n' +
      'CANCEL: stop',
      ui.ButtonSet.YES_NO_CANCEL);
    if (choice !== ui.Button.YES && choice !== ui.Button.NO) return;
    var collect = choice === ui.Button.NO;

    var shipping = 0;
    if (!collect) {
      var answer = askText_(ui, title, 'Shipping cost for ' + winner.first + ', in whole SEK with moms included (for example 150).');
      if (answer === null) return;
      shipping = toInt_(answer.replace(/sek|kr|\s/gi, ''), null);
      if (shipping === null || shipping < 1) {
        ui.alert(title, 'Please enter the shipping cost as a whole number above 0. Nothing was sent.', ui.ButtonSet.OK);
        return;
      }
    }
    // Collection uses the no-shipping link; if that row is empty, the normal link is used.
    var link = collect ? (cfg.paymentLinkNoShipping || cfg.paymentLink) : cfg.paymentLink;
    var linkNote = !link ? 'Payment: no payment link in Config, so the email says an invoice will follow.'
      : collect && !cfg.paymentLinkNoShipping ? 'Payment: the email includes payment_link (payment_link_no_shipping is empty in Config).'
      : collect ? 'Payment: the email includes payment_link_no_shipping.'
      : 'Payment: the email includes payment_link.';

    var already = cfg.testMode ? '' : orderCell_(c, COL.PAYMENT_REQUESTED);
    var summary = 'To: ' + winner.first + ' (' + winner.email + ')\n' +
      (collect ? 'Collected at the studio, no shipping\n' : 'Shipping: ' + fmtSek_(shipping) + '\n') +
      'Winning bid: ' + fmtSek_(winner.amount) + '\n' +
      (collect ? '' : 'Total with the bid: ' + fmtSek_(winner.amount + shipping) + '\n') +
      linkNote;
    if (!confirmWinnerSend_(c, title, summary,
        already ? 'Payment details were already sent (' + already + '). Send them again?' : null,
        'Send the shipping and payment email now?')) return;
    if (!sendToWinner_(c, title, paymentNotice_(cfg, winner, shipping, link))) return;
    if (!cfg.testMode) {
      recordOrderTime_(c, COL.PAYMENT_REQUESTED);
      if (collect && !orderCell_(c, COL.DELIVERY_NOTE)) {
        setCell_(c.data.sheet, winner.row, ensureColumn_(c.data.sheet, COL.DELIVERY_NOTE), 'collect at the studio');
      }
    }
    ui.alert(title,
      cfg.testMode
        ? testSentText_(c)
        : 'Payment details sent to ' + winner.first + ' (' + winner.email + '). The time is saved in the "payment requested" column. When the payment arrives, type the date in the "paid" column.',
      ui.ButtonSet.OK);
  });
}

function sendDispatchEmail() {
  runMenu_('Send dispatch email', function () {
    var title = 'Send dispatch email';
    var c = winnerContext_(title);
    if (!c) return;
    var ui = c.ui, cfg = c.cfg, winner = c.winner;

    var tracking = askText_(ui, title,
      'Tracking details for ' + winner.first + ': carrier and number, for example "PostNord 00123456789".\n' +
      'You can leave this empty to send the email without tracking details.');
    if (tracking === null) return;

    var unpaid = cfg.testMode ? false : !orderCell_(c, COL.PAID);
    var already = cfg.testMode ? '' : orderCell_(c, COL.DISPATCHED);
    var summary = 'To: ' + winner.first + ' (' + winner.email + ')\n' +
      'Piece: ' + cfg.pieceTitle + '\n' +
      'Tracking: ' + (tracking || 'none given');
    if (unpaid) summary += '\n\nCareful: the "paid" column is empty for this winner. Only dispatch after payment has arrived.';
    if (!confirmWinnerSend_(c, title, summary,
        already ? 'A dispatch email was already sent (' + already + '). Send it again?' : null,
        'Send the dispatch email now?')) return;
    if (!sendToWinner_(c, title, dispatchNotice_(cfg, tracking))) return;
    if (!cfg.testMode) recordOrderTime_(c, COL.DISPATCHED);
    ui.alert(title,
      cfg.testMode
        ? testSentText_(c)
        : 'The dispatch email was sent to ' + winner.first + ' (' + winner.email + '). The time is saved in the "dispatched" column.',
      ui.ButtonSet.OK);
  });
}

/* ---- Rounds: answers from the page, new round, ask previous participants ---- */
/*                                                                     */
/* Status values on the Invitees tab (the "status" column):            */
/*   approved      invited to bid in the current round                 */
/*   returning     took part in an earlier round, paused until they    */
/*                 answer (no invitation, no reminder)                 */
/*   declined      answered "not this round" (asked again next round)  */
/*   unsubscribed  answered "remove me" (never asked again)            */
/*   pending       new sign-up waiting for you to approve              */
/*   revoked       blocked by you                                      */
/* Two columns are added: asked (when the question email was sent) and */
/* answered (when they last answered).                                 */

// Only people who have been in a round can answer. A pending or blocked row never can.
var ANSWERING_STATUSES = [STATUS.APPROVED, STATUS.RETURNING, STATUS.DECLINED, STATUS.UNSUBSCRIBED];

// What the answer page asks (web app).
function roundInfo_(code) {
  var data = readInvitees_();
  var me = findInvitee_(data, code);
  if (!me || ANSWERING_STATUSES.indexOf(me.status) < 0) return { ok: true, valid: false };
  var answer = 'none';
  if (me.status === STATUS.APPROVED) answer = 'yes';
  else if (me.status === STATUS.DECLINED) answer = 'no';
  else if (me.status === STATUS.UNSUBSCRIBED) answer = 'removed';
  return { ok: true, valid: true, firstName: me.first, answer: answer, invited: me.status === STATUS.APPROVED && !!me.sent };
}

// What the answer page saves (web app).
function respondToRound_(code, answer) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return fail_('busy');
  try {
    var data = readInvitees_();
    var me = findInvitee_(data, code);
    if (!me) return fail_('invalid_code');
    if (me.status === STATUS.REVOKED) return fail_('revoked');
    if (ANSWERING_STATUSES.indexOf(me.status) < 0) return fail_('invalid_code');
    var next = { yes: STATUS.APPROVED, no: STATUS.DECLINED, remove: STATUS.UNSUBSCRIBED }[String(answer)];
    if (!next) return fail_('bad_answer');
    // Someone who already has this round's invitation can still remove themselves,
    // but cannot step out of the round halfway by saying "not this round".
    if (me.status === STATUS.APPROVED && me.sent && answer === 'no') return fail_('already_invited');
    if (me.status !== next) {
      data.sheet.getRange(me.row, data.cols.status + 1).setValue(next);
      setCell_(data.sheet, me.row, ensureColumn_(data.sheet, COL.ANSWERED), iso_(Date.now()));
      SpreadsheetApp.flush();
    }
    return { ok: true, answer: answer, firstName: me.first, invited: next === STATUS.APPROVED && !!me.sent };
  } finally {
    lock.releaseLock();
  }
}

// Empties cells in one row. Neighbouring columns are cleared in one call each.
function clearCells_(sheet, row, cols) {
  var sorted = cols.slice().sort(function (a, b) { return a - b; });
  var i = 0;
  while (i < sorted.length) {
    var j = i;
    while (j + 1 < sorted.length && sorted[j + 1] <= sorted[j] + 1) j++;
    sheet.getRange(row, sorted[i] + 1, 1, sorted[j] - sorted[i] + 1).clearContent();
    i = j + 1;
  }
}

function startNewRound() {
  runMenu_('Start new round', function () {
    var title = 'Start new round';
    var ui = SpreadsheetApp.getUi();
    var cfg = readConfig_();
    var closed = cfg.status === 'closed' || (cfg.closingMs !== null && cfg.closingMs <= Date.now());
    if (!closed && !cfg.testMode) {
      ui.alert(title, 'The current round is still open. Close the auction first (Invitations > Close auction), or wait for the closing time. Nothing was changed.', ui.ButtonSet.OK);
      return;
    }

    var data = readInvitees_();
    var pause = [];       // took part last round: approved and invitation sent
    var again = [];       // answered "not this round": asked again
    var stay = [];        // already waiting for an answer
    var left = { pending: 0, notInvited: 0, other: 0 };
    data.rows.forEach(function (r) {
      if (!r.code && !r.email && !r.first) return;   // empty row
      if (r.status === STATUS.APPROVED && r.sent) pause.push(r);
      else if (r.status === STATUS.DECLINED) again.push(r);
      else if (r.status === STATUS.RETURNING) stay.push(r);
      else if (r.status === STATUS.APPROVED) left.notInvited++;
      else if (r.status === STATUS.PENDING) left.pending++;
      else left.other++;   // revoked, unsubscribed, anything else
    });
    var names = function (list) {
      var n = list.slice(0, 12).map(function (r) { return r.first || r.email; });
      return n.join(', ') + (list.length > 12 ? ' and ' + (list.length - 12) + ' more' : '');
    };

    var q = 'This starts a new round.\n\n' +
      'PAUSED until they answer (took part last round): ' + pause.length + (pause.length ? '\n' + names(pause) : '') + '\n\n' +
      (again.length ? 'Asked again (answered "not this round" before): ' + again.length + '\n' + names(again) + '\n\n' : '') +
      (stay.length ? 'Already waiting for an answer: ' + stay.length + '\n\n' : '') +
      'NOT TOUCHED:\n' +
      '- new sign-ups waiting for approval: ' + left.pending + '\n' +
      '- approved but not invited yet: ' + left.notInvited + '\n' +
      '- removed, blocked or other: ' + left.other + '\n\n' +
      'Before anything changes, the Invitees and Bids tabs are copied to backup tabs, and the old bids are kept in their own tab. Then the Bids tab is emptied and the round columns are cleared for the paused people only.\n\n';
    if (cfg.roundStarted) {
      q += 'WARNING: a new round was already started on ' + cfg.roundStarted + '. If you invited people since then, starting again would pause them too.\n\n';
    }
    q += 'Continue?';
    if (ui.alert(title, q, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

    var lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) {
      ui.alert(title, 'The Sheet is busy right now (a bid or an answer is being saved). Nothing was changed. Please try again in a moment.', ui.ButtonSet.OK);
      return;
    }
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var stamp = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HHmm');
      var copyTab = function (sheet, name) {
        var base = name.replace(/[\[\]\*\?:\/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
        var finalName = base, n = 2;
        while (ss.getSheetByName(finalName)) finalName = base + ' ' + n++;
        sheet.copyTo(ss).setName(finalName);
        return finalName;
      };
      var backupName = copyTab(data.sheet, 'Invitees backup ' + stamp);
      var oldBidsName = copyTab(getSheet_(SHEET_BIDS), 'Bids ' + stamp.slice(0, 10) + ' ' + (cfg.pieceTitle || 'round').slice(0, 40));

      // Only the paused people (and the "not this round" people) are changed.
      var cols = ensureColumns_(data.sheet, ROUND_COLUMNS);
      var clearCols = [data.cols.sent].concat(ROUND_COLUMNS.map(function (n) { return cols[n]; }));
      var toReturning = pause.concat(again);
      toReturning.concat(stay).forEach(function (r) {
        data.sheet.getRange(r.row, data.cols.status + 1).setValue(STATUS.RETURNING);
        clearCells_(data.sheet, r.row, clearCols);
      });

      var bidsSheet = getSheet_(SHEET_BIDS);
      var last = bidsSheet.getLastRow();
      if (last > 1) bidsSheet.getRange(2, 1, last - 1, 5).clearContent();
      writeConfigValue_('winner_emailed', '', true);
      writeConfigValue_('round_started', iso_(Date.now()), true);
      SpreadsheetApp.flush();
      clearStateCache_();

      ui.alert(title,
        toReturning.length + ' people are paused as "returning". Nothing else in the Invitees tab was changed.\n\n' +
        'Backups: "' + backupName + '" and "' + oldBidsName + '".\n\n' +
        'Next: update piece_title, description, closing_time and status in Config for the new piece, then use Invitations > Ask previous participants.',
        ui.ButtonSet.OK);
    } finally {
      lock.releaseLock();
    }
  });
}

function askPreviousParticipants() {
  runMenu_('Ask previous participants', function () {
    var title = 'Ask previous participants';
    var ui = SpreadsheetApp.getUi();
    var cfg = readConfig_();
    if (!cfg.baseUrl) {
      ui.alert(title, 'Please fill in page_base_url in Config first. Nothing was sent.', ui.ButtonSet.OK);
      return;
    }
    var data = readInvitees_();
    var extras = readExtraCols_(data.sheet, [COL.ASKED]);
    var waiting = data.rows.filter(function (r) {
      return r.status === STATUS.RETURNING && r.code && r.email && r.first;
    });
    var notAsked = waiting.filter(function (r) { return !extras[r.row][COL.ASKED]; });
    var asked = waiting.filter(function (r) { return !!extras[r.row][COL.ASKED]; });
    if (!waiting.length) {
      ui.alert(title, 'Nobody is waiting for an answer. People become "returning" when you use Invitations > Start new round.', ui.ButtonSet.OK);
      return;
    }
    var testAddress = resolveTestAddress_(ui, title, cfg);
    if (testAddress === null) return;

    var choice = ui.alert(title,
      'People waiting for an answer: ' + waiting.length + '\n' +
      'Not asked yet: ' + notAsked.length + '\n' +
      'Asked, no answer yet: ' + asked.length + '\n\n' +
      'YES: ask the ' + notAsked.length + ' who have not been asked yet.\n' +
      'NO: send a gentle nudge to the ' + asked.length + ' who have not answered.\n' +
      'CANCEL: send nothing.' +
      (cfg.testMode ? '\n\nTest mode is ON: the emails go to ' + testAddress + ' only, nobody else receives anything.' : ''),
      ui.ButtonSet.YES_NO_CANCEL);
    if (choice !== ui.Button.YES && choice !== ui.Button.NO) return;
    var nudge = choice === ui.Button.NO;
    var todo = nudge ? asked : notAsked;
    if (!todo.length) {
      ui.alert(title, 'Nobody is left in that group. Nothing was sent.', ui.ButtonSet.OK);
      return;
    }
    if (!checkQuota_(ui, title, todo.length, 'Try again tomorrow.')) return;

    var askedCol = cfg.testMode ? -1 : ensureColumn_(data.sheet, COL.ASKED);
    var r = sendNotices_({
      cfg: cfg,
      testAddress: testAddress,
      recipients: todo,
      notice: function (p) { return askNotice_(cfg, p, nudge); },
      afterSend: function (p) { setCell_(data.sheet, p.row, askedCol, iso_(Date.now())); }
    });
    ui.alert(title,
      r.sent + ' email(s) sent' + (cfg.testMode
        ? ' to ' + testAddress + ' (test mode, "asked" cells left empty).'
        : '. The time is saved in the "asked" column. Answers appear in the "status" column as people respond: approved (yes), declined (not this round) or unsubscribed (remove me).'),
      ui.ButtonSet.OK);
  });
}

/* ---- Close auction, reset test bids, first-time setup -------------- */

function closeAuction() {
  runMenu_('Close auction', function () {
    var ui = SpreadsheetApp.getUi();
    if (ui.alert('Close auction', 'Close the auction now? No more bids will be accepted.', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
    writeConfigValue_('status', 'closed', true);
    SpreadsheetApp.flush();
    clearStateCache_();
    ui.alert('Close auction', 'The auction is closed.\n\nNext: Invitations > Send winner email.', ui.ButtonSet.OK);
  });
}

function resetTestBids() {
  runMenu_('Reset test bids', function () {
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
  });
}

// The Config rows a new Sheet starts with (key, value).
var CONFIG_DEFAULTS = [
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
  ['payment_link', ''],
  ['payment_link_no_shipping', ''],
  ['photo_prefix', 'beige-jeand-de-g'],
  ['photo_count', 4],
  ['photo_alt', 'Beige linen book with a mustard leather spine'],
  ['description', 'Write two or three plain sentences about the piece here.'],
  ['details', 'Size: \nMaterials: \nMade: ']
];

function createTabs() {
  runMenu_('Create tabs', function () {
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

    var existingConfig = ss.getSheetByName(SHEET_CONFIG);
    if (!existingConfig) {
      var cfg = ss.insertSheet(SHEET_CONFIG);
      var n = CONFIG_DEFAULTS.length;
      cfg.getRange(1, 1, n, 1).setValues(CONFIG_DEFAULTS.map(function (r) { return [r[0]]; }));
      cfg.getRange(1, 2, n, 1).setNumberFormat('@');
      cfg.getRange(1, 2, n, 1).setValues(CONFIG_DEFAULTS.map(function (r) { return [r[1]]; }));
      cfg.getRange(1, 1, n, 1).setFontWeight('bold');
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
      CONFIG_DEFAULTS.forEach(function (r) {
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
  });
}
