/**
 * Compare system — floating tray + quick-compare modal.
 *
 * Selection lives in localStorage so it survives navigation and the
 * HTML page cache (the tray is built entirely client-side, which keeps
 * every cached page identical for every visitor).
 *
 * Public API: SpecsCompare.add / remove / clear / toggleFromEl / open
 */
(function (window, document) {
  'use strict';

  var KEY = 'specs_compare_v1';
  var BASE = (typeof window.SITE_BASE_PATH === 'string') ? window.SITE_BASE_PATH : '';
  var MAX = parseInt(window.SPECS_COMPARE_MAX || 4, 10) || 4;

  function read() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(raw) ? raw.filter(function (x) { return x && x.slug; }).slice(0, MAX) : [];
    } catch (e) { return []; }
  }
  function write(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch (e) {}
    syncCheckboxes();
    syncNavBadge();
  }

  /* Live count on the mobile tab bar's Compare tab */
  function syncNavBadge() {
    var el = document.getElementById('navCompareCount');
    if (!el) return;
    var n = read().length;
    el.textContent = n;
    el.classList.toggle('on', n > 0);
  }
  function slugs() { return read().map(function (x) { return x.slug; }); }

  /* ── toast ───────────────────────────────────────────────────── */
  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'sp-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }

  /* ── selection ───────────────────────────────────────────────── */
  function add(item) {
    if (!item || !item.slug) return false;
    var list = read();
    if (list.some(function (x) { return x.slug === item.slug; })) return true;
    if (list.length >= MAX) {
      toast('You can compare up to ' + MAX + ' devices');
      return false;
    }
    list.push({ slug: item.slug, name: item.name || item.slug, img: item.img || '' });
    write(list);
    toast(list.length === 1 ? 'Added — pick one more to compare' : 'Added to comparison (' + list.length + ')');
    return true;
  }
  function remove(slug) {
    write(read().filter(function (x) { return x.slug !== slug; }));
  }
  function clear() { write([]); }

  function toggleFromEl(el, checked) {
    if (!el) return;
    var item = { slug: el.getAttribute('data-cmp-slug'), name: el.getAttribute('data-cmp-name'), img: el.getAttribute('data-cmp-img') };
    if (checked) {
      if (!add(item)) {
        var cb = el.querySelector('input[type=checkbox]');
        if (cb) cb.checked = false;
      }
    } else {
      remove(item.slug);
    }
  }

  /* Toggle used by the button on the device page. */
  function toggleButton(btn) {
    var slug = btn.getAttribute('data-cmp-slug');
    var on = slugs().indexOf(slug) !== -1;
    if (on) {
      remove(slug);
    } else {
      add({ slug: slug, name: btn.getAttribute('data-cmp-name'), img: btn.getAttribute('data-cmp-img') });
    }
  }

  /**
   * Device-page "Compare" button: keep this phone in the selection and go
   * straight to the compare page, so the visitor lands with it already
   * loaded and only has to pick what to compare it against.
   */
  function compareThis(btn) {
    var slug = btn.getAttribute('data-cmp-slug');
    var list = read().filter(function (x) { return x.slug !== slug; });
    list.unshift({
      slug: slug,
      name: btn.getAttribute('data-cmp-name'),
      img: btn.getAttribute('data-cmp-img') || ''
    });
    write(list.slice(0, MAX));
    window.location.href = BASE + '/compare/?d=' + slugs().map(encodeURIComponent).join(',');
  }

  function syncCheckboxes() {
    var chosen = slugs();
    document.querySelectorAll('[data-cmp-slug]').forEach(function (el) {
      var on = chosen.indexOf(el.getAttribute('data-cmp-slug')) !== -1;
      var cb = el.querySelector('input[type=checkbox]');
      if (cb) cb.checked = on;
      el.classList.toggle('on', on);
      if (el.tagName === 'BUTTON' || el.tagName === 'A') {
        var lbl = el.querySelector('[data-cmp-label]');
        if (lbl) lbl.textContent = on ? 'Added to Compare' : 'Add to Compare';
      }
    });
  }

  /* ── sticky tray removed ─────────────────────────────────────── */
  function removeTray() {
    document.querySelectorAll('.cmp-bar').forEach(function (el) { el.remove(); });
  }

  function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(s) { return escHtml(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

  /* ── modal ───────────────────────────────────────────────────── */
  var modal = null;
  function buildModal() {
    modal = document.createElement('div');
    modal.className = 'sp-modal';
    modal.id = 'cmpModal';
    modal.innerHTML =
      '<div class="sp-modal-backdrop" onclick="SpecsCompare.close()"></div>' +
      '<div class="sp-modal-panel" role="dialog" aria-modal="true" aria-label="Compare devices">' +
      '  <div class="sp-modal-head">' +
      '    <h3>Compare Devices</h3>' +
      '    <div style="display:flex;gap:8px;align-items:center">' +
      '      <a class="sp-btn sp-btn-outline" style="height:34px;padding:0 12px;font-size:.76rem" id="cmpFullLink" href="#">Full page</a>' +
      '      <button type="button" onclick="SpecsCompare.close()" aria-label="Close">&times;</button>' +
      '    </div>' +
      '  </div>' +
      '  <div class="sp-modal-body" id="cmpModalBody"></div>' +
      '</div>';
    document.body.appendChild(modal);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('open')) close();
    });
  }

  function open() {
    var list = read();
    if (list.length < 2) { toast('Select at least 2 devices to compare'); return; }
    if (!modal) buildModal();
    var q = list.map(function (x) { return encodeURIComponent(x.slug); }).join(',');
    modal.querySelector('#cmpFullLink').href = BASE + '/compare/?d=' + q;
    var body = modal.querySelector('#cmpModalBody');
    body.innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8">Building comparison…</div>';
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    fetch(BASE + '/api/mm/compare-html?d=' + q, { credentials: 'same-origin' })
      .then(function (r) { return r.text(); })
      .then(function (html) { body.innerHTML = html; })
      .catch(function () { body.innerHTML = '<div style="padding:32px;text-align:center;color:#ef4444">Could not load the comparison.</div>'; });
  }

  function close() {
    if (modal) modal.classList.remove('open');
    document.body.style.overflow = '';
  }

  /* Called from the markup returned by ajax_compare.php */
  function removeAndRefresh(slug) {
    remove(slug);
    if (read().length >= 2) { open(); } else { close(); }
  }

  /* ── device picker (inside the modal + compare page) ─────────── */
  var searchTimer = null;
  function searchDevices(term, targetId, onPick) {
    var box = document.getElementById(targetId);
    if (!box) return;
    clearTimeout(searchTimer);
    if (!term || term.length < 2) { box.innerHTML = ''; return; }
    box.innerHTML = '<div style="padding:14px;color:#94a3b8;font-size:.8rem">Searching…</div>';
    searchTimer = setTimeout(function () {
      fetch(BASE + '/api/mm/search?q=' + encodeURIComponent(term) + '&exclude=' + encodeURIComponent(slugs().join(',')), { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (rows) {
          if (!rows.length) { box.innerHTML = '<div style="padding:14px;color:#94a3b8;font-size:.8rem">No devices found.</div>'; return; }
          box.innerHTML = rows.map(function (d) {
            return '<div class="cmp-result" onclick="SpecsCompare.pick(\'' + escAttr(d.slug) + '\',\'' + escAttr(d.name) + '\',\'' + escAttr(d.img) + '\')">' +
                   (d.img ? '<img src="' + escAttr(d.img) + '" alt="">' : '') +
                   '<div><div class="n">' + escHtml(d.name) + '</div><div class="m">' + escHtml(d.brand || '') + (d.price ? ' · ' + escHtml(d.price) : '') + '</div></div></div>';
          }).join('');
        })
        .catch(function () { box.innerHTML = '<div style="padding:14px;color:#ef4444;font-size:.8rem">Search failed.</div>'; });
    }, 280);
  }

  function pick(slug, name, img) {
    if (add({ slug: slug, name: name, img: img })) {
      if (typeof window.SPECS_COMPARE_PAGE !== 'undefined' && window.SPECS_COMPARE_PAGE) {
        window.location.href = BASE + '/compare/?d=' + slugs().map(encodeURIComponent).join(',');
      } else if (modal && modal.classList.contains('open')) {
        open();
      }
    }
  }

  /* ── boot ────────────────────────────────────────────────────── */
  function init() {
    removeTray();
    // A compare page seeds the selection from its URL so the tray matches.
    if (window.SPECS_COMPARE_SEED && Array.isArray(window.SPECS_COMPARE_SEED)) {
      write(window.SPECS_COMPARE_SEED);
    } else {
      syncCheckboxes();
      syncNavBadge();
    }
  }

  window.SpecsCompare = {
    add: add, remove: remove, clear: clear, open: open, close: close,
    toggleFromEl: toggleFromEl, toggleButton: toggleButton, compareThis: compareThis,
    removeAndRefresh: removeAndRefresh, search: searchDevices, pick: pick,
    list: read, count: function () { return read().length; },
    sync: function () { syncCheckboxes(); syncNavBadge(); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window, document);
