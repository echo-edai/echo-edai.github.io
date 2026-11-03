const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// 手机抽屉锁定焦点，桌面保留折叠偏好。
const menu = $('.portal-menu-button');
const collapseControl = $('.sidebar-collapse-control');
const sidebar = $('#portal-sidebar');
const backdrop = $('#portal-backdrop');
const portalShell = $('.portal-shell');
const narrowViewport = matchMedia('(max-width: 960px)');
let sidebarCollapsed = false;
try {
  sidebarCollapsed = localStorage.getItem('echo-portal-sidebar-collapsed') === 'true';
} catch {
  /* 存储不可用时仍可操作。 */
}
function syncSidebar() {
  if (!sidebar || !menu) return;
  const mobile = narrowViewport.matches;
  const open = mobile ? document.body.classList.contains('sidebar-open') : !sidebarCollapsed;
  document.body.classList.toggle('sidebar-collapsed', !mobile && sidebarCollapsed);
  sidebar.inert = mobile && !open;
  portalShell.inert = mobile && open;
  backdrop.hidden = !mobile || !open;
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? '收起侧边栏' : '展开侧边栏');
  if (collapseControl) {
    collapseControl.setAttribute('aria-expanded', String(open));
    collapseControl.setAttribute('aria-label', open ? '收起侧边栏' : '展开侧边栏');
    $('.collapse-label', collapseControl).textContent = open ? '收起侧边栏' : '展开侧边栏';
  }
}
function closeSidebar(restoreFocus = false) {
  document.body.classList.remove('sidebar-open');
  syncSidebar();
  if (restoreFocus) menu?.focus();
}
menu?.addEventListener('click', () => {
  if (narrowViewport.matches) {
    document.body.classList.add('sidebar-open');
    syncSidebar();
    $('.sidebar-close').focus();
  } else {
    sidebarCollapsed = !sidebarCollapsed;
    try {
      localStorage.setItem('echo-portal-sidebar-collapsed', String(sidebarCollapsed));
    } catch {
      /* 存储不可用时只保留当前状态。 */
    }
    syncSidebar();
  }
});
$('.sidebar-close')?.addEventListener('click', () => closeSidebar(true));
collapseControl?.addEventListener('click', () => menu.click());
backdrop?.addEventListener('click', () => closeSidebar(true));
sidebar?.addEventListener('click', (event) => {
  if (event.target.closest('a')) closeSidebar();
});
narrowViewport.addEventListener('change', () => closeSidebar());
document.addEventListener('keydown', (event) => {
  if (!document.body.classList.contains('sidebar-open')) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeSidebar(true);
  }
  if (event.key === 'Tab') {
    const items = $$('a[href],button', sidebar).filter((node) => node.getClientRects().length);
    const first = items[0],
      last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});
syncSidebar();
$$('[data-outline-toggle]').forEach((button) =>
  button.addEventListener('click', () => {
    const panel = document.getElementById(button.getAttribute('aria-controls'));
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', `${open ? '收起' : '展开'}${button.dataset.outlineLabel}`);
    panel.hidden = !open;
  }),
);
$('.toc-toggle')?.addEventListener('click', (event) => {
  const button = event.currentTarget;
  const open = button.getAttribute('aria-expanded') !== 'true';
  button.setAttribute('aria-expanded', String(open));
  button.setAttribute('aria-label', open ? '收起本页目录' : '展开本页目录');
  $('#article-toc-links').hidden = !open;
  document.body.classList.toggle('toc-collapsed', !open);
});
$$('[data-year]').forEach((node) => {
  node.textContent = new Date().getFullYear();
});

const search = $('#project-search');
if (search) {
  search.value = new URLSearchParams(location.search).get('q') || '';
  document.addEventListener('keydown', (event) => {
    if (
      event.key === '/' &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.target.closest('input,textarea,select,[contenteditable="true"]')
    ) {
      event.preventDefault();
      search.focus();
    }
    if (event.key === 'Escape' && document.activeElement === search) {
      search.value = '';
      search.dispatchEvent(new Event('input'));
      search.blur();
    }
  });
}

if ($('#home') && 'IntersectionObserver' in window) {
  const labels = { home: '空间概览', explore: '全部探索', journal: '最近动态', about: '关于我' };
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        if (entry.isIntersecting) {
          $$('.sidebar-link[data-portal-page]').forEach((link) => {
            const active = link.dataset.portalPage === entry.target.id;
            link.classList.toggle('active', active);
            if (active) link.setAttribute('aria-current', 'location');
            else link.removeAttribute('aria-current');
          });
          $('#portal-context').textContent = labels[entry.target.id];
        }
    },
    { rootMargin: '-15% 0px -55% 0px', threshold: 0 },
  );
  Object.keys(labels).forEach((id) => sectionObserver.observe($('#' + id)));
}

function revealSections() {
  if (reducedMotion.matches || !('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
    },
    { threshold: 0.08 },
  );
  $$('.reveal').forEach((node) => {
    node.classList.add('ready');
    observer.observe(node);
  });
}
revealSections();

const architectureArt = `<div class="project-art"><span class="art-corner">NAPLESPU / SYSTEM ATLAS</span><svg viewBox="0 0 620 310" aria-hidden="true"><defs><pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="#98b579" opacity=".2"/></pattern><linearGradient id="chip" x2="1" y2="1"><stop stop-color="#3e522e"/><stop offset="1" stop-color="#1e2919"/></linearGradient></defs><rect width="620" height="310" fill="url(#dots)"/><g transform="translate(310 157) scale(1 .54) rotate(-30)"><g stroke="#7fa957" stroke-width="1" opacity=".45" fill="none"><path d="M-250-105H-165V-70H-95M-245-45H-175V-15H-95M-245 25H-155V40H-95M-240 90H-165V80H-95M95-70H145V-125H235M95-20H185V-60H245M95 35H155V65H250M95 80H185V125H235"/><path d="M-60-95V-140H-140M0-95V-155H60M60-95V-130H145M-60 95V135H-140M0 95V150H60M60 95V130H140"/></g><rect x="-110" y="-110" width="220" height="220" rx="9" fill="#151e11" stroke="#769951"/><rect x="-94" y="-94" width="188" height="188" rx="4" fill="url(#chip)" stroke="#9dc975"/><g fill="#92bf62" stroke="#badb9d" stroke-width=".6"><rect x="-72" y="-72" width="32" height="32"/><rect x="-24" y="-72" width="32" height="32"/><rect x="24" y="-72" width="32" height="32"/><rect x="-72" y="-24" width="32" height="32"/><rect x="-24" y="-24" width="32" height="32" fill="#d0fc96"/><rect x="24" y="-24" width="32" height="32"/><rect x="-72" y="24" width="32" height="32"/><rect x="-24" y="24" width="32" height="32"/><rect x="24" y="24" width="32" height="32"/></g><g stroke="#a6d378" stroke-width="1" opacity=".6"><path d="M-56-72V56M-8-72V56M40-72V56M-72-56H56M-72-8H56M-72 40H56"/></g><g fill="#c2f970"><circle cx="-245" cy="-45" r="4"/><circle cx="235" cy="-125" r="4"/><circle cx="60" cy="150" r="4"/><circle cx="-140" cy="-140" r="3"/></g></g><text x="44" y="264" fill="#afc79c" font-family="monospace" font-size="9" letter-spacing="2">CODE → CORE → CONNECTION</text></svg><span class="art-caption">CONCEPTUAL ILLUSTRATION / 概念示意</span></div>`;

const grid = $('#project-grid');
if (grid) {
  try {
    const response = await fetch(new URL('../data/site.json', import.meta.url), {
      cache: 'no-cache',
    });
    if (!response.ok) throw new Error(`Content unavailable: ${response.status}`);
    const data = await response.json();
    const availableFilters = new Set(['all', 'interactive', 'notes', 'research']);
    const savedFilter = new URLSearchParams(location.search).get('type');
    let filter = availableFilters.has(savedFilter) ? savedFilter : 'all';
    const kind = (project) =>
      project.category === 'research'
        ? 'research'
        : project.href.startsWith('projects/')
          ? 'interactive'
          : 'notes';
    const buildCard = (project, index) => {
      const card = document.createElement('a');
      card.href = project.href;
      card.className = `project-card ${project.featured ? 'featured' : 'compact'}`;
      card.dataset.kind = kind(project);
      if (project.image) {
        const art = document.createElement('div');
        art.className = 'project-art';
        const image = document.createElement('img');
        image.src = project.image;
        image.alt = project.imageAlt || project.title;
        image.loading = 'lazy';
        image.decoding = 'async';
        image.width = 1280;
        image.height = 720;
        const label = document.createElement('span');
        label.className = 'art-corner';
        label.textContent = project.artLabel || project.title;
        const caption = document.createElement('span');
        caption.className = 'art-caption';
        caption.textContent = project.imageCaption || 'CONCEPTUAL ILLUSTRATION / 概念示意';
        art.append(image, label, caption);
        card.append(art);
      } else if (project.featured) card.innerHTML = architectureArt;
      else {
        const heading = document.createElement('div');
        heading.className = 'card-note-heading';
        heading.innerHTML = `<span class="note-symbol" aria-hidden="true">${kind(project) === 'research' ? '↗' : '≡'}</span><span>${kind(project) === 'research' ? 'OPEN NOTEBOOK' : 'READING NOTES'}</span>`;
        card.append(heading);
      }
      const body = document.createElement('div');
      body.className = 'project-body';
      body.innerHTML =
        '<div class="project-meta"><span class="category"></span><span class="separator"></span><span class="format"></span><span class="number"></span></div><h3></h3><p></p><div class="project-tags"></div><span class="card-arrow" aria-hidden="true">↗</span>';
      $('.category', body).textContent = project.categoryLabel;
      $('.format', body).textContent = project.chapters
        ? `${project.chapters} 章 · ${project.lessons} 节`
        : project.format;
      $('.number', body).textContent = String(index + 1).padStart(2, '0');
      $('h3', body).textContent = project.title;
      $('p', body).textContent = project.description;
      project.tags.slice(0, 3).forEach((tag) => {
        const span = document.createElement('span');
        span.textContent = tag;
        $('.project-tags', body).append(span);
      });
      card.append(body);
      return card;
    };
    function render() {
      const query = search.value.trim().toLocaleLowerCase();
      const projects = data.projects.filter(
        (project) =>
          (filter === 'all' || kind(project) === filter) &&
          `${project.title} ${project.description} ${project.tags.join(' ')}`
            .toLocaleLowerCase()
            .includes(query),
      );
      grid.replaceChildren(
        ...projects.map((project) => buildCard(project, data.projects.indexOf(project))),
      );
      grid.hidden = projects.length === 0;
      $('#empty-state').hidden = projects.length !== 0;
      $('#filter-status').textContent =
        `共 ${data.projects.length} 项内容，当前显示 ${projects.length} 项`;
      $('#total-count').textContent = String(data.projects.length).padStart(2, '0');
      grid.setAttribute('aria-busy', 'false');
      $$('.filters button').forEach((button) => {
        const active = button.dataset.filter === filter;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      const url = new URL(location.href);
      if (search.value.trim()) url.searchParams.set('q', search.value.trim());
      else url.searchParams.delete('q');
      if (filter !== 'all') url.searchParams.set('type', filter);
      else url.searchParams.delete('type');
      history.replaceState(history.state, '', url);
    }
    $$('.filters button').forEach((button) =>
      button.addEventListener('click', () => {
        filter = button.dataset.filter;
        render();
      }),
    );
    search.addEventListener('input', render);
    window.addEventListener('popstate', () => {
      const params = new URLSearchParams(location.search);
      search.value = params.get('q') || '';
      filter = availableFilters.has(params.get('type')) ? params.get('type') : 'all';
      render();
    });
    $('#reset-filters').addEventListener('click', () => {
      search.value = '';
      $('[data-filter="all"]').click();
      search.focus();
    });
    $('.portal-search').addEventListener('submit', (event) => {
      event.preventDefault();
      $('#explore').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    });
    for (const update of data.updates) {
      const link = document.createElement('a');
      link.className = 'journal-entry';
      link.href = update.href;
      link.innerHTML =
        '<time></time><div><h3></h3><p></p><span class="update-type"></span></div><span class="journal-arrow" aria-hidden="true">↗</span>';
      $('time', link).dateTime = update.date;
      $('time', link).textContent = update.date.replaceAll('-', '.');
      $('h3', link).textContent = update.title;
      $('p', link).textContent = update.description;
      $('.update-type', link).textContent = update.type;
      $('#journal-list').append(link);
    }
    render();
  } catch (error) {
    grid.innerHTML =
      '<div class="noscript-links"><p>探索目录暂时无法加载，可通过侧边栏直接进入教材或笔记。</p><a href="projects/opentpu/">openTPU ↗</a><a href="projects/coral-npu/">Coral NPU ↗</a><a href="projects/gemmini/">Gemmini ↗</a></div>';
    console.error(error);
  }
}

// 概念动效仅在可见时绘制，尊重系统减少动态效果设置。
const canvas = $('#signal-canvas');
if (canvas) {
  const ctx = canvas.getContext('2d');
  const toggle = $('#motion-toggle');
  if (ctx) {
    let width = 0,
      height = 0,
      frame = 0,
      paused = reducedMotion.matches,
      visible = true,
      phase = 0,
      lastTime = 0;
    let pointer = { x: 0, y: 0 },
      target = { x: 0, y: 0 };
    const nodes = [];
    for (let layer = 0; layer < 3; layer++)
      for (let x = 0; x < 6; x++)
        for (let z = 0; z < 6; z++)
          nodes.push({
            x: (x - 2.5) * 39,
            y: (layer - 1) * 57,
            z: (z - 2.5) * 39,
            layer,
            gx: x,
            gz: z,
          });
    const edges = [];
    nodes.forEach((a, i) =>
      nodes.forEach((b, j) => {
        if (
          j > i &&
          ((a.layer === b.layer && Math.abs(a.gx - b.gx) + Math.abs(a.gz - b.gz) === 1) ||
            (a.gx === b.gx && a.gz === b.gz && b.layer - a.layer === 1))
        )
          edges.push([i, j]);
      }),
    );
    function resize() {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }
    function draw() {
      ctx.clearRect(0, 0, width, height);
      const scale = Math.min(width / 390, height / 300);
      const angle = 0.63 + Math.sin(phase * 0.12) * 0.16 + pointer.x * 0.1;
      const projected = nodes.map((node) => {
        const x = node.x * Math.cos(angle) - node.z * Math.sin(angle);
        const z = node.x * Math.sin(angle) + node.z * Math.cos(angle);
        return {
          x: width / 2 + x * scale,
          y: height / 2 + (z * 0.4 + node.y * 0.85 + pointer.y * 10) * scale,
          depth: z,
          layer: node.layer,
        };
      });
      for (const [a, b] of edges) {
        const p = projected[a],
          q = projected[b];
        ctx.strokeStyle = `rgba(155,191,117,${p.layer === 1 ? 0.17 : 0.09})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
      projected.forEach((point, index) => {
        const bright = 0.3 + (Math.sin(index * 2.2 + phase * 0.65) + 1) * 0.18;
        ctx.fillStyle = `rgba(190,240,140,${bright})`;
        ctx.beginPath();
        ctx.arc(point.x, point.y, point.layer === 1 ? 1.8 : 1.2, 0, Math.PI * 2);
        ctx.fill();
      });
      for (let i = 0; i < 10; i++) {
        const path = edges[(i * 31 + 7) % edges.length];
        const p = projected[path[0]],
          q = projected[path[1]],
          progress = (phase * 0.25 + i * 0.137) % 1;
        const x = p.x + (q.x - p.x) * progress,
          y = p.y + (q.y - p.y) * progress;
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#c2f970';
        ctx.fillStyle = '#d5ff9f';
        ctx.beginPath();
        ctx.arc(x, y, 2.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.strokeStyle = '#758c5c';
      ctx.lineWidth = 0.6;
      for (const [x, y, sx, sy] of [
        [18, 27, 1, 1],
        [width - 18, 27, -1, 1],
        [18, height - 27, 1, -1],
        [width - 18, height - 27, -1, -1],
      ]) {
        ctx.beginPath();
        ctx.moveTo(x, y + sy * 11);
        ctx.lineTo(x, y);
        ctx.lineTo(x + sx * 11, y);
        ctx.stroke();
      }
    }
    function tick(time) {
      frame = 0;
      if (paused || !visible || document.hidden) return;
      if (time - lastTime > 30) {
        phase += Math.min((time - (lastTime || time)) / 1000, 0.06);
        lastTime = time;
        pointer.x += (target.x - pointer.x) * 0.07;
        pointer.y += (target.y - pointer.y) * 0.07;
        draw();
      }
      frame = requestAnimationFrame(tick);
    }
    function sync() {
      cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
      toggle.setAttribute('aria-pressed', String(paused));
      toggle.innerHTML = paused
        ? '播放动效 <span aria-hidden="true">▷</span>'
        : '暂停动效 <span aria-hidden="true">Ⅱ</span>';
      if (!paused && visible && !document.hidden) frame = requestAnimationFrame(tick);
      else draw();
    }
    toggle.addEventListener('click', () => {
      paused = !paused;
      sync();
    });
    reducedMotion.addEventListener('change', (event) => {
      paused = event.matches;
      sync();
    });
    canvas.addEventListener('pointermove', (event) => {
      const rect = canvas.getBoundingClientRect();
      target = {
        x: (event.clientX - rect.left) / rect.width - 0.5,
        y: (event.clientY - rect.top) / rect.height - 0.5,
      };
    });
    canvas.addEventListener('pointerleave', () => {
      target = { x: 0, y: 0 };
    });
    document.addEventListener('visibilitychange', sync);
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
    else window.addEventListener('resize', resize);
    if ('IntersectionObserver' in window)
      new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        sync();
      }).observe(canvas);
    resize();
    sync();
  } else toggle.hidden = true;
}

const progress = $('.reading-progress');
if (progress) {
  function updateProgress() {
    const distance = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${distance > 0 ? Math.min(scrollY / distance, 1) : 1})`;
  }
  addEventListener('scroll', updateProgress, { passive: true });
  addEventListener('resize', updateProgress);
  updateProgress();
}
