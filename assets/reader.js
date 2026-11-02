// The original course apps keep their interactions; the portal owns navigation.
const sidebar = document.querySelector('#portal-sidebar');
const currentProject = document.body.dataset.project;
let pendingHash = location.hash;
function targetFromHash(hash) {
  try { return document.getElementById(decodeURIComponent(hash.slice(1))); } catch { return null; }
}
function reveal(hash, scroll = true) {
  const target = targetFromHash(hash);
  if (!target) { pendingHash = hash; return false; }
  for (let node = target; node && node !== document.body; node = node.parentElement) {
    if (node.tagName === 'DETAILS') node.open = true;
  }
  if (scroll) target.scrollIntoView({ block: 'start', behavior: 'instant' });
  pendingHash = '';
  sidebar.querySelectorAll('.outline-link').forEach(link => {
    const active = new URL(link.href).hash === hash && link.dataset.project === currentProject;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
  });
  return true;
}
sidebar.addEventListener('click', event => {
  const link = event.target.closest('.outline-link');
  if (!link || new URL(link.href).pathname !== location.pathname) return;
  event.preventDefault();
  const hash = new URL(link.href).hash;
  if (link.closest('.chapter-outline')) {
    const filter = document.querySelector('.reader-content #course-filter');
    if (filter?.tagName === 'SELECT' && filter.value !== 'all') { filter.value = 'all'; filter.dispatchEvent(new Event('change')); }
    const query = document.querySelector('.reader-content #course-query');
    if (query?.value) { query.value = ''; query.dispatchEvent(new Event('input')); }
    [...document.querySelectorAll('.reader-content button')].find(button => button.textContent.trim() === '全部课程')?.click();
  }
  // Preserve each course's own filter-reset and chapter-opening behavior.
  const nativeLink = [...document.querySelectorAll('#sidebar a[href], #rail a[href], #course-index a[href]')].find(item => item.getAttribute('href') === hash);
  nativeLink?.click();
  if (location.hash !== hash) history.pushState(null, '', hash);
  reveal(hash);
});
window.addEventListener('hashchange', () => reveal(location.hash));
window.addEventListener('popstate', () => reveal(location.hash));
// Coral and the other course apps populate chapters asynchronously.
const observer = new MutationObserver(() => { if (pendingHash) reveal(pendingHash); });
observer.observe(document.querySelector('.reader-content'), { childList: true, subtree: true });
if (pendingHash) reveal(pendingHash);

document.querySelector('[data-reader-search]')?.addEventListener('click', () => {
  const trigger = document.querySelector('.reader-content #search-open, .reader-content [data-search-open], .reader-content [data-command]');
  trigger?.click();
});
const notesButton = document.querySelector('[data-reader-notes]');
const notesTrigger = document.querySelector('.reader-content #notes-open');
if (!notesTrigger) notesButton.hidden = true;
else notesButton.addEventListener('click', () => notesTrigger.click());

// Keep the shared index open at the active chapter when opening a deep link.
if (location.hash) {
  const matching = [...sidebar.querySelectorAll('.outline-link')].find(link => link.dataset.project === currentProject && new URL(link.href).hash === location.hash);
  if (matching) {
    for (let node = matching.parentElement; node && node !== sidebar; node = node.parentElement) {
      if (node.matches('[data-outline-panel]')) {
        node.hidden = false;
        const control = sidebar.querySelector(`[aria-controls="${node.id}"]`);
        control?.setAttribute('aria-expanded', 'true');
        if (control?.dataset.outlineLabel) control.setAttribute('aria-label', `收起${control.dataset.outlineLabel}`);
      }
    }
  }
}
