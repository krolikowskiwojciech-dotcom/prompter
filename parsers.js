// Import skryptów: txt, md, rtf, docx, pdf, pages. Bez zależności poza pdf.js (ładowany z CDN tylko dla PDF).
// Moduł działa też w Node 24 (testy parserów na prawdziwych plikach) — poza PDF.

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';

export async function fileToScript(name, buf) {
  const ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';
  const title = name.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').trim();
  const bytes = new Uint8Array(buf);
  let text;
  if (ext === 'rtf') text = rtfToText(latin1(bytes));
  else if (ext === 'docx') text = await docxToText(buf);
  else if (ext === 'pdf') text = await pdfToText(buf);
  else if (ext === 'pages') text = await pagesToText(buf);
  else if (looksLikeRtf(bytes)) text = rtfToText(latin1(bytes));
  else if (isZip(bytes)) text = await docxToText(buf);
  else text = decodeText(bytes);
  return { title, text: normalize(text) };
}

// --- tekst ---------------------------------------------------------------

export function decodeText(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return new TextDecoder('windows-1250').decode(bytes); }
}

function latin1(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  return s;
}

const looksLikeRtf = (b) => b[0] === 0x7b && b[1] === 0x5c && b[2] === 0x72 && b[3] === 0x74; // {\rt
const isZip = (b) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

// Wspólna normalizacja: akapity rozdzielone pustą linią. Jeśli dokument nie ma żadnej pustej
// linii (typowe dla RTF/DOCX, gdzie każdy akapit to osobna linia), każda linia staje się akapitem.
export function normalize(text) {
  let t = text.replace(/\r\n?/g, '\n').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n');
  t = t.trim();
  if (!/\n\s*\n/.test(t)) t = t.replace(/\n/g, '\n\n');
  return t.replace(/\n{3,}/g, '\n\n');
}

// --- RTF -----------------------------------------------------------------

const RTF_SKIP = new Set(['fonttbl', 'colortbl', 'expandedcolortbl', 'stylesheet', 'info', 'pict', 'object',
  'header', 'footer', 'headerl', 'headerr', 'footerl', 'footerr', 'listtable', 'listoverridetable', 'rsidtbl',
  'generator', 'xmlnstbl', 'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'fldinst', 'filetbl',
  'revtbl', 'pgdsctbl', 'nonshppict', 'NeXTGraphic']);
const RTF_CHARS = { emdash: '—', endash: '–', lquote: '‘', rquote: '’', ldblquote: '„', rdblquote: '”', bullet: '•' };

export function rtfToText(src) {
  let dec;
  const cp = (src.match(/\\ansicpg(\d+)/) || [])[1];
  try { dec = new TextDecoder(cp === '10000' ? 'macintosh' : 'windows-' + (cp || '1252')); }
  catch { dec = new TextDecoder('windows-1252'); }

  let out = '', pending = [], skipChars = 0;
  let state = { skip: false, uc: 1 };
  const stack = [];
  const flush = () => { if (pending.length) { out += dec.decode(Uint8Array.from(pending)); pending = []; } };
  const emit = (s) => { if (!state.skip) { flush(); out += s; } };

  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '{') { flush(); stack.push({ ...state }); i++; continue; }
    if (c === '}') { flush(); state = stack.pop() || state; i++; continue; }
    if (c === '\\') {
      const n = src[i + 1];
      if (n === '\\' || n === '{' || n === '}') { emit(n); i += 2; continue; }
      if (n === "'") {
        const hex = src.substr(i + 2, 2); i += 4;
        if (skipChars > 0) { skipChars--; continue; }
        if (!state.skip) pending.push(parseInt(hex, 16));
        continue;
      }
      if (n === '*') { state.skip = true; i += 2; continue; }
      if (n === '~') { emit(' '); i += 2; continue; }
      if (n === '_') { emit('-'); i += 2; continue; }
      if (n === '-') { i += 2; continue; }
      if (n === '\n' || n === '\r') { emit('\n'); i += 2; continue; }
      const m = /^([a-zA-Z]+)(-?\d+)? ?/.exec(src.slice(i + 1, i + 48));
      if (!m) { i++; continue; }
      i += 1 + m[0].length;
      const word = m[1], arg = m[2] !== undefined ? parseInt(m[2], 10) : null;
      if (RTF_SKIP.has(word)) { state.skip = true; continue; }
      if (state.skip) continue;
      if (word === 'par' || word === 'line' || word === 'sect' || word === 'page') emit('\n');
      else if (word === 'tab') emit('\t');
      else if (word === 'uc') state.uc = arg ?? 1;
      else if (word === 'u') { emit(String.fromCharCode(arg < 0 ? arg + 65536 : arg)); skipChars = state.uc; }
      else if (RTF_CHARS[word]) emit(RTF_CHARS[word]);
      continue;
    }
    i++;
    if (c === '\r' || c === '\n') continue;
    if (skipChars > 0) { skipChars--; continue; }
    if (!state.skip) { flush(); out += c; }
  }
  flush();
  return out;
}

// --- ZIP (docx, pages) ---------------------------------------------------

export async function unzip(buf, wanted) {
  const dv = new DataView(buf);
  let eocd = -1;
  for (let p = buf.byteLength - 22; p >= Math.max(0, buf.byteLength - 65557); p--) {
    if (dv.getUint32(p, true) === 0x06054b50) { eocd = p; break; }
  }
  if (eocd < 0) throw new Error('To nie jest poprawny plik ZIP');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const utf8 = new TextDecoder();
  const files = {};
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = utf8.decode(new Uint8Array(buf, p + 46, nlen));
    p += 46 + nlen + elen + clen;
    if (!wanted(name)) continue;
    const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    const data = new Uint8Array(buf, start, csize);
    if (method === 0) files[name] = data.slice().buffer;
    else if (method === 8) {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      files[name] = await new Response(stream).arrayBuffer();
    }
  }
  return files;
}

const XML_ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unxml = (s) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (XML_ENT[e] ?? m));

export async function docxToText(buf) {
  const files = await unzip(buf, (n) => n === 'word/document.xml');
  const xml = files['word/document.xml'];
  if (!xml) throw new Error('Brak treści dokumentu Word');
  const doc = new TextDecoder().decode(xml);
  const paras = [];
  const pRe = /<w:p\b[^>]*?(?:\/>|>([\s\S]*?)<\/w:p>)/g;
  let m;
  while ((m = pRe.exec(doc))) {
    let line = '';
    const tRe = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\b[^>]*\/>|<w:cr\/>/g;
    let t;
    while ((t = tRe.exec(m[1] || ''))) {
      if (t[1] !== undefined) line += unxml(t[1]);
      else if (t[0].startsWith('<w:tab')) line += '\t';
      else line += '\n';
    }
    paras.push(line);
  }
  return paras.join('\n');
}

// Pages: tekst główny leży w Index/Document.iwa (bloki Snappy z protobufem). Pole `text` magazynu
// tekstu (TSWP.StorageArchive, pole 3) to najdłuższy napis UTF-8 w dokumencie — ten wybieramy.
// Starsze pliki mają w środku preview.pdf — wtedy zapasowo czytamy PDF.
export async function pagesToText(buf) {
  const files = await unzip(buf, (n) => /(^|\/)Index\/Document\.iwa$/.test(n) || /(^|\/)preview\.pdf$/i.test(n));
  const iwa = Object.entries(files).find(([n]) => n.endsWith('Document.iwa'))?.[1];
  if (iwa) {
    const text = longestProtoString(iwaInflate(new Uint8Array(iwa)));
    if (text) return text.replace(/\u2028/g, '\n').replace(/[\ufffc\u2029]/g, '\n').replace(/\u0004|\u0005/g, '');
  }
  const pdf = Object.entries(files).find(([n]) => /preview\.pdf$/i.test(n))?.[1];
  if (pdf) return pdfToText(pdf);
  throw new Error('nie udało się odczytać tekstu z Pages. Wyeksportuj go w Pages jako TXT, RTF albo Word.');
}

function iwaInflate(src) {
  const parts = [];
  let p = 0;
  while (p + 4 <= src.length) {
    const len = src[p + 1] | (src[p + 2] << 8) | (src[p + 3] << 16);
    parts.push(snappy(src.subarray(p + 4, p + 4 + len)));
    p += 4 + len;
  }
  const out = new Uint8Array(parts.reduce((a, b) => a + b.length, 0));
  let o = 0;
  for (const part of parts) { out.set(part, o); o += part.length; }
  return out;
}

function snappy(src) {
  let p = 0, size = 0, shift = 0, b;
  do { b = src[p++]; size |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
  const out = new Uint8Array(size);
  let o = 0;
  while (p < src.length && o < size) {
    const tag = src[p++], type = tag & 3;
    if (type === 0) {
      let len = tag >> 2;
      if (len >= 60) { const n = len - 59; len = 0; for (let k = 0; k < n; k++) len |= src[p++] << (8 * k); }
      len += 1;
      out.set(src.subarray(p, p + len), o); p += len; o += len;
      continue;
    }
    let len, off;
    if (type === 1) { len = ((tag >> 2) & 7) + 4; off = ((tag >> 5) << 8) | src[p++]; }
    else if (type === 2) { len = (tag >> 2) + 1; off = src[p] | (src[p + 1] << 8); p += 2; }
    else { len = (tag >> 2) + 1; off = (src[p] | (src[p + 1] << 8) | (src[p + 2] << 16) | (src[p + 3] << 24)) >>> 0; p += 4; }
    for (let k = 0; k < len; k++, o++) out[o] = out[o - off];
  }
  return out;
}

function longestProtoString(bytes) {
  const dec = new TextDecoder('utf-8', { fatal: true });
  let best = '';
  for (let i = 0; i < bytes.length - 2; i++) {
    if (bytes[i] !== 0x1a) continue; // pole 3, typ: ciąg bajtów
    let len = 0, shift = 0, p = i + 1, b;
    do { b = bytes[p++]; len |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80 && shift < 35);
    if (len <= best.length || p + len > bytes.length) continue;
    try {
      const s = dec.decode(bytes.subarray(p, p + len));
      if (/\p{L}{3,}/u.test(s) && !/[\u0000-\u0003\u0006-\u0008\u000e-\u001f]/.test(s)) best = s;
    } catch { /* to nie był tekst */ }
  }
  return best;
}

// --- PDF -----------------------------------------------------------------

let pdfjsReady;
function loadPdfJs() {
  if (globalThis.pdfjsLib) return Promise.resolve(globalThis.pdfjsLib);
  pdfjsReady ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PDFJS + 'pdf.min.js';
    s.onload = () => {
      globalThis.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
      resolve(globalThis.pdfjsLib);
    };
    s.onerror = () => { pdfjsReady = null; reject(new Error('Do importu PDF potrzebny jest internet (pierwszy raz).')); };
    document.head.appendChild(s);
  });
  return pdfjsReady;
}

export async function pdfToText(buf) {
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const paras = [];
  let cur = '', lastY = null, lastH = 12;
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const tc = await page.getTextContent();
    lastY = null;
    for (const it of tc.items) {
      if (!('str' in it)) continue;
      const y = it.transform[5], h = it.height || Math.abs(it.transform[3]) || lastH;
      if (lastY !== null && Math.abs(y - lastY) > h * 0.4) {
        if (lastY - y > Math.max(h, lastH) * 1.7 || y > lastY) { paras.push(cur); cur = ''; }
        else if (cur && !cur.endsWith(' ')) cur += ' ';
      }
      cur += it.str;
      lastY = y; if (it.str.trim()) lastH = h;
    }
    paras.push(cur); cur = '';
  }
  return paras.map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n\n');
}
