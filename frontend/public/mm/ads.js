/**
 * AdSense initialiser — reliable on full loads AND under the SPA router.
 *
 * Why this exists instead of an inline push() next to each <ins>:
 * the router swaps content with
 *     container.innerHTML = next.innerHTML;  execScripts(container);
 * inside document.startViewTransition(). At that instant the new nodes are in
 * the DOM but layout has not settled, so an immediate push() makes AdSense read
 * availableWidth = 0, log "No slot size", and burn that slot permanently — which
 * is exactly why SPA-visited pages showed ads only *sometimes*.
 *
 * So: this file lives OUTSIDE #app-container (footer), survives every SPA swap,
 * watches for new units, and pushes each one only once it actually has width.
 */
(function () {
  'use strict';
  if (window.__knAds) return;
  window.__knAds = true;

  var QUEUED = 'knAdQueued';

  function push(ins) {
    ins.dataset[QUEUED] = '1';
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
  }

  /**
   * Our own units only (.kn-ad wrappers) that nobody has handed to AdSense yet.
   * Anchor/auto units inject themselves into <body> and manage their own
   * lifecycle — pushing for those would double-handle them.
   */
  function pending() {
    var out = [];
    var all = document.querySelectorAll('.kn-ad ins.adsbygoogle');
    for (var i = 0; i < all.length; i++) {
      var n = all[i];
      if (n.dataset[QUEUED]) continue;
      if (n.getAttribute('data-adsbygoogle-status')) continue; // already processed
      out.push(n);
    }
    return out;
  }

  function scan() {
    var list = pending();
    if (!list.length) return true;          // nothing left to do
    var allDone = true;
    for (var i = 0; i < list.length; i++) {
      var ins = list[i];
      // Width is the whole point: a 0-width push is a dead slot.
      if (ins.getBoundingClientRect().width > 0) push(ins);
      else allDone = false;                 // not laid out yet — try again later
    }
    return allDone;
  }

  /* Retry ladder: covers layout that settles a frame later (view transitions),
     images loading, fonts, and lazy containers that expand after paint.
     Deliberately driven by setTimeout ONLY — requestAnimationFrame does not
     fire in a background/hidden tab, and gating on it meant a page opened in a
     new tab could sit there with no ads until it was focused. */
  var timers = [0, 60, 150, 350, 700, 1200, 2000, 3000];
  var lastSweep = 0;
  function sweep() {
    var now = Date.now();
    if (now - lastSweep < 250) return;   // debounce bursts; never latches
    lastSweep = now;
    timers.forEach(function (ms) { setTimeout(scan, ms); });
  }

  // New units arriving from an SPA swap or an AJAX batch.
  if (window.MutationObserver) {
    var mo = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n.nodeType !== 1) continue;
          if (n.matches && (n.matches('.kn-ad') || n.querySelector('.kn-ad ins.adsbygoogle'))) {
            sweep();
            return;
          }
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  // A slot can also gain width without any DOM change (orientation, sidebar),
  // and a tab that was hidden at load only gets its layout once shown.
  window.addEventListener('resize', scan, { passive: true });
  window.addEventListener('pageshow', sweep);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) sweep();
  });
  window.addEventListener('load', sweep);
  if (document.readyState === 'complete' || document.readyState === 'interactive') sweep();
  else document.addEventListener('DOMContentLoaded', sweep);

  // Public hook for code that inserts ads itself.
  window.knPushAds = sweep;
})();
