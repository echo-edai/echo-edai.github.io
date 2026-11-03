// 门户统一导航，教材继续负责原有交互。
const sidebar = document.querySelector('#portal-sidebar');
const currentProject = document.body.dataset.project;
let pendingHash = location.hash;
function targetFromHash(hash) {
  try {
    return document.getElementById(decodeURIComponent(hash.slice(1)));
  } catch {
    return null;
  }
}
function reveal(hash, scroll = true) {
  const target = targetFromHash(hash);
  if (!target) {
    pendingHash = hash;
    return false;
  }
  for (let node = target; node && node !== document.body; node = node.parentElement) {
    if (node.tagName === 'DETAILS') node.open = true;
  }
  if (scroll) target.scrollIntoView({ block: 'start', behavior: 'instant' });
  pendingHash = '';
  sidebar.querySelectorAll('.outline-link').forEach((link) => {
    const active = new URL(link.href).hash === hash && link.dataset.project === currentProject;
    link.classList.toggle('active', active);
    if (active) {
      link.setAttribute('aria-current', 'location');
      for (let node = link.parentElement; node && node !== sidebar; node = node.parentElement) {
        if (!node.matches('[data-outline-panel]')) continue;
        node.hidden = false;
        const control = sidebar.querySelector(`[aria-controls="${node.id}"]`);
        control?.setAttribute('aria-expanded', 'true');
        if (control?.dataset.outlineLabel)
          control.setAttribute('aria-label', `收起${control.dataset.outlineLabel}`);
      }
    } else link.removeAttribute('aria-current');
  });
  return true;
}
sidebar.addEventListener('click', (event) => {
  const link = event.target.closest('.outline-link');
  if (!link || new URL(link.href).pathname !== location.pathname) return;
  event.preventDefault();
  const hash = new URL(link.href).hash;
  if (link.closest('.chapter-outline')) {
    const filter = document.querySelector('.reader-content #course-filter');
    if (filter?.tagName === 'SELECT' && filter.value !== 'all') {
      filter.value = 'all';
      filter.dispatchEvent(new Event('change'));
    }
    const query = document.querySelector('.reader-content #course-query');
    if (query?.value) {
      query.value = '';
      query.dispatchEvent(new Event('input'));
    }
    [...document.querySelectorAll('.reader-content button')]
      .find((button) => button.textContent.trim() === '全部课程')
      ?.click();
  }
  // 复用教材自身的筛选重置与章节展开逻辑。
  const nativeLink = [
    ...document.querySelectorAll('#sidebar a[href], #rail a[href], #course-index a[href]'),
  ].find((item) => item.getAttribute('href') === hash);
  nativeLink?.click();
  if (location.hash !== hash) history.pushState(null, '', hash);
  reveal(hash);
});
window.addEventListener('hashchange', () => reveal(location.hash));
window.addEventListener('popstate', () => reveal(location.hash));
// 等待异步课程准备完毕后再定位章节。
const courseStatus = document.querySelector('.reader-status');
function updateCourseStatus() {
  if (!courseStatus || courseStatus.dataset.ready === 'true') return;
  const expected = Number(document.body.dataset.readerChapters || 0);
  const count = document.querySelectorAll('.reader-content .chapter').length;
  if (count >= expected && expected > 0) {
    courseStatus.textContent = `${count} 章课程已就绪`;
    courseStatus.dataset.ready = 'true';
  }
}
const observer = new MutationObserver(() => {
  if (pendingHash) reveal(pendingHash);
  updateCourseStatus();
});
observer.observe(document.querySelector('.reader-content'), { childList: true, subtree: true });
if (pendingHash) reveal(pendingHash);
updateCourseStatus();

document.querySelector('[data-reader-search]')?.addEventListener('click', () => {
  const trigger = document.querySelector(
    '.reader-content #search-open, .reader-content [data-search-open], .reader-content [data-command]',
  );
  trigger?.click();
});
const notesButton = document.querySelector('[data-reader-notes]');
const notesTrigger = document.querySelector('.reader-content #notes-open');
if (!notesTrigger) notesButton.hidden = true;
else notesButton.addEventListener('click', () => notesTrigger.click());
