// Film zostaje na urządzeniu; nie trafia do synchronizacji skryptów.
export function setupCamera({ pause, play, notify }) {
  const $ = (s) => document.querySelector(s);
  const preview = $('#camera-preview'), panel = $('#camera-panel'), result = $('#camera-result');
  let stream = null, recorder = null, busy = false, facing = 'user', chunks = [], file = null, url = null, timer = null, started = 0;
  let pendingSave = false, requestId = 0;
  const active = () => !!recorder && recorder.state !== 'inactive';
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
    $('#camera-stop').hidden = !active();
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
      const acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: { echoCancellation: true, noiseSuppression: true } });
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
      const mimeType = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
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
