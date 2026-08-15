/**
 * Client-side filter for listing indexes.
 *
 * Progressive enhancement only: the full list is already in the HTML and works
 * with JavaScript off. This script just hides non-matching cards. Nothing is
 * fetched, nothing is rendered — which is why the search box is not injected
 * into the DOM until the script confirms it can run.
 */
(function () {
  'use strict';

  var form = document.querySelector('[data-finder]');
  if (!form) return;

  var input = form.querySelector('.finder__input');
  var status = form.querySelector('.finder__status');
  var listId = form.getAttribute('data-finder');
  var list = document.getElementById(listId);
  if (!input || !list) return;

  form.hidden = false;

  var items = Array.prototype.slice.call(list.children).map(function (li) {
    return { el: li, haystack: (li.textContent || '').toLowerCase().replace(/\s+/g, ' ') };
  });
  var total = items.length;

  function announce(shown, query) {
    if (!status) return;
    if (!query) { status.textContent = ''; return; }
    status.textContent = shown === 0
      ? 'No matches for “' + query + '”. Try a broader word, or browse the categories below.'
      : shown + ' of ' + total + ' shown.';
  }

  var timer = null;
  function apply() {
    var query = input.value.trim().toLowerCase();
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
