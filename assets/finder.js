/**
 * Client-side filter for listing indexes, plus the print button.
 *
 * Progressive enhancement only: every list is already in the HTML and works
 * with JavaScript off. This script just hides non-matching rows. Nothing is
 * fetched, nothing is rendered — which is why the search box is not shown
 * until the script confirms it can run.
 *
 * `data-finder-lazy` (the home page) keeps the whole list hidden until the
 * visitor types: without JS the visible "A to Z" link carries the load, and
 * with JS the home stays a lookup surface instead of a 90-row dump.
 */
(function () {
  'use strict';

  // Print button — hidden until JS confirms window.print will fire.
  var printBtn = document.querySelector('[data-print-btn]');
  if (printBtn) {
    printBtn.hidden = false;
    printBtn.addEventListener('click', function () { window.print(); });
  }

  var form = document.querySelector('[data-finder]');
  if (!form) return;

  var input = form.querySelector('.finder__input');
  var status = form.querySelector('.finder__status');
  var listId = form.getAttribute('data-finder');
  var lazy = form.hasAttribute('data-finder-lazy');
  var list = document.getElementById(listId);
  if (!input || !list) return;

  form.hidden = false;
  if (!lazy) list.hidden = false;

  var items = Array.prototype.slice.call(list.children).map(function (li) {
    return { el: li, haystack: (li.textContent || '').toLowerCase().replace(/\s+/g, ' ') };
  });
  var total = items.length;

  function announce(shown, query) {
    if (!status) return;
    if (!query) { status.textContent = ''; return; }
    status.textContent = shown === 0
      ? 'No matches for “' + query + '”. Try a broader word, or browse A to Z.'
      : shown + ' of ' + total + ' shown.';
  }

  var timer = null;
  function apply() {
    var query = input.value.trim().toLowerCase();
    if (lazy) list.hidden = !query;
    var shown = 0;
    for (var i = 0; i < items.length; i++) {
      var hit = !query || items[i].haystack.indexOf(query) !== -1;
      items[i].el.hidden = !hit;
      if (hit) shown++;
    }
    announce(shown, query);
  }

  input.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(apply, 90);
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearTimeout(timer);
    apply();
  });

  // Escape clears the filter — cheap, and people expect it.
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && input.value) {
      input.value = '';
      apply();
    }
  });
})();
