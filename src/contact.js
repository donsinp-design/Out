// Asking a winner how to reach them.
//
// Only ever after a run, only when the score service is configured and the run actually placed, and only once —
// a game that asks for your email every time you die is a game you close. It is a real HTML field rather than
// something typed on the canvas a letter at a time, because an address is thirty characters of punctuation and
// nobody should enter one with a joypad.
//
// Nothing here is required. Skipping files the score exactly the same; the address only ever adds the ability to
// write back. That is also why the reason is on screen in one line rather than buried somewhere nobody reads.
(function (OB) {
  'use strict';
  const PLACE_MAX = 10;                 // asked of the day's top ten, nobody else
  const KEY_SENT = 'ob_email_sent', KEY_ASKED = 'ob_email_asked';
  const get = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
  const valid = e => /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(e);

  let box = null;

  function close() {
    if (!box) return;
    box.remove(); box = null;
    if (OB.G) OB.G.uiModal = false;
  }

  function build(place) {
    const el = document.createElement('div');
    el.id = 'contact';
    el.innerHTML =
      '<div class="cbox" role="dialog" aria-modal="true" aria-labelledby="ctitle">' +
        '<h2 id="ctitle"></h2>' +
        '<p class="cwhy"></p>' +
        '<input id="cmail" type="email" inputmode="email" autocomplete="email" spellcheck="false" placeholder="you@example.com" aria-label="Email address">' +
        '<p class="cerr" hidden></p>' +
        '<div class="crow"><button id="cskip" type="button">No thanks</button><button id="csend" class="go" type="button">Send it</button></div>' +
        '<p class="cfine">Only used to tell you if you win. Nothing else, and never shown to other players.</p>' +
      '</div>';
    el.querySelector('h2').textContent = place === 1 ? 'You are first today' : 'You made today’s top ' + PLACE_MAX;
    el.querySelector('.cwhy').textContent = place === 1
      ? 'Leave an address and we can tell you if it holds.'
      : 'You placed ' + place + '. Leave an address and we can tell you if you finish on top.';
    return el;
  }

  // place comes from the score service: the position this run took on today's board, or null if it did not place
  OB.askEmail = function (place) {
    if (box || !place || place > PLACE_MAX) return;
    if (get(KEY_SENT, 0)) return;                                   // already given one
    if ((get(KEY_ASKED, 0) | 0) >= 2) return;                       // asked twice and declined: stop asking
    if (!OB.G || (OB.G.mode !== 'over' && OB.G.mode !== 'goal')) return;

    set(KEY_ASKED, (get(KEY_ASKED, 0) | 0) + 1);
    box = build(place);
    document.body.appendChild(box);
    if (OB.G) OB.G.uiModal = true;                                  // the game stops reading keys while this is up

    const input = box.querySelector('#cmail');
    const err = box.querySelector('.cerr');
    const send = box.querySelector('#csend');
    setTimeout(() => { try { input.focus(); } catch (e) { } }, 30);

    const fail = msg => { err.hidden = false; err.textContent = msg; input.setAttribute('aria-invalid', 'true'); };

    const submit = () => {
      const v = input.value.trim();
      if (!v) { fail('Type an address, or choose No thanks.'); return; }
      if (!valid(v)) { fail('That does not look like an email address.'); return; }
      send.disabled = true; send.textContent = 'Sending…';
      const row = (OB.G && OB.G.lastRow) || null;
      const done = ok => {
        if (ok) { set(KEY_SENT, 1); close(); }
        else { send.disabled = false; send.textContent = 'Send it'; fail('Could not reach the scoreboard. Try again, or skip.'); }
      };
      if (!OB.svcPost || !row) { done(false); return; }
      const name = (OB.savedNameLabel || 'ICE');
      OB.svcPost(row, name, v).then(d => done(!!d), () => done(false));
    };

    send.onclick = submit;
    box.querySelector('#cskip').onclick = close;
    input.addEventListener('keydown', e => {
      e.stopPropagation();                                          // the game listens on window; don't steer from here
      if (e.key === 'Enter') submit();
      if (e.key === 'Escape') close();
    });
    box.addEventListener('keydown', e => e.stopPropagation());
    box.addEventListener('pointerdown', e => e.stopPropagation());
  };

  OB.closeEmail = close;
})(window.OB = window.OB || {});
