import { useEffect, useRef, useState } from 'react';
import { detectPitch, heardName } from './pitch';
import { TUNINGS, targetFrequency, tuningCents } from './tuner-math';

export function Tuner({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tuning, setTuning] = useState<keyof typeof TUNINGS>('standard');
  const [string, setString] = useState(0);
  const [active, setActive] = useState(false);
  const [pending, setPending] = useState(false);
  const [frequency, setFrequency] = useState<number | null>(null);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const samples = useRef<number[]>([]);
  const resources = useRef<{ context: AudioContext; stream: MediaStream; timer: number } | null>(null);
  const target = TUNINGS[tuning].notes[string];
  const cents = frequency === null ? null : tuningCents(frequency, target);
  const tuned = cents !== null && Math.abs(cents) <= 5;
  function stop() {
    generation.current++;
    const current = resources.current; resources.current = null;
    if (current) { clearInterval(current.timer); current.stream.getTracks().forEach(track => track.stop()); void current.context.close(); }
    samples.current = []; setActive(false); setPending(false); setFrequency(null);
  }
  useEffect(() => {
    dialog.current?.showModal();
    const hidden = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', hidden);
    return () => { document.removeEventListener('visibilitychange', hidden); stop(); };
  }, []);
  async function start() {
    if (active || pending) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('Для микрофона открой сайт по HTTPS или localhost.'); return;
    }
    setPending(true); setError('');
    const token = ++generation.current;
    let context: AudioContext | null = null;
    let stream: MediaStream | null = null;
    try {
      context = new AudioContext(); await context.resume();
      if (generation.current !== token) { void context.close(); return; }
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      if (generation.current !== token) { stream.getTracks().forEach(track => track.stop()); void context.close(); return; }
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser(); analyser.fftSize = 8192;
      source.connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      const rate = context.sampleRate;
      let lastHeard = 0;
      const timer = window.setInterval(() => {
        analyser.getFloatTimeDomainData(data);
        const pitch = detectPitch(data, rate, 0.002, 45);
        if (!pitch) {
          samples.current = [];
          if (performance.now() - lastHeard > 350) setFrequency(null);
          return;
        }
        lastHeard = performance.now();
        const values = samples.current;
        if (values.length && Math.abs(1200 * Math.log2(pitch.frequency / values[values.length - 1])) > 40) values.length = 0;
        values.push(pitch.frequency); if (values.length > 3) values.shift();
        if (values.length >= 3) setFrequency([...values].sort((a, b) => a - b)[1]);
      }, 80);
      resources.current = { context, stream, timer };
      stream.getAudioTracks().forEach(track => track.addEventListener('ended', () => {
        if (generation.current === token) { stop(); setError('Микрофон отключился. Включи его снова.'); }
      }));
      setActive(true); setPending(false);
    } catch (reason) {
      stream?.getTracks().forEach(track => track.stop()); if (context) void context.close();
      if (generation.current !== token) return;
      setPending(false);
      setError(reason instanceof DOMException && reason.name === 'NotAllowedError' ? 'Разреши доступ к микрофону в настройках браузера.' : 'Не удалось включить микрофон. Проверь подключение и попробуй снова.');
    }
  }
  const angle = cents === null ? 0 : Math.max(-25, Math.min(25, cents)) * 3;
  const message = !active ? 'Включи микрофон, чтобы настроить гитару' : cents === null ? 'Сыграй выбранную открытую струну' : tuned ? 'Струна настроена' : Math.abs(cents) > 150 ? 'Далеко от цели — проверь выбранную струну' : cents < 0 ? 'Ниже нужного — немного подтяни струну' : 'Выше нужного — немного ослабь струну';
  const backdrop = useRef(false);
  function outside(x: number, y: number) {
    const rect = dialog.current!.getBoundingClientRect();
    return x < rect.left || x > rect.right || y < rect.top || y > rect.bottom;
  }
  return <dialog ref={dialog} className="release-dialog tuner-dialog" aria-labelledby="tuner-title" onClose={onClose}
    onPointerDown={event => { backdrop.current = event.target === event.currentTarget && outside(event.clientX, event.clientY); }}
    onPointerUp={event => { if (backdrop.current && event.target === event.currentTarget && outside(event.clientX, event.clientY)) dialog.current?.close(); backdrop.current = false; }}
    onPointerCancel={() => { backdrop.current = false; }}>
    <div className="release-heading"><h2 id="tuner-title">Настроить гитару</h2><button className="text-button" autoFocus aria-label="Закрыть тюнер" onClick={() => dialog.current?.close()}>✕</button></div>
    <div className="tuner-content">
      <div className="cheat-view-switch" role="group" aria-label="Строй гитары">{(Object.keys(TUNINGS) as (keyof typeof TUNINGS)[]).map(key => <button key={key} aria-pressed={tuning === key} onClick={() => { setTuning(key); setFrequency(null); samples.current = []; }}>{TUNINGS[key].label}</button>)}</div>
      <p className="tuner-help">Выбери струну и играй её открытой, приглушив остальные.</p>
      <div className="tuner-strings" role="group" aria-label="Струна, от шестой к первой">{TUNINGS[tuning].notes.map((midi, index) => <button key={index} aria-pressed={string === index} onClick={() => { setString(index); setFrequency(null); samples.current = []; }}><small>{6 - index}-я</small><span>{heardName(midi)}</span></button>)}</div>
      <div className={`tuner-gauge ${tuned ? 'in-tune' : ''}`}>
        <svg viewBox="0 0 320 205" role="img" aria-label={frequency === null ? 'Шкала тюнера, нет сигнала' : `Сейчас ${frequency.toFixed(1)} Гц, нужно ${targetFrequency(target).toFixed(1)} Гц`}>
          <path className="tuner-arc" d="M 44 149 A 120 120 0 0 1 276 149" />
          <path className="tuner-zone" d="M 129 64 A 120 120 0 0 1 191 64" />
          {Array.from({ length: 21 }, (_, i) => { const a = (i - 10) * 7.5 * Math.PI / 180; const r = i % 5 === 0 ? 99 : 106; return <line key={i} x1={160 + Math.sin(a) * r} y1={180 - Math.cos(a) * r} x2={160 + Math.sin(a) * 116} y2={180 - Math.cos(a) * 116} stroke="currentColor" strokeWidth={i % 5 === 0 ? 2 : 1} />; })}
          <text x="30" y="174">Ниже</text><text x="160" y="40">В цель</text><text x="290" y="174">Выше</text>
          <g className="tuner-needle" style={{ transform: `rotate(${angle}deg)`, opacity: cents === null ? 0.2 : 1 }}><path d="M 156 180 L 160 78 L 164 180 Z" fill="currentColor" /></g>
          <circle cx="160" cy="180" r="7" fill="currentColor" />
        </svg>
        <strong>{heardName(target)}</strong><span>{6 - string}-я открытая</span>
        <div className="tuner-reading tuner-frequencies"><div><small>Сейчас</small><strong>{frequency === null ? '—' : `${frequency.toFixed(1)} Гц`}</strong></div><div><small>Нужно</small><strong>{targetFrequency(target).toFixed(1)} Гц</strong></div></div>
      </div>
      <p className="tuner-status" role="status">{message}</p>
      {error && <p className="tuner-error" role="alert">{error}</p>}
      <button className="primary" onClick={active || pending ? stop : () => void start()}>{pending ? 'Отменить подключение' : active ? 'Выключить микрофон' : 'Включить микрофон'}</button>
    </div>
  </dialog>;
}
