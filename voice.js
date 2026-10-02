// Śledzenie głosu: mikrofon → ElevenLabs Scribe v2 Realtime → dopasowanie do słów skryptu.
// Głos tylko KORYGUJE tempo (tryb mieszany) — gdy rozpoznawanie się zgubi, tekst płynie dalej w stałym tempie.

const API = 'https://api.elevenlabs.io/v1';
const WS = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime';
const RATE = 16000;
const CHUNK = RATE / 10; // 100 ms

// ---------- dopasowanie (czyste funkcje, testowalne w Node) ----------

export const norm = (w) => w.toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');

export const splitWords = (text) => (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).map(norm).filter(Boolean);

// 1 = to samo słowo, 0.8 = ta sama końcówka odmiany zgubiona („stopa”/„stopy”), 0 = różne
function sim(a, b) {
  if (a === b) return 1;
  if (a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4)) return 0.8;
  if (a.length >= 3 && b.length >= 3 && Math.abs(a.length - b.length) <= 1 && lev1(a, b)) return 0.7;
  return 0;
}
function lev1(a, b) { // odległość edycyjna ≤ 1
  let i = 0, j = 0, d = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++d > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return d + (a.length - i) + (b.length - j) <= 1;
}
const weight = (w) => (w.length <= 2 ? 0.35 : w.length <= 3 ? 0.7 : 1);

// ważone LCS: ile ostatnio wypowiedzianych słów pasuje (po kolei) do fragmentu skryptu kończącego się na j
function score(spoken, script, j) {
  const from = Math.max(0, j - spoken.length - 3);
  const seg = script.slice(from, j + 1);
  const n = spoken.length, m = seg.length;
  let prev = new Array(m + 1).fill(0);
  for (let a = 1; a <= n; a++) {
    const cur = new Array(m + 1).fill(0);
    for (let b = 1; b <= m; b++) {
      const s = sim(spoken[a - 1], seg[b - 1]);
      cur[b] = Math.max(prev[b], cur[b - 1], s ? prev[b - 1] + s * weight(spoken[a - 1]) : 0);
    }
    prev = cur;
  }
  return prev[m];
}

// Zwraca indeks słowa skryptu, na którym mówca właśnie jest, albo -1.
// Szuka blisko bieżącej pozycji; dalej (powtórka, przeskok) tylko przy mocnym dopasowaniu.
export function locate(spokenTail, script, cur) {
  const spoken = spokenTail.slice(-7);
  if (spoken.length < 2) return -1;
  const last = spoken[spoken.length - 1], prevLast = spoken[spoken.length - 2];
  let best = -1, bestScore = 0;
  const lo = Math.max(0, cur - 25), hi = Math.min(script.length - 1, cur + 45);
  for (let j = lo; j <= hi; j++) {
    // kotwica: ostatnie (albo przedostatnie, jeśli ostatnie jest jeszcze niedokończone) słowo musi pasować
    if (!sim(last, script[j]) && !sim(prevLast, script[j])) continue;
    let s = score(spoken, script, j) - Math.abs(j - cur) * 0.012;
    if (j < cur - 3) s -= 0.6; // cofanie się (powtórka) wymaga pewniejszego dopasowania
    if (s > bestScore) { bestScore = s; best = j; }
  }
  const need = Math.min(2.2, 0.6 + spoken.filter((w) => w.length > 2).length * 0.45);
  return bestScore >= need ? best : -1;
}

// komendy głosowe: fraza (po normalizacji) → nazwa komendy
export const COMMANDS = { again: ['jeszcze', 'raz'], restart: ['skrypt', 'od', 'nowa'] };

// ile razy fraza pada w liście słów
export function countPhrase(words, phrase) {
  let n = 0;
  for (let i = 0; i + phrase.length <= words.length; i++) if (phrase.every((w, k) => words[i + k] === w)) n++;
  return n;
}
export const countAgain = (words) => countPhrase(words, COMMANDS.again);

// ---------- mikrofon + ElevenLabs ----------

const WORKLET = `class Tap extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
}
registerProcessor('af-tap', Tap);`;

export async function mintToken(apiKey) {
  const r = await fetch(`${API}/single-use-token/realtime_scribe`, { method: 'POST', headers: { 'xi-api-key': apiKey } });
  if (r.status === 401) throw new Error('Nieprawidłowy klucz API');
  if (!r.ok) throw new Error(`ElevenLabs odpowiedział błędem ${r.status}`);
  const { token } = await r.json();
  if (!token) throw new Error('Brak tokenu w odpowiedzi ElevenLabs');
  return token;
}

const b64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

export class Voice {
  constructor({ onStatus, onWords, onCommand, onCommitted }) {
    this.onStatus = onStatus;   // ('connecting'|'listening'|'error'|'off', komunikat?)
    this.onWords = onWords;     // (lista ostatnio wypowiedzianych słów, tekst do podglądu)
    this.onCommand = onCommand; // ('again' | 'restart') — padło „jeszcze raz” / „skrypt od nowa”
    this.onCommitted = onCommitted; // (tekst) — zatwierdzona wypowiedź, do dziennika nagrania
    this.cmdSeen = {};          // ile komend już obsłużono w bieżącej wypowiedzi (częściowe wyniki się powtarzają)
    this.committed = [];
    this.partial = [];
    this.lastSpeech = 0;
    this.active = false;
  }

  // Wywołać w obsłudze stuknięcia (iOS wymaga gestu do mikrofonu i dźwięku).
  start(apiKey) {
    if (this.active) return;
    this.active = true;
    this.apiKey = apiKey;
    this.committed = [];
    this.partial = [];
    this.cmdSeen = {};
    this.queue = [];
    this.queued = 0;
    this.onStatus('connecting');
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx.resume?.();
    this.setup().catch((e) => this.fail(e));
  }

  async setup() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Mikrofon wymaga adresu https');
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    if (!this.active) return this.release();
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
    await this.ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    if (!this.active) return this.release();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, 'af-tap');
    const mute = this.ctx.createGain();
    mute.gain.value = 0;
    src.connect(this.node).connect(mute).connect(this.ctx.destination);
    this.ratio = this.ctx.sampleRate / RATE;
    this.node.port.onmessage = (e) => this.push(e.data);
    await this.connect();
  }

  async connect() {
    const token = await mintToken(this.apiKey);
    if (!this.active) return;
    const q = new URLSearchParams({
      model_id: 'scribe_v2_realtime', language_code: 'pl', audio_format: 'pcm_16000', commit_strategy: 'vad', token,
    });
    const ws = new WebSocket(`${WS}?${q}`);
    this.ws = ws;
    ws.onmessage = (e) => this.message(JSON.parse(e.data));
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      // sesja zamknięta w trakcie czytania (limit czasu, sieć) — łączymy się od nowa, mikrofon zostaje
      if (this.active) setTimeout(() => this.active && this.connect().catch((err) => this.fail(err)), 600);
    };
  }

  message(m) {
    const t = m.message_type;
    if (t === 'session_started') this.onStatus('listening');
    else if (t === 'partial_transcript') {
      const w = splitWords(m.text || '');
      if (w.length !== this.partial.length || w[w.length - 1] !== this.partial[this.partial.length - 1]) this.lastSpeech = performance.now();
      this.partial = w;
      this.commands(w);
      this.emit(m.text);
    } else if (t === 'committed_transcript') {
      const w = splitWords(m.text || '');
      this.commands(w);
      this.cmdSeen = {}; // następna wypowiedź liczy od zera
      if (m.text) this.onCommitted?.(m.text);
      this.committed = this.committed.concat(w).slice(-20);
      this.partial = [];
      this.emit(m.text);
    } else if (m.error || /error|exceeded|limited/.test(t)) {
      const msg = t === 'auth_error' ? 'Nieprawidłowy klucz API' : t === 'quota_exceeded' ? 'Wyczerpany limit ElevenLabs' : (m.error || t);
      this.fail(new Error(msg));
    }
  }

  commands(words) {
    for (const [name, phrase] of Object.entries(COMMANDS)) {
      const n = countPhrase(words, phrase);
      if (n > (this.cmdSeen[name] || 0)) { this.cmdSeen[name] = n; this.onCommand?.(name); }
    }
  }

  emit(text) {
    this.onWords(this.committed.concat(this.partial), text);
  }

  // Float32 z mikrofonu → 16 kHz Int16 → paczki po 100 ms
  push(f32) {
    this.queue.push(f32);
    this.queued += f32.length;
    const need = Math.ceil(CHUNK * this.ratio);
    if (this.queued < need) return;
    const all = new Float32Array(this.queued);
    let o = 0;
    for (const q of this.queue) { all.set(q, o); o += q.length; }
    const outLen = Math.floor(all.length / this.ratio);
    const out = new Int16Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const a = Math.floor(i * this.ratio), b = Math.max(a + 1, Math.floor((i + 1) * this.ratio));
      let s = 0;
      for (let k = a; k < b; k++) s += all[k];
      const v = Math.max(-1, Math.min(1, s / (b - a)));
      out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    const used = Math.floor(outLen * this.ratio);
    this.queue = used < all.length ? [all.slice(used)] : [];
    this.queued = all.length - used;
    if (this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify({
        message_type: 'input_audio_chunk', audio_base_64: b64(new Uint8Array(out.buffer)), commit: false, sample_rate: RATE,
      }));
    }
  }

  fail(err) {
    this.onStatus('error', err.message || String(err));
    this.stop(true);
  }

  stop(keepStatus = false) {
    this.active = false;
    const ws = this.ws;
    this.ws = null;
    try { ws?.close(); } catch { /* już zamknięty */ }
    this.release();
    if (!keepStatus) this.onStatus('off');
  }

  release() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    try { this.node?.disconnect(); } catch { /* nic */ }
    this.node = null;
    this.ctx?.close?.().catch(() => {});
    this.ctx = null;
  }
}
