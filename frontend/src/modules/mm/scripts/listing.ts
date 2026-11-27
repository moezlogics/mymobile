/* eslint-disable */
/**
 * devices.php inline script — filter drawer + infinite scroll. Verbatim,
 * except the load-more fetch goes to /api/mm/listing (the PHP version asked
 * the same page for JSON with ?load_more=1) and the sort <select> auto-submit
 * (an inline onchange on PHP) is wired here.
 */
export const LISTING_JS = `
window.toggleFilters = function(open){
  var p = document.getElementById('spFilters');
  var b = document.getElementById('fltBackdrop');
  if(!p) return;
  p.classList.toggle('open', open);
  b.classList.toggle('show', open);
  document.body.style.overflow = open ? 'hidden' : '';
};
if (!window.__mmFltEsc) { window.__mmFltEsc = true; document.addEventListener('keydown', function(e){ if(e.key === 'Escape') window.toggleFilters(false); }); }
document.querySelectorAll('.sp-sort select').forEach(function(s){ s.addEventListener('change', function(){ s.form.submit(); }); });

(function(){
  var grid = document.getElementById('listingGrid');
  var more = document.getElementById('listingLoadMore');
  if(!grid || !more || !('IntersectionObserver' in window)) return;
  var nextUrl = more.getAttribute('data-next-url');
  var busy = false;
  async function loadMore(){
    if(busy || !nextUrl) return;
    busy = true;
    more.classList.add('loading');
    try{
      var url = new URL(nextUrl, window.location.origin);
      var api = '/api/mm/listing?path=' + encodeURIComponent(url.pathname) + (url.search ? '&' + url.search.slice(1) : '');
      var res = await fetch(api, { headers: { 'X-Requested-With': 'fetch' } });
      if(!res.ok) throw new Error('Load failed');
      var data = await res.json();
      if(data.html){
        grid.insertAdjacentHTML('beforeend', data.html);
      }
      nextUrl = data.next_url || '';
      if(!nextUrl){
        more.remove();
        obs.disconnect();
        return;
      }
      more.setAttribute('data-next-url', nextUrl);
    }catch(e){
      more.classList.remove('loading');
      more.innerHTML = '<a class="sp-btn sp-btn-outline" href="' + nextUrl + '">Load more</a>';
      obs.disconnect();
      return;
    }
    busy = false;
    more.classList.remove('loading');
  }
  var obs = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(entry.isIntersecting) loadMore();
    });
  }, { rootMargin: '300px 0px' });
  obs.observe(more);
})();
`
