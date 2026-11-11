// Film zostaje na urządzeniu; nie trafia do synchronizacji skryptów.
export function setupCamera({ pause, play, notify }) {
  const $ = (s) => document.querySelector(s);
  const preview = $('#camera-preview'), panel = $('#camera-panel'), result = $('#camera-result');
  let stream = null, recorder = null, busy = false, facing = 'user', chunks = [], file = null, url = null, timer = null, started = 0;
  let pendingSave = false, requestId = 0;
  const active = () => !!recorder && recorder.state !== 'inactive';
  const formats = {
    h264: ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2'],
    hevc: ['video/mp4;codecs=hvc1,mp4a.40.2', 'video/mp4;codecs=hev1,mp4a.40.2'],
  };
  const supported = types => types.find(t => window.MediaRecorder?.isTypeSupported(t));
  const controls = ['resolution', 'fps', 'format', 'quality'];
  let prefs = {};
  try { prefs = JSON.parse(localStorage.getItem('tp.camera') || '{}') || {}; } catch {}
  for (const key of controls) {
    const el = $('#camera-' + key);
    if ([...el.options].some(o => o.value === String(prefs[key]))) el.value = prefs[key];
    el.onchange = () => {
      try { localStorage.setItem('tp.camera', JSON.stringify(Object.fromEntries(controls.map(k => [k, $('#camera-' + k).value])))); } catch {}
      if (stream && ['resolution', 'fps'].includes(key)) open();
      else describe();
    };
  }
  for (const key of ['h264', 'hevc']) {
    const option = $('#camera-format').querySelector(`[value="${key}"]`);
    option.disabled = !supported(formats[key]);
    if (option.disabled) option.textContent += ' · niedostępny';
  }
  if ($('#camera-format').selectedOptions[0].disabled) $('#camera-format').value = 'auto';
  function mime() {
    const key = $('#camera-format').value;
    return supported(formats[key] || [...formats.h264, 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm']);
  }
  function bitrate() {
    const actual = stream?.getVideoTracks()[0]?.getSettings() || {};
    const pixels = (actual.width || 1920) * (actual.height || 1080);
    const base = pixels > 1920 * 1080 ? 35000000 : pixels > 1280 * 720 ? 12000000 : 6000000;
    return Math.round(base * Math.max(1, (actual.frameRate || 30) / 30) * ($('#camera-quality').value === 'high' ? 1.5 : 1));
  }
  function describe() {
    const track = stream?.getVideoTracks()[0];
    if (!track) { $('#camera-actual').textContent = 'Włącz aparat, aby sprawdzić rzeczywiste parametry.'; return; }
    const a = track.getSettings();
    const type = mime() || 'format przeglądarki';
    const label = /hvc1|hev1/.test(type) ? 'HEVC' : /avc1/.test(type) ? 'H.264' : type;
    $('#camera-actual').textContent = `Aparat: ${a.width || '?'} × ${a.height || '?'} · ${a.frameRate ? Math.round(a.frameRate * 10) / 10 : '?'} kl./s. Zapis: ${label}, docelowo ${Math.round(bitrate() / 1e6)} Mb/s. Parametry filmu mogą się różnić zależnie od wydajności telefonu.`;
  }

  const db = new Promise((resolve, reject) => {
    const req = indexedDB.open('prompter-video', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('recordings');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  async function storage(value) {
    const database = await db;
    return new Promise((resolve, reject) => {
      const tx = database.transaction('recordings', value === undefined ? 'readonly' : 'readwrite');
      const os = tx.objectStore('recordings');
      const req = value === undefined ? os.get('last') : os.put(value, 'last');
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  function showFile(saved) {
    file = new File([saved.blob], saved.name, { type: saved.blob.type });
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(file);
    $('#camera-playback').src = url;
    $('#camera-download').href = url;
    $('#camera-download').download = file.name;
    $('#camera-share').hidden = !navigator.canShare?.({ files: [file] });
    result.showModal();
  }
  storage().then(saved => { if (saved) { file = new File([saved.blob], saved.name, { type: saved.blob.type }); $('#camera-last').hidden = false; } }).catch(() => {});
  function render() {
    $('#camera-toggle').textContent = stream ? 'Wyłącz aparat' : 'Włącz aparat';
    $('#camera-record').disabled = !stream || busy;
    $('#camera-record').textContent = active() ? '■ Zakończ nagranie' : '● Nagraj i czytaj';
    $('#camera-toggle').disabled = busy || active();
    $('#camera-flip').disabled = busy || active();
    $('#camera-close').disabled = busy || active();
    controls.forEach(k => { $('#camera-' + k).disabled = busy || active(); });
    $('#camera-stop').hidden = !active();
    describe();
    $('#prompter').classList.toggle('camera-on', !!stream);
  }
  function release() {
    const old = stream; stream = null;
    old?.getTracks().forEach(t => t.stop());
    preview.srcObject = null;
    render();
  }
  async function open() {
    if (busy || active()) return;
    pause(); release(); busy = true; render();
    const id = ++requestId;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Aparat wymaga HTTPS i obsługiwanej przeglądarki.');
      const acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: Math.round(Number($('#camera-resolution').value) * 16 / 9) }, height: { ideal: Number($('#camera-resolution').value) }, frameRate: { ideal: Number($('#camera-fps').value) } }, audio: { echoCancellation: true, noiseSuppression: true } });
      if (id !== requestId || document.hidden) { acquired.getTracks().forEach(t => t.stop()); return; }
      stream = acquired;
      preview.srcObject = stream;
      preview.style.transform = facing === 'user' ? 'scaleX(-1)' : '';
      await preview.play();
      stream.getTracks().forEach(t => t.addEventListener('ended', () => { finish(); release(); notify('Aparat lub mikrofon został odłączony.'); }));
    } catch (e) {
      release();
      notify(e.name === 'NotAllowedError' ? 'Zezwól na aparat i mikrofon w ustawieniach tej strony w Safari.' : 'Nie udało się włączyć aparatu. Zamknij inne aplikacje używające kamery i spróbuj ponownie.', 7000);
    } finally { busy = false; render(); }
  }
  function finish() {
    if (!active()) return;
    busy = true;
    recorder.stop();
    clearInterval(timer);
    pause(); render();
  }
  function record() {
    if (active()) return finish();
    if (!stream || busy) return;
    if (!window.MediaRecorder) return notify('Ta przeglądarka nie obsługuje nagrywania. Otwórz aplikację w aktualnym Safari.');
    if (file && !confirm('Rozpocząć nowe nagranie? Zastąpi ono poprzedni film przechowywany w aplikacji. Najpierw zapisz poprzedni film w Zdjęciach lub Plikach.')) return;
    try {
      const mimeType = mime();
      recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: bitrate(), audioBitsPerSecond: 128000 });
      chunks = [];
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      recorder.onerror = () => { notify('Nagrywanie zostało przerwane. Spróbuję zachować zebrany fragment.', 6000); finish(); };
      recorder.onstop = async () => {
        clearInterval(timer); pause();
        const blob = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || 'video/mp4' });
        chunks = []; recorder = null;
        if (blob.size) {
          const saved = { blob, name: `Prompter_${new Date().toISOString().replace(/[:.]/g, '-')}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}` };
          pendingSave = true;
          showFile(saved); $('#camera-last').hidden = false;
          $('#camera-save-status').textContent = 'Zachowuję film na tym urządzeniu…';
          try { await storage(saved); pendingSave = false; $('#camera-save-status').textContent = 'Film zachowany w aplikacji na tym urządzeniu. Zapisz go też w Zdjęciach lub Plikach.'; }
          catch { $('#camera-save-status').textContent = 'Brak miejsca na trwałą kopię. Pobierz lub udostępnij film przed zamknięciem aplikacji.'; }
        } else notify('Nie udało się zapisać filmu — nagranie jest puste.');
        busy = false; render();
      };
      recorder.start(1000); started = Date.now();
      const tick = () => { const s = Math.floor((Date.now() - started) / 1000); $('#camera-stop').textContent = `■ Zakończ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
      tick(); timer = setInterval(tick, 500);
      panel.hidden = true; render(); play();
    } catch { busy = false; recorder = null; render(); notify('Nie udało się rozpocząć nagrywania w tej przeglądarce.'); }
  }
  $('#p-camera').onclick = () => { pause(); panel.hidden = !panel.hidden; };
  $('#camera-close').onclick = () => { panel.hidden = true; };
  $('#camera-toggle').onclick = () => { if (stream) { pause(); release(); } else open(); };
  $('#camera-flip').onclick = () => { facing = facing === 'user' ? 'environment' : 'user'; open(); };
  $('#camera-record').onclick = record;
  $('#camera-stop').onclick = finish;
  $('#camera-last').onclick = () => { if (file) showFile({ blob: file, name: file.name }); };
  $('#camera-result-close').onclick = () => { $('#camera-playback').pause(); result.close(); };
  result.addEventListener('close', () => $('#camera-playback').pause());
  $('#camera-share').onclick = async () => {
    try { await navigator.share({ files: [file], title: 'Nagranie z promptera' }); }
    catch (e) { if (e.name !== 'AbortError') notify('Nie udało się udostępnić. Użyj przycisku Pobierz film.'); }
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden && stream) { finish(); release(); } });
  window.addEventListener('beforeunload', e => { if (active() || busy || pendingSave) { e.preventDefault(); e.returnValue = ''; } });
  render();
  return { audio: () => stream, busy: () => busy || active() || pendingSave, close: () => { requestId++; finish(); release(); panel.hidden = true; } };
}
