// EM Learn: a small offline-first learning app on top of awesome-engineering-management.
// No framework, no build step. State lives in localStorage on your device.

const STORE_KEY = 'emlearn:v1';
const view = document.getElementById('view');
const titleEl = document.getElementById('title');
const backBtn = document.getElementById('back');

/* ---------- Utilities ---------- */

const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const dayKey = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
const addDays = (n, from = new Date()) => {
  const d = new Date(from);
  d.setDate(d.getDate() + n);
  return dayKey(d);
};
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const host = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
};
const KIND_LABEL = {
  book: 'Book', paper: 'Paper', wiki: 'Wikipedia', video: 'Video', repo: 'GitHub',
  article: 'Article', course: 'Course', podcast: 'Podcast',
};
const CHEV = '<svg class="chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function ring(value, size = 64) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${value}% complete">
    <circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}"/>
    <circle class="value" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - value / 100)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central">${value}%</text>
  </svg>`;
}
const bar = (value) => `<div class="bar" aria-hidden="true"><i style="width:${value}%"></i></div>`;

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ---------- State ---------- */

const emptyState = () => ({ read: {}, topics: {}, days: {}, recent: [] });
let state = load();

function load() {
  try { return { ...emptyState(), ...JSON.parse(localStorage.getItem(STORE_KEY)) }; } catch { return emptyState(); }
}
function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  updateBadge();
}
function logActivity() {
  const k = dayKey();
  state.days[k] = (state.days[k] || 0) + 1;
}
function touchRecent(topicId) {
  state.recent = [topicId, ...state.recent.filter((id) => id !== topicId)].slice(0, 8);
}
const topicState = (id) => (state.topics[id] ||= {});

function toggleRead(linkId, force) {
  const on = force ?? !state.read[linkId];
  if (on) {
    if (!state.read[linkId]) logActivity();
    state.read[linkId] = Date.now();
  } else delete state.read[linkId];
  const topic = topicOfLink.get(linkId);
  if (topic) touchRecent(topic.id);
  save();
  return on;
}

// Spaced repetition, simplified: each rating sets the next review interval.
const RATINGS = [
  { key: 'again', label: 'Again', hint: 'Not yet' },
  { key: 'hard', label: 'Hard', hint: 'Shaky' },
  { key: 'good', label: 'Good', hint: 'Got it' },
  { key: 'easy', label: 'Easy', hint: 'Solid' },
];
function nextInterval(prev, rating) {
  if (rating === 'again') return 1;
  if (!prev) return { hard: 2, good: 4, easy: 8 }[rating];
  const mult = { hard: 1.3, good: 2.5, easy: 3.5 }[rating];
  return Math.min(180, Math.max(prev + 1, Math.round(prev * mult)));
}
function rateTopic(id, rating) {
  const ts = topicState(id);
  ts.interval = nextInterval(ts.interval, rating);
  ts.due = addDays(ts.interval);
  ts.rating = rating;
  ts.reviews = (ts.reviews || 0) + 1;
  ts.last = Date.now();
  logActivity();
  touchRecent(id);
  save();
  return ts;
}

/* ---------- Content ---------- */

let content;
let topics = [];
const topicById = new Map();
const areaById = new Map();
const topicOfLink = new Map();

async function loadContent() {
  const res = await fetch('data/content.json');
  content = await res.json();
  for (const track of content.tracks) {
    for (const area of track.areas) {
      area.track = track;
      areaById.set(area.id, area);
      for (const t of area.topics) {
        t.area = area;
        t.track = track;
        topics.push(t);
        topicById.set(t.id, t);
        t.links.forEach((l) => topicOfLink.set(l.id, t));
      }
    }
  }
}

const readCount = (t) => t.links.filter((l) => state.read[l.id]).length;
function status(t) {
  const ts = state.topics[t.id];
  if (ts?.interval >= 21) return { key: 'mastered', label: 'Mastered', cls: 'good' };
  if (ts?.reviews) return { key: 'learning', label: 'Learning', cls: 'accent' };
  if (readCount(t)) return { key: 'started', label: 'Started', cls: 'warn' };
  return { key: 'new', label: 'New', cls: '' };
}
// A topic counts as "learned" once you've rated it at least once.
const isLearned = (t) => !!state.topics[t.id]?.reviews;
const dueTopics = () => {
  const today = dayKey();
  return topics.filter((t) => state.topics[t.id]?.due && state.topics[t.id].due <= today);
};
function progressOf(list) {
  const links = list.flatMap((t) => t.links);
  return {
    links: links.length,
    read: links.filter((l) => state.read[l.id]).length,
    topics: list.length,
    learned: list.filter(isLearned).length,
  };
}
// Mix of reading and understanding: 50% links read, 50% topics rated.
const score = (p) => Math.round((pct(p.read, p.links) + pct(p.learned, p.topics)) / 2);

function streak() {
  let n = 0;
  let d = new Date();
  if (!state.days[dayKey(d)]) d.setDate(d.getDate() - 1); // today not done yet doesn't break it
  while (state.days[dayKey(d)]) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

function topicOfTheDay() {
  const pool = topics.filter((t) => !isLearned(t) && t.track.title !== 'Laws to live by');
  if (!pool.length) return null;
  const seed = [...dayKey()].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return pool[seed % pool.length];
}

function updateBadge() {
  const n = topics.length ? dueTopics().length : 0;
  const b = document.getElementById('due-badge');
  b.hidden = !n;
  b.textContent = n;
}

/* ---------- Shared fragments ---------- */

function topicRow(t, sub) {
  const s = status(t);
  const r = readCount(t);
  return `<a class="row" href="#/topic/${t.id}">
    <div class="grow">
      <div class="name">${esc(t.title)}</div>
      <div class="sub">${sub ?? `${r}/${t.links.length} read`}</div>
      ${bar(pct(r, t.links.length))}
    </div>
    ${s.key !== 'new' ? `<span class="chip ${s.cls}">${s.label}</span>` : ''}
    ${CHEV}
  </a>`;
}

function linkRow(l, opts = {}) {
  const done = !!state.read[l.id];
  const meta = [`<span class="chip">${KIND_LABEL[l.kind] || 'Link'}</span>`, `<span>${esc(host(l.url))}</span>`];
  if (opts.topic) meta.push(`<a href="#/topic/${opts.topic.id}">${esc(opts.topic.title)}</a>`);
  return `<div class="link-row${done ? ' done' : ''}" data-link="${l.id}">
    <button class="check" data-action="toggle" data-id="${l.id}" aria-pressed="${done}" aria-label="Mark “${esc(l.title)}” as read">${TICK}</button>
    <div class="grow">
      <a class="title" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" data-action="open" data-id="${l.id}">${opts.titleHtml ?? esc(l.title)}</a>
      ${l.desc ? `<div class="desc">${opts.descHtml ?? esc(l.desc)}</div>` : ''}
      <div class="meta">${meta.join('')}</div>
    </div>
  </div>`;
}

// When an area holds just one topic of the same name (e.g. Learning > Books), skip the area level.
const areaHref = (a) =>
  a.topics.length === 1 ? `#/topic/${a.topics[0].id}` : `#/area/${a.id}`;

/* ---------- Views ---------- */

function homeView() {
  const p = progressOf(topics);
  const tod = topicOfTheDay();
  const due = dueTopics().length;
  const recent = state.recent.map((id) => topicById.get(id)).filter(Boolean).slice(0, 3);

  let html = `<section class="card hero">
    <div class="hero-top">
      ${ring(score(p), 72)}
      <div>
        <h2>${p.read || p.learned ? 'Keep going' : 'Start learning'}</h2>
        <div class="muted small">${plural(p.topics, 'topic')} · ${plural(p.links, 'resource')}</div>
      </div>
    </div>
    <div class="stats">
      <div class="stat"><b>${p.read}</b><span>read</span></div>
      <div class="stat"><b>${p.learned}</b><span>learned</span></div>
      <div class="stat"><b>${streak()}</b><span>day streak</span></div>
    </div>
  </section>`;

  if (due) {
    html += `<div class="section-label">Due today</div>
      <a class="card row" href="#/review"><div class="grow"><div class="name">${plural(due, 'topic')} to review</div>
      <div class="sub">A quick recap keeps it from fading</div></div>${CHEV}</a>`;
  }
  if (tod) {
    html += `<div class="section-label">Topic of the day</div>
      <a class="card today" href="#/topic/${tod.id}">
        <div class="eyebrow">${esc(tod.area.title)}</div>
        <h3>${esc(tod.title)}</h3>
        <p>${plural(tod.links.length, 'resource')} · ${readCount(tod)} read</p>
      </a>`;
  }
  if (recent.length) {
    html += `<div class="section-label">Continue</div><div class="card">${recent.map((t) => topicRow(t)).join('')}</div>`;
  }
  for (const track of content.tracks) {
    html += `<div class="section-label">${esc(track.title)}</div><div class="card">`;
    for (const a of track.areas) {
      const ap = progressOf(a.topics);
      const sub = a.topics.length === 1
        ? `${ap.read}/${ap.links} read`
        : `${ap.learned}/${ap.topics} topics learned · ${ap.read}/${ap.links} read`;
      html += `<a class="row" href="${areaHref(a)}"><div class="grow">
        <div class="name">${esc(a.title)}</div><div class="sub">${sub}</div>${bar(score(ap))}
      </div>${CHEV}</a>`;
    }
    html += `</div>`;
  }
  html += `<p class="footer-note">Content from <a href="${content.source}" target="_blank" rel="noopener">awesome-engineering-management</a> (CC0).</p>`;
  return { title: 'EM Learn', tab: 'home', html };
}

function areaView(id) {
  const a = areaById.get(id);
  if (!a) return notFound();
  const p = progressOf(a.topics);
  return {
    title: a.title,
    tab: 'home',
    back: true,
    html: `<section class="card hero"><div class="hero-top">${ring(score(p))}
      <div><div class="crumbs">${esc(a.track.title)}</div><h2>${esc(a.title)}</h2>
      <div class="muted small">${p.learned}/${p.topics} topics learned · ${p.read}/${p.links} read</div></div></div></section>
      <div class="section-label">Topics</div>
      <div class="card">${a.topics.map((t) => topicRow(t)).join('')}</div>`,
  };
}

function topicView(id) {
  const t = topicById.get(id);
  if (!t) return notFound();
  const ts = state.topics[t.id] || {};
  const s = status(t);
  const r = readCount(t);
  const siblings = t.area.topics;
  const i = siblings.indexOf(t);
  const prev = siblings[i - 1];
  const next = siblings[i + 1];

  const groups = new Map();
  for (const l of t.links) {
    const g = l.group || '';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(l);
  }
  let links = '';
  for (const [g, ls] of groups) {
    links += `<div class="group-title">${esc(g || 'Start here')}</div><div class="card">${ls.map((l) => linkRow(l)).join('')}</div>`;
  }

  const reviewLine = ts.due
    ? (ts.due <= dayKey() ? 'Due for review today.' : `Next review in ${plural(daysBetween(dayKey(), ts.due), 'day')} (${ts.due}).`)
    : 'Read a few resources, then rate how well you understand it. The app will bring it back for review.';

  return {
    title: t.title,
    tab: 'home',
    back: t.area.topics.length > 1 ? `#/area/${t.area.id}` : '#/',
    onMount: () => touchRecent(t.id) || save(),
    html: `<section class="card topic-head">
        <div class="crumbs">${esc(t.track.title)}${t.area.title !== t.title ? ` › <a href="${areaHref(t.area)}">${esc(t.area.title)}</a>` : ''}</div>
        <h2>${esc(t.title)}</h2>
        <div class="actions" style="align-items:center">
          <span class="chip ${s.cls}" id="topic-status">${s.label}</span>
          <span class="muted small" id="read-count">${r}/${t.links.length} read</span>
        </div>
        ${bar(pct(r, t.links.length))}
      </section>
      ${links}
      <div class="section-label">Your notes</div>
      <textarea id="notes" data-topic="${t.id}" placeholder="Key ideas, how you'd apply this with your team, questions to dig into…">${esc(ts.notes || '')}</textarea>
      <div class="section-label">How well do you understand this?</div>
      <section class="card rate">
        <div class="rate-buttons">
          ${RATINGS.map((x) => `<button class="btn" data-action="rate" data-id="${t.id}" data-rating="${x.key}" aria-pressed="${ts.rating === x.key}">
            ${x.label}<small>${x.hint} · ${plural(nextInterval(ts.interval, x.key), 'day')}</small></button>`).join('')}
        </div>
        <div class="muted small">${reviewLine}</div>
      </section>
      <div class="actions" style="margin-top:16px">
        ${prev ? `<a class="btn" href="#/topic/${prev.id}">‹ ${esc(prev.title)}</a>` : ''}
        ${next ? `<a class="btn primary" href="#/topic/${next.id}">${esc(next.title)} ›</a>` : ''}
      </div>`,
  };
}

function reviewView() {
  const due = dueTopics();
  const today = dayKey();
  const upcoming = topics
    .filter((t) => state.topics[t.id]?.due > today)
    .sort((a, b) => state.topics[a.id].due.localeCompare(state.topics[b.id].due))
    .slice(0, 10);
  let html = '';
  if (due.length) {
    html += `<div class="section-label">Due now</div><p class="muted small" style="margin:0 4px 10px">Open each topic, skim your notes and the resources, then rate it again.</p>
      <div class="card">${due.map((t) => topicRow(t, `Last rated: ${state.topics[t.id].rating}`)).join('')}</div>`;
  } else {
    html += `<div class="card empty"><h3>Nothing due</h3><p>When you rate a topic, it comes back here at the right time to review.</p>
      ${topicOfTheDay() ? `<a class="btn primary" href="#/topic/${topicOfTheDay().id}">Learn today's topic</a>` : ''}</div>`;
  }
  if (upcoming.length) {
    html += `<div class="section-label">Coming up</div><div class="card">${upcoming
      .map((t) => topicRow(t, `In ${plural(daysBetween(today, state.topics[t.id].due), 'day')}`))
      .join('')}</div>`;
  }
  return { title: 'Review', tab: 'review', html };
}

let lastQuery = '';
function searchView() {
  return {
    title: 'Search',
    tab: 'search',
    html: `<div class="search"><input id="q" type="search" placeholder="Search topics and resources" value="${esc(lastQuery)}" autocomplete="off" aria-label="Search"></div>
      <div id="results"></div>`,
    onMount: () => {
      const q = document.getElementById('q');
      q.addEventListener('input', () => renderResults(q.value));
      renderResults(q.value);
      if (!matchMedia('(pointer: coarse)').matches) q.focus();
    },
  };
}
function renderResults(q) {
  lastQuery = q;
  const out = document.getElementById('results');
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) {
    out.innerHTML = `<p class="empty">Try “one-on-ones”, “roadmap”, “RACI”, “feedback” or “book”.</p>`;
    return;
  }
  const hit = (s) => terms.every((w) => s.toLowerCase().includes(w));
  const hl = (s) => {
    let h = esc(s);
    for (const w of terms) h = h.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>');
    return h;
  };
  const ts = topics.filter((t) => hit(`${t.title} ${t.area.title}`));
  const ls = topics
    .flatMap((t) => t.links.map((l) => ({ l, t })))
    .filter(({ l, t }) => hit(`${l.title} ${l.desc} ${l.group || ''} ${KIND_LABEL[l.kind]} ${t.title}`))
    .slice(0, 60);
  let html = '';
  if (ts.length) html += `<div class="section-label">Topics</div><div class="card">${ts.map((t) => topicRow(t)).join('')}</div>`;
  if (ls.length) {
    html += `<div class="section-label">Resources</div><div class="card">${ls
      .map(({ l, t }) => linkRow(l, { topic: t, titleHtml: hl(l.title), descHtml: l.desc && hl(l.desc) }))
      .join('')}</div>`;
  }
  out.innerHTML = html || `<p class="empty">No matches for “${esc(q)}”.</p>`;
}

function meView() {
  const p = progressOf(topics);
  // Activity heatmap: last 20 weeks, columns are weeks (Sun→Sat).
  const cells = [];
  const start = new Date();
  start.setDate(start.getDate() - start.getDay() - 7 * 19);
  for (let i = 0; i < 140; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const k = dayKey(d);
    const n = state.days[k] || 0;
    const lvl = n === 0 ? '' : n < 3 ? 'l1' : n < 7 ? 'l2' : 'l3';
    cells.push(d > new Date() ? '<i style="visibility:hidden"></i>' : `<i class="${lvl}" title="${k}: ${n}"></i>`);
  }
  const counts = { new: 0, started: 0, learning: 0, mastered: 0 };
  topics.forEach((t) => counts[status(t).key]++);
  const activeDays = Object.keys(state.days).length;

  let html = `<section class="card hero"><div class="hero-top">${ring(score(p), 72)}
      <div><h2>Your progress</h2><div class="muted small">${p.read}/${p.links} resources read · ${activeDays} active ${activeDays === 1 ? 'day' : 'days'}</div></div></div>
      <div class="stats">
        <div class="stat"><b>${counts.started}</b><span>started</span></div>
        <div class="stat"><b>${counts.learning}</b><span>learning</span></div>
        <div class="stat"><b>${counts.mastered}</b><span>mastered</span></div>
      </div></section>
    <div class="section-label">Activity · last 20 weeks</div>
    <div class="card"><div class="heat" aria-label="Activity heatmap">${cells.join('')}</div></div>
    <div class="section-label">By area</div><div class="card">`;
  for (const track of content.tracks) {
    for (const a of track.areas) {
      const ap = progressOf(a.topics);
      html += `<a class="row" href="${areaHref(a)}"><div class="grow"><div class="name">${esc(a.title)}</div>
        <div class="sub">${score(ap)}% · ${ap.learned}/${ap.topics} learned</div>${bar(score(ap))}</div>${CHEV}</a>`;
    }
  }
  html += `</div>
    <div class="section-label">Your data</div>
    <section class="card rate">
      <div class="muted small">Progress and notes are stored only on this device. Export a backup to move them to another phone or browser.</div>
      <div class="actions">
        <button class="btn" data-action="export">Export backup</button>
        <button class="btn" data-action="import">Import backup</button>
        <button class="btn" data-action="reset">Reset</button>
      </div>
      <input type="file" id="import-file" accept="application/json,.json" hidden>
    </section>
    <p class="footer-note">Content updated ${new Date(content.generatedAt).toLocaleDateString()} from
      <a href="${content.source}" target="_blank" rel="noopener">awesome-engineering-management</a> (CC0).</p>`;
  return {
    title: 'Progress',
    tab: 'me',
    html,
    onMount: () => {
      const input = document.getElementById('import-file');
      input.addEventListener('change', async () => {
        try {
          const data = JSON.parse(await input.files[0].text());
          if (!data || typeof data.read !== 'object') throw new Error('bad file');
          state = { ...emptyState(), ...data };
          save();
          toast('Backup imported');
          render();
        } catch {
          toast('That file is not an EM Learn backup');
        }
      });
    },
  };
}

function notFound() {
  return { title: 'Not found', tab: 'home', back: true, html: `<p class="empty">That page doesn't exist. <a href="#/">Go home</a></p>` };
}

/* ---------- Router ---------- */

function route() {
  const [, name, id] = (location.hash || '#/').slice(1).split('/');
  switch (name) {
    case '': case undefined: return homeView();
    case 'area': return areaView(decodeURIComponent(id));
    case 'topic': return topicView(decodeURIComponent(id));
    case 'review': return reviewView();
    case 'search': return searchView();
    case 'me': return meView();
    default: return notFound();
  }
}

let lastHash = null;
function render() {
  const v = route();
  titleEl.textContent = v.title;
  document.title = v.title === 'EM Learn' ? 'EM Learn' : `${v.title} · EM Learn`;
  backBtn.hidden = !v.back;
  upHref = typeof v.back === 'string' ? v.back : '#/';
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === v.tab));
  const sameView = lastHash === location.hash;
  const y = scrollY;
  view.innerHTML = v.html;
  v.onMount?.();
  if (sameView) scrollTo(0, y);
  else { scrollTo(0, 0); view.focus({ preventScroll: true }); }
  lastHash = location.hash;
}

/* ---------- Events ---------- */

function refreshLinkRow(id) {
  const on = !!state.read[id];
  document.querySelectorAll(`[data-link="${id}"]`).forEach((row) => {
    row.classList.toggle('done', on);
    row.querySelector('.check').setAttribute('aria-pressed', on);
  });
  const t = topicOfLink.get(id);
  const rc = document.getElementById('read-count');
  if (rc && t) {
    const r = readCount(t);
    rc.textContent = `${r}/${t.links.length} read`;
    rc.closest('.topic-head').querySelector('.bar > i').style.width = `${pct(r, t.links.length)}%`;
    const s = status(t);
    const chip = document.getElementById('topic-status');
    chip.className = `chip ${s.cls}`;
    chip.textContent = s.label;
  }
}

view.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, id } = el.dataset;
  if (action === 'toggle') {
    toggleRead(id);
    refreshLinkRow(id);
  } else if (action === 'open') {
    // Opening a resource counts as reading it; untick if you didn't get to it.
    if (!state.read[id]) {
      toggleRead(id, true);
      refreshLinkRow(id);
      toast('Marked as read');
    }
  } else if (action === 'rate') {
    const ts = rateTopic(id, el.dataset.rating);
    toast(`Next review in ${plural(ts.interval, 'day')}`);
    render();
  } else if (action === 'export') {
    const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `em-learn-backup-${dayKey()}.json` });
    a.click();
    URL.revokeObjectURL(a.href);
  } else if (action === 'import') {
    document.getElementById('import-file').click();
  } else if (action === 'reset') {
    if (confirm('Erase all progress and notes on this device? Export a backup first if you might want them.')) {
      state = emptyState();
      save();
      render();
      toast('Progress reset');
    }
  }
});

let notesTimer;
view.addEventListener('input', (e) => {
  if (e.target.id !== 'notes') return;
  const id = e.target.dataset.topic;
  const value = e.target.value;
  clearTimeout(notesTimer);
  notesTimer = setTimeout(() => {
    topicState(id).notes = value;
    save();
  }, 400);
});

let upHref = '#/';
backBtn.addEventListener('click', () => (location.hash = upHref));
window.addEventListener('hashchange', render);

const offlineEl = document.getElementById('offline');
const syncOnline = () => (offlineEl.hidden = navigator.onLine);
addEventListener('online', syncOnline);
addEventListener('offline', syncOnline);

/* ---------- Boot ---------- */

(async function boot() {
  syncOnline();
  try {
    await loadContent();
  } catch {
    view.innerHTML = `<p class="empty">Couldn't load the content. Connect to the internet once so it can be saved for offline use.</p>`;
    return;
  }
  updateBadge();
  render();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        sw?.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) toast('Update ready. It will load next time you open the app.');
        });
      });
    });
  }
})();
