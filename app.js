import { fileToScript } from './parsers.js';
import { Voice, locate, mintToken, norm } from './voice.js';
import { pull, push, merge, forRemote, pullJson, pushJson } from './sync.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const FONTS = {
  system: '-apple-system, "SF Pro Display", system-ui, sans-serif',
  montserrat: 'Montserrat, system-ui, sans-serif',
  helvetica: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  georgia: 'Georgia, "Times New Roman", serif',
  verdana: 'Verdana, Geneva, sans-serif',
  mono: 'Menlo, ui-monospace, monospace',
  // wbudowane w iPadOS/iOS/macOS — działają bez pobierania
  rounded: 'ui-rounded, "SF Pro Rounded", -apple-system, sans-serif',
  newyork: 'ui-serif, "New York", Georgia, serif',
  avenir: '"Avenir Next", Avenir, -apple-system, sans-serif',
  charter: 'Charter, "Bitstream Charter", Georgia, serif',
};

const DEFAULTS = {
  fontSize: innerWidth < 640 ? 32 : 72, font: 'system', weight: '600', lineHeight: 1.35, margin: 8, align: 'left', upper: false,
  fg: '#ffffff', bg: '#000000', mirrorH: false, mirrorV: false,
  marker: true, markerPos: 30, fade: true, hud: true, progress: true, countdown: '3',
  // domyślne tempo dla skryptów, które nie mają jeszcze własnego
  mode: 'speed', speed: 12, wpm: 140,
  voice: false, voiceDebug: true, voiceAgain: true,
};

// ---------- pamięć ----------

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch { toast('Nie udało się zapisać — zrób kopię zapasową'); return false; }
  },
};
let settings = { ...DEFAULTS, ...store.get('tp.settings', {}) };
let scripts = store.get('tp.scripts', []);
navigator.storage?.persist?.().catch(() => {});

// usunięte skrypty zostają jako wpis `deleted`, żeby usunięcie dotarło też na inne urządzenia
const live = () => scripts.filter((s) => !s.deleted);

let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    store.set('tp.settings', settings);
    store.set('tp.scripts', scripts);
    if (JSON.stringify(forRemote(scripts)) !== syncedHash) scheduleSync(2500);
  }, 250);
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function addScript(title, text) {
  const now = Date.now();
  const s = { id: newId(), title: title || 'Bez tytułu', text, created: now, updated: now };
  scripts.push(s);
  persist();
  return s;
}

// ---------- tekst ----------

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function fmtLine(l) {
  return esc(l)
    .replace(/\[([^\]]+)\]/g, '<span class="note">[$1]</span>')
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '<em class="hl">$1</em>')
    .replace(/\s*\/\/\s*/g, ' <span class="pause">/</span> ');
}

function renderText(text) {
  let html = '';
  for (const block of text.split(/\n\s*\n/)) {
    let group = [];
    const flush = () => { if (group.length) html += `<p class="para">${group.map(fmtLine).join('<br>')}</p>`; group = []; };
    for (const raw of block.split('\n')) {
      const l = raw.trim();
      if (!l) continue;
      if (l.startsWith('#')) { flush(); html += `<div class="para label">${esc(l.replace(/^#+\s*/, ''))}</div>`; }
      else group.push(l);
    }
    flush();
  }
  return html;
}

function countWords(t) {
  const clean = t.replace(/\[[^\]]*\]/g, ' ').replace(/^#.*$/gm, ' ').replace(/[*/]/g, ' ');
  return (clean.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
}

const fmtTime = (sec) => {
  sec = Math.max(0, Math.round(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

// ---------- widoki ----------

function show(id) {
  $$('.view').forEach((v) => v.classList.toggle('on', v.id === id));
}

let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}

const ICON = {
  edit: '<svg class="i" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  del: '<svg class="i" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  play: 'M7 4v16l13-8z',
  pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
};

// ---------- biblioteka ----------

function renderLibrary() {
  const q = $('#q').value.trim().toLowerCase();
  const list = live()
    .filter((s) => !q || (s.title + ' ' + s.text).toLowerCase().includes(q))
    .sort((a, b) => (b.used || b.updated) - (a.used || a.updated));
  const grid = $('#grid');
  if (!live().length) {
    grid.innerHTML = '<div class="empty"><b>Brak skryptów</b>Zaimportuj pliki z iCloud przyciskiem „Importuj” albo napisz nowy skrypt.</div>';
    return;
  }
  grid.innerHTML = list.map((s) => {
    const words = countWords(s.text);
    const dur = s.play?.mode === 'time' ? s.play.time : (words / (s.play?.wpm || settings.wpm)) * 60;
    const preview = esc(s.text.replace(/^#+\s*/gm, '').replace(/\*/g, '').replace(/\s+/g, ' ').slice(0, 220));
    return `<div class="card" data-id="${s.id}" role="button">
      <div class="acts"><button data-act="edit" aria-label="Edytuj">${ICON.edit}</button><button data-act="del" aria-label="Usuń">${ICON.del}</button></div>
      <h3>${esc(s.title)}</h3><p>${preview}</p>
      <div class="meta"><span>${words} słów</span><span>~${fmtTime(dur)}</span></div>
    </div>`;
  }).join('') || '<div class="empty">Nic nie pasuje do wyszukiwania.</div>';
}

$('#grid').addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  const s = scripts.find((x) => x.id === card.dataset.id);
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'edit') openEditor(s);
  else if (act === 'del') {
    if (confirm(`Usunąć skrypt „${s.title}”?`)) {
      for (const k of Object.keys(s)) if (k !== 'id') delete s[k];
      Object.assign(s, { deleted: true, updated: Date.now() });
      persist();
      renderLibrary();
    }
  } else openPrompter(s);
});
$('#q').addEventListener('input', renderLibrary);

$('#btn-new').onclick = () => openEditor(null);
$('#btn-import').onclick = () => { $('#file').dataset.mode = 'import'; $('#file').click(); };
$('#btn-restore').onclick = () => { $('#file').dataset.mode = 'restore'; $('#file').click(); };

$('#file').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  const mode = e.target.dataset.mode;
  e.target.value = '';
  if (!files.length) return;
  if (mode === 'restore') return restoreBackup(files[0]);
  let ok = 0;
  const errs = [];
  toast('Importuję…', 10000);
  for (const f of files) {
    try {
      const { title, text } = await fileToScript(f.name, await f.arrayBuffer());
      if (!text.trim()) throw new Error('plik nie zawiera tekstu');
      addScript(title, text);
      ok++;
    } catch (err) {
      errs.push(`${f.name}: ${err.message}`);
    }
  }
  renderLibrary();
  toast(ok ? `Zaimportowano: ${ok}` : 'Nic nie zaimportowano');
  if (errs.length) alert('Nie udało się wczytać:\n\n' + errs.join('\n'));
});

$('#btn-backup').onclick = () => {
  const data = JSON.stringify({ app: 'prompter', version: 1, settings, scripts: live() }, null, 1);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  a.download = `prompter-kopia-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
};

async function restoreBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.scripts)) throw new Error();
    const known = new Set(scripts.map((s) => s.id));
    const fresh = data.scripts.filter((s) => !known.has(s.id) && !s.deleted);
    scripts.push(...fresh);
    if (data.settings) settings = { ...DEFAULTS, ...data.settings };
    persist();
    renderLibrary();
    toast(`Przywrócono skryptów: ${fresh.length}`);
  } catch {
    alert('To nie jest plik kopii zapasowej Promptera.');
  }
}

// ---------- edytor ----------

let editing = null;

function openEditor(s) {
  closeSettings();
  editing = s;
  $('#ed-title').value = s ? s.title : '';
  $('#ed-text').value = s ? s.text : '';
  edStats();
  show('editor');
  if (!s) setTimeout(() => $('#ed-title').focus(), 50);
}

function edStats() {
  const w = countWords($('#ed-text').value);
  $('#ed-stats').textContent = `${w} słów · ok. ${fmtTime((w / settings.wpm) * 60)} przy ${settings.wpm} sł./min`;
}
$('#ed-text').addEventListener('input', edStats);

function saveEditor() {
  const title = $('#ed-title').value.trim() || 'Bez tytułu';
  const text = $('#ed-text').value.replace(/\r\n?/g, '\n').trim();
  if (!text) { toast('Skrypt jest pusty'); return null; }
  if (editing) Object.assign(editing, { title, text, updated: Date.now() });
  else editing = addScript(title, text);
  persist();
  return editing;
}

$('#ed-back').onclick = () => {
  const dirty = editing
    ? $('#ed-text').value.trim() !== editing.text.trim() || $('#ed-title').value.trim() !== editing.title
    : $('#ed-text').value.trim();
  if (dirty && !confirm('Wyjść bez zapisywania zmian?')) return;
  renderLibrary();
  show('library');
};
$('#ed-save').onclick = () => { if (saveEditor()) { toast('Zapisano'); renderLibrary(); show('library'); } };
$('#ed-read').onclick = () => { const s = saveEditor(); if (s) openPrompter(s); };

// ---------- prompter ----------

const stage = $('#stage'), content = $('#content');
let cur = null;           // aktualny skrypt
let P = null;             // tempo tego skryptu: { mode, speed, wpm, time }
let words = 0;
let offset = 0, maxOffset = 0, lhPx = 0, markerY = 0, paraTops = [];
let playing = false, counting = null, raf = 0, lastTs = 0, dragging = false, tween = null, lastHud = '';

function openPrompter(s) {
  closeSettings();
  cur = s;
  cur.used = Date.now();
  words = countWords(s.text);
  P = { mode: settings.mode, speed: settings.speed, wpm: settings.wpm, ...s.play };
  if (!P.time) P.time = Math.max(10, Math.round((words / P.wpm) * 60 / 5) * 5);
  persist();
  $('#p-title').textContent = s.title;
  content.innerHTML = renderText(s.text);
  offset = 0;
  maxOffset = 0;
  show('prompter');
  $('#endmsg').classList.remove('on');
  applySettings();
  syncSettingsUI();
  showChrome(true);
  wakeLock(true);
  document.fonts?.ready.then(layout);
}

function closePrompter() {
  stop();
  closeSettings();
  wakeLock(false);
  renderLibrary();
  show('library');
}

function applySettings() {
  const st = stage.style;
  st.setProperty('--p-size', settings.fontSize + 'px');
  st.setProperty('--p-font', FONTS[settings.font] || FONTS.system);
  st.setProperty('--p-weight', settings.weight);
  st.setProperty('--p-lh', settings.lineHeight);
  st.setProperty('--p-margin', settings.margin + '%');
  st.setProperty('--p-align', settings.align);
  st.setProperty('--p-case', settings.upper ? 'uppercase' : 'none');
  st.setProperty('--p-fg', settings.fg);
  st.setProperty('--p-bg', settings.bg);
  st.transform = `scale(${settings.mirrorH ? -1 : 1}, ${settings.mirrorV ? -1 : 1})`;
  $('#marker').style.display = settings.marker ? '' : 'none';
  $('#fade').style.display = settings.fade ? '' : 'none';
  $('#hud').style.display = settings.hud ? '' : 'none';
  $('#progress').style.display = settings.progress ? '' : 'none';
  layout();
}

function layout() {
  if (!cur) return;
  const frac = maxOffset > 0 ? offset / maxOffset : 0;
  lhPx = settings.fontSize * settings.lineHeight;
  stage.style.setProperty('--p-lhpx', lhPx + 'px');
  markerY = (stage.clientHeight * settings.markerPos) / 100;
  const kids = [...content.children];
  const last = kids[kids.length - 1];
  maxOffset = last ? Math.max(0, last.offsetTop + last.offsetHeight - lhPx) : 0;
  paraTops = kids.map((k) => k.offsetTop);
  offset = frac * maxOffset;
  $('#marker').style.top = markerY + 'px';
  placeMarginBar();
  const fade = $('#fade');
  fade.style.height = Math.max(0, markerY - lhPx * 0.5) + 'px';
  fade.style.background = `linear-gradient(${settings.bg}f2, ${settings.bg}00)`;
  measureWords();
  draw();
  refreshEstimate();
}

function pxPerSec() {
  if (P.mode === 'speed') return (P.speed * lhPx) / 20;
  const dur = P.mode === 'wpm' ? (words / P.wpm) * 60 : P.time;
  return maxOffset / Math.max(1, dur);
}

function draw() {
  content.style.transform = `translate3d(0, ${markerY - lhPx * 0.5 - offset}px, 0)`;
  $('#progress').style.width = (maxOffset ? (offset / maxOffset) * 100 : 0) + '%';
  const v = pxPerSec();
  const hud = v > 0 ? '−' + fmtTime((maxOffset - offset) / v) : '';
  if (hud !== lastHud) { $('#hud').textContent = hud; lastHud = hud; }
}

function tick(ts) {
  raf = 0;
  if (tween) {
    const k = clamp((ts - tween.t0) / 280, 0, 1);
    offset = tween.from + (tween.to - tween.from) * (1 - Math.pow(1 - k, 3));
    if (k >= 1) tween = null;
  } else if (playing) {
    const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0;
    if (!dragging) offset += velocity(dt) * dt;
    if (offset >= maxOffset) {
      offset = maxOffset;
      draw();
      stop(true);
      return;
    }
  }
  lastTs = ts;
  draw();
  if (playing || tween) raf = requestAnimationFrame(tick);
}
const kick = () => { if (!raf) { lastTs = 0; raf = requestAnimationFrame(tick); } };

function start() {
  if (playing || counting) return;
  closeSettings();
  if (offset >= maxOffset - 1) offset = 0;
  $('#endmsg').classList.remove('on');
  showChrome(false);
  startVoice();
  let n = +settings.countdown;
  const cd = $('#countdown');
  if (n <= 0) return begin();
  cd.firstElementChild.textContent = n;
  cd.classList.add('on');
  counting = setInterval(() => {
    n--;
    if (n <= 0) { clearInterval(counting); counting = null; cd.classList.remove('on'); begin(); }
    else cd.firstElementChild.textContent = n;
  }, 1000);
}

function begin() {
  playing = true;
  vCur = pxPerSec();
  tween = null;
  setPlayIcon();
  kick();
}

function stop(ended = false) {
  if (counting) { clearInterval(counting); counting = null; $('#countdown').classList.remove('on'); }
  playing = false;
  voice.stop();
  setPlayIcon();
  showChrome(true);
  if (ended) $('#endmsg').classList.add('on');
}

const toggle = () => (playing || counting ? stop() : start());
const setPlayIcon = () => $('#p-play-ico').setAttribute('d', playing ? ICON.pause : ICON.play);
const showChrome = (on) => $$('.chrome').forEach((c) => c.classList.toggle('hidden', !on));

function jumpTo(target) {
  target = clamp(target, 0, maxOffset);
  $('#endmsg').classList.remove('on');
  syncVoice(target);
  if (playing) { offset = target; draw(); return; }
  tween = { from: offset, to: target, t0: performance.now() };
  kick();
}

function jumpPara(dir) {
  const tol = lhPx * 0.5;
  if (dir < 0) {
    const prev = paraTops.filter((t) => t < offset - tol);
    jumpTo(prev.length ? prev[prev.length - 1] : 0);
  } else {
    const next = paraTops.find((t) => t > offset + 2);
    if (next !== undefined) jumpTo(next);
  }
}

function nudge(dir) {
  if (P.mode === 'speed') P.speed = clamp(P.speed + dir, 1, 40);
  else if (P.mode === 'wpm') P.wpm = clamp(P.wpm + 5 * dir, 60, 260);
  else P.time = clamp(P.time - 5 * dir, 5, 3600);
  savePlay();
}

function savePlay() {
  cur.play = { ...P };
  cur.updated = Date.now(); // tempo synchronizuje się razem ze skryptem
  Object.assign(settings, { mode: P.mode, speed: P.speed, wpm: P.wpm });
  persist();
  syncSettingsUI();
  draw();
}

function speedLabel() {
  if (P.mode === 'speed') return `${P.speed}<small>prędkość</small>`;
  if (P.mode === 'wpm') return `${P.wpm}<small>słów / min</small>`;
  return `${fmtTime(P.time)}<small>czas</small>`;
}

function refreshEstimate() {
  if (!P) return;
  $('#p-speed').innerHTML = speedLabel();
  const v = pxPerSec();
  $('#est').textContent = `${words} słów · całość: ${v > 0 ? fmtTime(maxOffset / v) : '–'}` +
    (P.mode === 'speed' && v > 0 && maxOffset > 0 ? ` · ok. ${Math.round(words / (maxOffset / v / 60))} sł./min` : '');
}

// dotyk na scenie: krótkie stuknięcie = start/pauza, przeciągnięcie = przewijanie ręczne,
// dwa palce (szczypanie) = rozmiar tekstu
const FONT_MIN = 20, FONT_MAX = 180;
const touches = new Map();
let down = null, pinch = null, zoomRaf = 0, zoomHintTimer;
const fingerGap = () => {
  const [a, b] = [...touches.values()];
  return Math.hypot(a.x - b.x, a.y - b.y) || 1;
};

function setFontSize(size) {
  size = clamp(Math.round(size), FONT_MIN, FONT_MAX);
  if (size === settings.fontSize) return;
  settings.fontSize = size;
  const hint = $('#zoomhint');
  hint.textContent = size + ' px';
  hint.classList.add('on');
  clearTimeout(zoomHintTimer);
  zoomHintTimer = setTimeout(() => hint.classList.remove('on'), 700);
  if (!zoomRaf) zoomRaf = requestAnimationFrame(() => { zoomRaf = 0; applySettings(); });
}

stage.addEventListener('pointerdown', (e) => {
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { stage.setPointerCapture(e.pointerId); } catch { /* wskaźnik już nieaktywny */ }
  if (touches.size === 2) {
    // drugi palec: kończymy przeciąganie, zaczynamy szczypanie
    if (down?.moved) offset = down.off;
    down = null;
    dragging = false;
    pinch = { gap: fingerGap(), size: settings.fontSize };
  } else if (touches.size === 1) {
    down = { y: e.clientY, off: offset, moved: false };
  }
});
stage.addEventListener('pointermove', (e) => {
  if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch) {
    if (touches.size >= 2) setFontSize(pinch.size * (fingerGap() / pinch.gap));
    return;
  }
  if (!down) return;
  const dy = e.clientY - down.y;
  if (!down.moved && Math.abs(dy) > 10) { down.moved = true; dragging = true; tween = null; }
  if (down.moved) {
    offset = clamp(down.off - dy * (settings.mirrorV ? -1 : 1), 0, maxOffset);
    $('#endmsg').classList.remove('on');
    draw();
  }
});
const endPointer = (e) => {
  touches.delete(e.pointerId);
  if (pinch) {
    // po szczypaniu żaden palec nie liczy się jako stuknięcie
    if (touches.size < 2) { pinch = null; persist(); syncSettingsUI(); }
    down = null;
    return;
  }
  if (!down) return;
  const tap = !down.moved;
  down = null;
  dragging = false;
  if (!tap) { syncVoice(offset); return; }
  if ($('#settings').classList.contains('on')) closeSettings();
  else toggle();
};
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', (e) => {
  touches.delete(e.pointerId);
  if (pinch && touches.size < 2) { pinch = null; persist(); syncSettingsUI(); }
  down = null;
  dragging = false;
});
// Safari ma własny gest powiększania strony — blokujemy go, żeby szczypanie zmieniało tylko tekst
['gesturestart', 'gesturechange'].forEach((t) => document.addEventListener(t, (e) => e.preventDefault()));
// gdyby strona jednak się powiększyła, wracamy do skali 1 (ponowne ustawienie viewportu resetuje zoom w Safari)
const viewportMeta = document.querySelector('meta[name=viewport]');
window.visualViewport?.addEventListener('resize', () => {
  if (window.visualViewport.scale <= 1.01) return;
  const c = viewportMeta.content;
  viewportMeta.content = c + ', width=device-width';
  requestAnimationFrame(() => { viewportMeta.content = c; });
});
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  // szczypanie na gładziku Maca przychodzi jako kółko z Ctrl
  if (e.ctrlKey) { setFontSize(settings.fontSize * Math.exp(-e.deltaY / 100)); persist(); syncSettingsUI(); return; }
  offset = clamp(offset + e.deltaY * (settings.mirrorV ? -1 : 1), 0, maxOffset);
  draw();
}, { passive: false });

// uchwyt marginesu: pionowa linia przy prawej krawędzi tekstu; marginesy zmieniają się symetrycznie,
// żeby tekst został na środku szyby
const MARGIN_MAX = 35;
let marginDrag = null, marginRaf = 0;
const marginBar = $('#marginbar');
// przy marginesie 0 uchwyt zostaje w całości na ekranie
function placeMarginBar() { marginBar.style.left = `min(calc(${100 - settings.margin}% - var(--safe-x)), calc(100% - 24px))`; }
marginBar.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  marginDrag = { id: e.pointerId };
  try { marginBar.setPointerCapture(e.pointerId); } catch { /* wskaźnik już nieaktywny */ }
  marginBar.classList.add('drag');
});
marginBar.addEventListener('pointermove', (e) => {
  if (!marginDrag || e.pointerId !== marginDrag.id) return;
  const w = $('#prompter').clientWidth;
  const safeX = parseFloat(getComputedStyle(content).paddingRight) - (settings.margin / 100) * w;
  const m = clamp(Math.round(((w - safeX - e.clientX) / w) * 100), 0, MARGIN_MAX);
  if (m === settings.margin) return;
  settings.margin = m;
  placeMarginBar();
  const hint = $('#zoomhint');
  hint.textContent = `Margines ${m}%`;
  hint.classList.add('on');
  clearTimeout(zoomHintTimer);
  zoomHintTimer = setTimeout(() => hint.classList.remove('on'), 700);
  if (!marginRaf) marginRaf = requestAnimationFrame(() => { marginRaf = 0; applySettings(); });
});
const endMarginDrag = () => {
  if (!marginDrag) return;
  marginDrag = null;
  marginBar.classList.remove('drag');
  persist();
  syncSettingsUI();
};
marginBar.addEventListener('pointerup', endMarginDrag);
marginBar.addEventListener('pointercancel', endMarginDrag);

$('#p-back').onclick = closePrompter;

// pełny ekran: iPad i Mac tak; Safari na iPhonie nie pozwala (tam: ikona na ekranie początkowym)
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
if (document.fullscreenEnabled || document.webkitFullscreenEnabled) {
  $('#p-full').hidden = false;
  $('#p-full').onclick = () => {
    const root = document.documentElement;
    const r = fsEl() ? (document.exitFullscreen || document.webkitExitFullscreen).call(document)
      : (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
    Promise.resolve(r).catch(() => toast('Pełny ekran niedostępny'));
  };
  const onFs = () => $('#p-full-ico').setAttribute('d', fsEl()
    ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5'
    : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5');
  document.addEventListener('fullscreenchange', onFs);
  document.addEventListener('webkitfullscreenchange', onFs);
}
$('#p-edit').onclick = () => { stop(); closeSettings(); wakeLock(false); openEditor(cur); };
$('#p-play').onclick = toggle;
$('#p-restart').onclick = () => { stop(); jumpTo(0); };
$('#p-prev').onclick = () => jumpPara(-1);
$('#p-next').onclick = () => jumpPara(1);
$('#p-slower').onclick = () => nudge(-1);
$('#p-faster').onclick = () => nudge(1);
$('#p-settings').onclick = () => { stop(); openSettings(false); };
$('#btn-settings').onclick = () => openSettings(true);
// z listy skryptów: bez tempa (należy do konkretnego skryptu), reszta ustawień wspólna
function openSettings(fromLibrary) {
  const panel = $('#settings');
  panel.classList.toggle('lib', fromLibrary);
  syncSettingsUI();
  panel.scrollTop = 0;
  panel.classList.add('on');
}
$('#s-close').onclick = closeSettings;
function closeSettings() { $('#settings').classList.remove('on'); }

// pilot Bluetooth / klawiatura
document.addEventListener('keydown', (e) => {
  if (!$('#prompter').classList.contains('on')) return;
  const k = e.key;
  if (k === ' ' || k === 'Enter' || k === 'b' || k === '.') toggle();
  else if (k === 'ArrowUp') nudge(1);
  else if (k === 'ArrowDown') nudge(-1);
  else if (k === 'ArrowLeft' || k === 'PageUp') jumpPara(-1);
  else if (k === 'ArrowRight' || k === 'PageDown') jumpPara(1);
  else if (k === 'r' || k === 'R' || k === 'Backspace') againParagraph(false);
  else if (k === 'Escape') closePrompter();
  else return;
  e.preventDefault();
});

// ekran nie gaśnie, dopóki prompter jest otwarty
let lock = null;
async function wakeLock(on) {
  try {
    if (on && !lock && navigator.wakeLock) {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } else if (!on && lock) {
      await lock.release();
      lock = null;
    }
  } catch { lock = null; }
}
document.addEventListener('visibilitychange', () => {
  if (!$('#prompter').classList.contains('on')) return;
  if (document.visibilityState === 'visible') wakeLock(true);
  else stop();
});

let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 120); });

// ---------- śledzenie głosu ----------

// klucz ElevenLabs: poza kopią zapasową; przy włączonej synchronizacji idzie do prywatnego repo (klucze.json)
const KEY = 'tp.elkey', KEY_AT = 'tp.elkeyAt';
const elKey = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
const elKeyAt = () => { try { return +(localStorage.getItem(KEY_AT) || 0); } catch { return 0; } };
function setElKey(key, at = Date.now()) {
  try {
    if (key) localStorage.setItem(KEY, key); else localStorage.removeItem(KEY);
    localStorage.setItem(KEY_AT, String(at));
  } catch { /* pamięć niedostępna */ }
}
// klucz zapisany przed wprowadzeniem synchronizacji dostaje znacznik czasu, żeby trafił do repo
if (elKey() && !elKeyAt()) setElKey(elKey());
let wordNorms = [], wordY = [];       // słowa skryptu i ich pozycja (w jednostkach offsetu)
let voiceCur = 0, voiceTarget = 0, voiceTs = 0, vCur = 0, holdTs = 0;

const voice = new Voice({
  onStatus(state, msg) {
    const badge = $('#voicebadge');
    badge.className = state;
    badge.lastElementChild.textContent = { connecting: 'łączę…', listening: 'słucham', error: 'błąd głosu', off: 'głos' }[state] || state;
    if (state === 'error') toast(msg + ' — tekst płynie w stałym tempie', 5000);
  },
  onWords(spoken, text) {
    $('#heard').textContent = (text || '').slice(-90);
    if (!wordNorms.length) return;
    const j = locate(spoken, wordNorms, voiceCur);
    if (j < 0) return;
    voiceCur = j;
    voiceTarget = wordY[j];
    voiceTs = performance.now();
  },
  onCommand() {
    if (settings.voiceAgain && playing) againParagraph(true);
  },
});

// „jeszcze raz”: powrót do początku bieżącego akapitu; tekst czeka, aż zaczniesz go czytać od nowa
function againParagraph(byVoice) {
  if (byVoice) {
    // fraza zapisana w samym skrypcie, w miejscu czytania, to nie komenda
    for (let k = Math.max(0, voiceCur - 4); k < Math.min(wordNorms.length - 1, voiceCur + 15); k++) {
      if (wordNorms[k] === 'jeszcze' && wordNorms[k + 1] === 'raz') return;
    }
  }
  const pos = voiceTs ? voiceTarget : offset; // miejsce, w którym mówisz (gdy głos je zna), a nie to na wskaźniku
  const tops = paraTops.filter((t) => t <= pos + lhPx * 0.3);
  jumpTo(tops.length ? tops[tops.length - 1] : 0);
  holdTs = performance.now();
  const f = $('#cmdflash');
  f.classList.remove('on');
  void f.offsetWidth; // restart animacji
  f.classList.add('on');
}

// pozycja każdego słowa: offset, przy którym linia z tym słowem stoi na wskaźniku
function measureWords() {
  wordNorms = [];
  wordY = [];
  if (!settings.voice) return;
  const cr = content.getBoundingClientRect();
  const range = document.createRange();
  const re = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement.closest('.note, .label, .pause') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    re.lastIndex = 0;
    for (let m = re.exec(n.data); m; m = re.exec(n.data)) {
      const w = norm(m[0]);
      if (!w) continue;
      range.setStart(n, m.index);
      range.setEnd(n, m.index + m[0].length);
      const r = range.getBoundingClientRect();
      const mid = (r.top + r.bottom) / 2;
      wordNorms.push(w);
      wordY.push((settings.mirrorV ? cr.bottom - mid : mid - cr.top) - lhPx / 2);
    }
  }
  if (voiceCur >= wordY.length) voiceCur = Math.max(0, wordY.length - 1);
  if (voiceTs) voiceTarget = wordY[voiceCur] ?? voiceTarget;
}

// po ręcznym przesunięciu albo skoku: głos szuka od nowego miejsca
function syncVoice(at) {
  voiceTarget = at;
  voiceTs = 0;
  const i = wordY.findIndex((y) => y >= at - lhPx * 0.4);
  voiceCur = i < 0 ? Math.max(0, wordY.length - 1) : Math.max(0, i - 1);
}

function startVoice() {
  $('#heard').textContent = '';
  if (!settings.voice) return;
  const key = elKey();
  if (!key) { toast('Śledzenie głosu: wpisz klucz ElevenLabs w Ustawieniach'); return; }
  if (!wordY.length) measureWords();
  syncVoice(offset);
  voice.start(key);
}

// Tryb mieszany: stałe tempo + korekta głosem.
// Mówisz → tekst dogania Twoje słowo (przyspiesza/zwalnia). Cisza → tekst dojeżdża do miejsca, w którym jesteś, i czeka.
// Rozpoznawanie zgubione albo wyłączone → zwykłe stałe tempo.
function velocity(dt) {
  const v0 = pxPerSec();
  let v = v0;
  if (voice.active && holdTs) {
    // po „jeszcze raz” stoimy do pierwszego dopasowania (max 8 s, gdyby rozpoznawanie się nie odnalazło)
    if (voiceTs > holdTs || performance.now() - holdTs > 8000) holdTs = 0;
    else v = 0;
  }
  if (voice.active && !holdTs) {
    const now = performance.now();
    const talking = now - voice.lastSpeech < 1500;
    if (!talking) v = v0 * clamp((voiceTarget + lhPx * 0.8 - offset) / lhPx, 0, 1);
    else if (now - voiceTs < 4000) v = clamp(v0 + 0.8 * (voiceTarget - offset), 0, v0 * 3 + 40);
  }
  vCur += (v - vCur) * Math.min(1, dt * 4);
  return vCur;
}

function voiceKeyStatus(msg) {
  $('#el-status').textContent = msg ?? (elKey() ? 'zapisany' : 'brak');
  $('#el-key').placeholder = elKey() ? '•••••••• (zapisany)' : 'wklej klucz sk_…';
}

$('#el-save').onclick = async () => {
  const key = $('#el-key').value.trim();
  try {
    if (!key) {
      if (elKey() && confirm('Usunąć klucz ElevenLabs? Przy włączonej synchronizacji zniknie też z innych urządzeń.')) { setElKey(''); scheduleSync(); }
      voiceKeyStatus();
      return;
    }
    voiceKeyStatus('sprawdzam…');
    await mintToken(key);
    setElKey(key);
    $('#el-key').value = '';
    voiceKeyStatus('działa ✓');
    scheduleSync();
  } catch (err) {
    voiceKeyStatus(err.message);
  }
};

// ---------- panel ustawień ----------

function bindSettings() {
  const panel = $('#settings');
  $$('input[type=range][data-key]', panel).forEach((inp) => {
    inp.addEventListener('input', () => { settings[inp.dataset.key] = +inp.value; persist(); applySettings(); syncSettingsUI(); });
  });
  $$('input[type=checkbox][data-key]', panel).forEach((inp) => {
    inp.addEventListener('change', () => { settings[inp.dataset.key] = inp.checked; persist(); applySettings(); syncSettingsUI(); });
  });
  $$('select[data-key]', panel).forEach((sel) => {
    sel.addEventListener('change', () => { settings[sel.dataset.key] = sel.value; persist(); applySettings(); });
  });
  $$('.seg[data-key], .swatches[data-key], .fontpick[data-key]', panel).forEach((box) => {
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      const key = box.dataset.key;
      if (key === 'mode') { P.mode = b.dataset.v; savePlay(); return; }
      settings[key] = b.dataset.v;
      persist();
      applySettings();
      syncSettingsUI();
    });
  });
  $$('input[type=range][data-play]', panel).forEach((inp) => {
    inp.addEventListener('input', () => { P[inp.dataset.play] = +inp.value; savePlay(); });
  });
  $$('#mode-time button', panel).forEach((b) => {
    b.addEventListener('click', () => { P.time = clamp(P.time + +b.dataset.dt, 5, 3600); savePlay(); });
  });
}

function syncSettingsUI() {
  $('#voicebadge').style.display = settings.voice ? '' : 'none';
  $('#heard').style.display = settings.voice && settings.voiceDebug ? '' : 'none';
  voiceKeyStatus();
  const panel = $('#settings');
  $$('input[type=range][data-key]', panel).forEach((i) => { i.value = settings[i.dataset.key]; });
  $$('input[type=checkbox][data-key]', panel).forEach((i) => { i.checked = !!settings[i.dataset.key]; });
  $$('select[data-key]', panel).forEach((s) => { s.value = settings[s.dataset.key]; });
  $$('.seg[data-key], .swatches[data-key], .fontpick[data-key]', panel).forEach((box) => {
    const v = box.dataset.key === 'mode' ? P?.mode : String(settings[box.dataset.key]);
    $$('button', box).forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  });
  const outs = { fontSize: settings.fontSize + ' px', lineHeight: (+settings.lineHeight).toFixed(2), margin: settings.margin + '%', markerPos: settings.markerPos + '%' };
  $$('output[data-out]', panel).forEach((o) => { o.textContent = outs[o.dataset.out]; });
  if (P) {
    $$('input[type=range][data-play]', panel).forEach((i) => { i.value = P[i.dataset.play]; });
    $('#mode-speed').style.display = P.mode === 'speed' ? '' : 'none';
    $('#mode-wpm').style.display = P.mode === 'wpm' ? '' : 'none';
    $('#mode-time').style.display = P.mode === 'time' ? '' : 'none';
    $('#time-val').textContent = fmtTime(P.time);
  }
  refreshEstimate();
}

// ---------- start ----------

const SAMPLE = `# Jak używać

Stuknij w tekst, żeby zacząć. Po odliczaniu tekst przewija się sam. Stuknij jeszcze raz, żeby zatrzymać.

Przeciągnij palcem w górę albo w dół, żeby ręcznie ustawić miejsce. Strzałki na dole przeskakują między akapitami.

Plus i minus zmieniają tempo. W Ustawieniach wybierzesz tryb: *stała prędkość*, *słowa na minutę* albo *czas*, w którym ma się zmieścić cały tekst.

# Szyba teleprompteru

Na szybie tekst musi być odbity. Włącz „Odbij w poziomie” w Ustawieniach. [Ta notatka jest przygaszona — nie czytasz jej na głos.]

Tempo i czas zapamiętują się osobno dla każdego skryptu. // Pozostałe ustawienia są wspólne.`;

if (!store.get('tp.seeded', false)) {
  if (!scripts.length) Object.assign(addScript('Instrukcja', SAMPLE), { id: 'instrukcja', updated: 1 });
  store.set('tp.seeded', true);
  persist();
}

// ---------- synchronizacja (prywatne repozytorium GitHub) ----------

const SYNC_REPO = 'krolikowskiwojciech-dotcom/prompter-dane';
let syncedHash = '', syncBusy = false, syncAgain = false, syncTimer, syncAt = 0;
const syncCfg = () => store.get('tp.sync', null);

function scheduleSync(ms = 0) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, ms);
}

function syncStatus(state, msg) {
  const el = $('#sync-state');
  el.className = 'sync-state ' + state;
  const time = syncAt ? new Date(syncAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : '';
  el.lastElementChild.textContent = {
    off: 'Synchronizacja wyłączona', busy: 'Synchronizuję…', ok: `Zsynchronizowano ${time}`, error: 'Błąd synchronizacji',
  }[state];
  $('#sync-msg').textContent = state === 'error' ? msg : state === 'ok' ? `Ostatnio: ${time}` : '';
  $('#sync-msg').style.color = state === 'error' ? '#ff8a8d' : 'var(--muted)';
}

// scalona lista wraca do lokalnych obiektów (ten sam obiekt = otwarty skrypt dalej działa)
function applyMerged(merged) {
  let changed = false;
  for (const m of merged) {
    const l = scripts.find((s) => s.id === m.id);
    if (!l) { scripts.push({ ...m }); changed = true; }
    else if (l !== m && (m.updated || 0) > (l.updated || 0)) {
      const used = l.used;
      for (const k of Object.keys(l)) delete l[k];
      Object.assign(l, m, used ? { used } : {});
      changed = true;
    }
  }
  return changed;
}

// klucz ElevenLabs: wygrywa nowsza zmiana (także usunięcie)
async function syncKey(repo, token) {
  for (let attempt = 0; ; attempt++) {
    const { sha, data } = await pullJson(repo, token, 'klucze.json');
    const remoteAt = data?.elevenlabsAt || 0, localAt = elKeyAt();
    if (remoteAt > localAt) {
      setElKey(data.elevenlabsKey || '', remoteAt);
      if ($('#el-status')) voiceKeyStatus();
      return;
    }
    if (localAt <= remoteAt) return;
    try {
      await pushJson(repo, token, 'klucze.json', { elevenlabsKey: elKey(), elevenlabsAt: localAt }, sha, 'Prompter: klucz ElevenLabs');
      return;
    } catch (e) { if (!(e.conflict && attempt < 3)) throw e; }
  }
}

async function syncNow() {
  const cfg = syncCfg();
  if (!cfg?.token) { syncStatus('off'); return; }
  if (syncBusy) { syncAgain = true; return; }
  syncBusy = true;
  syncStatus('busy');
  try {
    for (let attempt = 0; ; attempt++) {
      const { sha, list } = await pull(cfg.repo || SYNC_REPO, cfg.token);
      const merged = merge(scripts, list);
      const changed = applyMerged(merged);
      const out = forRemote(merged);
      if (JSON.stringify(out) !== JSON.stringify(forRemote(list))) {
        try { await push(cfg.repo || SYNC_REPO, cfg.token, out, sha); }
        catch (e) { if (e.conflict && attempt < 3) continue; throw e; }
      }
      await syncKey(cfg.repo || SYNC_REPO, cfg.token);
      syncedHash = JSON.stringify(forRemote(scripts));
      store.set('tp.scripts', scripts);
      syncAt = Date.now();
      syncStatus('ok');
      if (changed && $('#library').classList.contains('on')) renderLibrary();
      break;
    }
  } catch (e) {
    syncStatus('error', e.message);
  } finally {
    syncBusy = false;
    if (syncAgain) { syncAgain = false; scheduleSync(300); }
  }
}

$('#btn-sync').onclick = () => {
  const box = $('#syncbox');
  box.hidden = !box.hidden;
  $('#sync-repo').value = syncCfg()?.repo || SYNC_REPO;
  $('#sync-token').placeholder = syncCfg()?.token ? '•••••••• (zapisany)' : 'github_pat_…';
};
$('#sync-save').onclick = () => {
  const token = $('#sync-token').value.trim() || syncCfg()?.token;
  const repo = $('#sync-repo').value.trim() || SYNC_REPO;
  if (!token) { syncStatus('error', 'Wklej token GitHub'); return; }
  store.set('tp.sync', { token, repo });
  $('#sync-token').value = '';
  $('#sync-token').placeholder = '•••••••• (zapisany)';
  syncNow();
};
$('#sync-off').onclick = () => {
  if (!confirm('Wyłączyć synchronizację na tym urządzeniu? Skrypty zostają na urządzeniu i w repozytorium.')) return;
  try { localStorage.removeItem('tp.sync'); } catch { /* nic */ }
  syncStatus('off');
};

// pobieranie zmian z innych urządzeń: przy starcie, po powrocie do aplikacji i co minutę (nie w trakcie czytania)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(); });
setInterval(() => { if (document.visibilityState === 'visible' && !playing && !counting) syncNow(); }, 60000);

// ikonka ⓘ pokazuje/chowa objaśnienie (w etykiecie przełącznika nie może go przełączać)
for (const btn of $$('.info')) {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    btn.classList.toggle('on', $('#' + btn.dataset.help).classList.toggle('open'));
  });
}

bindSettings();
renderLibrary();
scheduleSync();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// diagnostyka: adres z #debug udostępnia stan śledzenia głosu w konsoli
if (location.hash === '#debug') {
  window.tp = { voice, get words() { return { wordNorms, wordY, voiceCur, voiceTarget, offset, vCur }; }, velocity };
}
