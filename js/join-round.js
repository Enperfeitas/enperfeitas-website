/* ==========================================================================
   Enperfeitas: "Will you join the next round?" page
   Plain JavaScript, no libraries. The answer is saved by the Google Apps
   Script (apps-script/Code.gs); this file only shows the choices and sends
   the answer. The page opens from the personal link in the email.

   The card is always in exactly one of four views:
   loading, problem (bad link or no connection), choose, done.
   ========================================================================== */

// Same web app address as js/bidding.js (it ends in /exec).
var WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxAsMpgPnNCepmEUy3UHtQkAo2kCpjjAMDaWb7FXJW-FMqQx3jBr3toSEqLSkGmaJY/exec';

(function () {
  'use strict';

  var VIEWS = ['jr-loading', 'jr-problem', 'jr-choose', 'jr-done'];

  // What each answer is called on the page, and what the person is told after giving it.
  var ANSWERS = {
    yes: {
      chip: 'Your answer: yes, include me',
      title: function (name) {
        return 'You are on the list' + (name ? ', ' + name : '');
      },
      text: function () {
        return 'Thank you. I will email you an invitation before bidding opens, with a preview of the piece and how bidding works.';
      }
    },
    no: {
      chip: 'Your answer: not this round',
      title: function () {
        return 'Thank you for letting me know';
      },
      text: function () {
        return 'I will not send you anything about this round, and I will ask you again before the next one.';
      }
    },
    remove: {
      chip: 'Your answer: removed from the list',
      title: function () {
        return 'You have been removed';
      },
      text: function () {
        return 'I will not email you about bidding again. If you change your mind, just use the same link and choose "Yes, include me".';
      }
    }
  };
  // The page and the script call "removed" what the choice button calls "remove".
  var FROM_SERVER = { none: '', yes: 'yes', no: 'no', removed: 'remove' };

  var code = '';
  var first = '';
  var current = ''; // 'yes' | 'no' | 'remove' | '' (not answered yet)
  var invited = false;
  var busy = false;

  function $(id) {
    return document.getElementById(id);
  }

  function announce(text) {
    $('jr-status').textContent = text;
  }

  function view(name) {
    VIEWS.forEach(function (id) {
      $(id).hidden = id !== name;
    });
  }

  function readCode() {
    var c = '';
    try {
      c = String(new URLSearchParams(location.search).get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    } catch (e) {
      c = '';
    }
    if (c) {
      // Keep the personal code out of the address bar, screenshots and history.
      try {
        history.replaceState(null, '', location.pathname + location.hash);
      } catch (e) {
        /* not important */
      }
    }
    return c;
  }

  function problem(text) {
    $('jr-problem-text').textContent = text;
    view('jr-problem');
    announce(text);
  }

  function showChoose(focusFirst) {
    $('jr-hello').textContent = first ? 'Hello ' + first + ',' : 'Hello,';
    var chip = $('jr-chip');
    if (current) {
      chip.textContent = ANSWERS[current].chip;
      chip.hidden = false;
    } else {
      chip.hidden = true;
    }
    // Someone who already has this round's invitation can only remove themselves.
    $('jr-yes-row').hidden = invited;
    $('jr-no-row').hidden = invited;
    $('jr-invited').hidden = !invited;
    $('jr-error').hidden = true;
    view('jr-choose');
    if (focusFirst) {
      (invited ? $('jr-remove') : $('jr-yes')).focus();
    }
  }

  function showDone(answer) {
    var a = ANSWERS[answer];
    $('jr-done-title').textContent = a.title(first);
    $('jr-done-text').textContent = a.text();
    view('jr-done');
    $('jr-done-title').focus();
    announce(a.title(first) + '. ' + a.text());
  }

  function errorText(r) {
    switch (r && r.error) {
      case 'already_invited':
        return 'You have already been sent an invitation for this round. You can still choose "Remove me from the list", or reply to the invitation email.';
      case 'busy':
        return 'The page is busy right now. Please try again in a moment.';
      case 'invalid_code':
      case 'revoked':
        return 'This link was not recognised. Please use the link from your email, or reply to that email and I will help.';
      default:
        return 'Something went wrong, and your answer was not saved. Please try again, or reply to the email.';
    }
  }

  function setBusy(on, button, label) {
    busy = on;
    ['jr-yes', 'jr-no', 'jr-remove'].forEach(function (id) {
      $(id).disabled = on;
    });
    if (button) {
      if (on) {
        button.setAttribute('data-label', button.textContent);
        button.textContent = label;
      } else if (button.getAttribute('data-label')) {
        button.textContent = button.getAttribute('data-label');
      }
    }
  }

  function send(answer, button) {
    if (busy) return;
    $('jr-error').hidden = true;
    setBusy(true, button, 'Saving');
    // text/plain avoids a CORS preflight request, which Apps Script does not answer.
    fetch(WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'respond', code: code, answer: answer })
    })
      .then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      })
      .then(function (r) {
        setBusy(false, button);
        if (r && r.ok) {
          current = answer;
          invited = !!r.invited;
          showDone(answer);
        } else {
          $('jr-error').textContent = errorText(r);
          $('jr-error').hidden = false;
        }
      })
      .catch(function () {
        setBusy(false, button);
        $('jr-error').textContent = errorText(null);
        $('jr-error').hidden = false;
      });
  }

  function init() {
    code = readCode();
    if (!code) {
      problem('This page opens from the personal link in your email. Please use that link, or reply to the email and I will help.');
      return;
    }
    $('jr-yes').addEventListener('click', function () {
      send('yes', this);
    });
    $('jr-no').addEventListener('click', function () {
      send('no', this);
    });
    $('jr-remove').addEventListener('click', function () {
      send('remove', this);
    });
    $('jr-change').addEventListener('click', function () {
      showChoose(true);
    });

    fetch(WEB_APP_URL + '?action=roundinfo&code=' + encodeURIComponent(code), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      })
      .then(function (info) {
        if (info && info.ok && info.valid) {
          first = info.firstName || '';
          current = FROM_SERVER[info.answer] || '';
          invited = !!info.invited;
          showChoose(false);
        } else {
          problem('This link was not recognised. Please use the link from your email, or reply to that email and I will help.');
        }
      })
      .catch(function () {
        problem('The page could not load right now. Please try again in a moment, or reply to the email.');
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
