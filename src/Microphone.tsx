import { useEffect, useRef, useState } from 'react';
import { detectPitch, heardName } from './pitch';
import { SilenceGate } from './silence-gate';
import { sensitivity } from './calibration';

type Props = { target: number; paused: boolean; sound: boolean; volume: number; onEnableSound: () => void; onMatch: () => void; onWrong: () => void; onActive: (active: boolean) => void; onReady: (ready: boolean) => void };
export function Microphone(props: Props) {
  const latest = useRef(props); latest.current = props;
  const [active, setActive] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('Включи микрофон и сыграй одну струну.');
  const [level, setLevel] = useState(0);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<'listening' | 'waiting' | 'wrong' | 'correct'>('listening');
  const silenceGate = useRef(new SilenceGate());
  const wrongUntil = useRef(0);
  const matchTimeout = useRef<number | undefined>(undefined);
  const notificationGain = useRef<GainNode | null>(null);
  const [calibrating, setCalibrating] = useState(true);
  const calibration = useRef({ phase: 'noise', noise: [] as number[], signal: [] as number[], noiseLevel: 0.0001 });
  const thresholds = useRef({ detection: 0.006, silence: 0.006, reference: 0.02 });
  function recalibrate() {
    clearTimeout(matchTimeout.current);
    calibration.current = { phase: 'noise', noise: [], signal: [], noiseLevel: 0.0001 };
    setCalibrating(true); silenceGate.current.reset(); latest.current.onReady(false);
    stable.current.midi = -1;
    stable.current.matched = false;
    stable.current.readyAt = performance.now() + 500;
    setStatus('waiting'); setMessage('Настройка: приглуши все струны на пару секунд — измерю фоновый шум.');
  }
  function successCue() {
    const ctx = resources.current?.ctx;
    const current = latest.current;
    if (!ctx || !current.sound || current.volume === 0) return;
    const output = ctx.createGain(); output.gain.value = current.volume / 100;
    notificationGain.current = output; output.connect(ctx.destination);
    const tone = ctx.createOscillator(); const envelope = ctx.createGain();
    tone.type = 'triangle'; tone.frequency.setValueAtTime(880, ctx.currentTime);
    tone.frequency.setValueAtTime(1318.5, ctx.currentTime + 0.14);
    envelope.gain.setValueAtTime(0, ctx.currentTime);
    envelope.gain.linearRampToValueAtTime(0.28, ctx.currentTime + 0.012);
    envelope.gain.setValueAtTime(0.2, ctx.currentTime + 0.14);
    envelope.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.38);
    tone.connect(envelope); envelope.connect(output);
    tone.onended = () => { tone.disconnect(); envelope.disconnect(); output.disconnect(); if (notificationGain.current === output) notificationGain.current = null; };
    tone.start(); tone.stop(ctx.currentTime + 0.4);
  }
  useEffect(() => {
    if (notificationGain.current) notificationGain.current.gain.value = props.sound ? props.volume / 100 : 0;
  }, [props.sound, props.volume]);
  const resources = useRef<{ stream: MediaStream; ctx: AudioContext; interval: number } | null>(null);
  const generation = useRef(0);
  const stable = useRef({ midi: -1, since: 0, target: props.target, matched: false, readyAt: 0 });
  function stop() {
    silenceGate.current.reset(); latest.current.onReady(false);
    clearTimeout(matchTimeout.current);
    notificationGain.current = null;
    setStatus('listening');
    generation.current++;
    const r = resources.current; resources.current = null;
    if (r) { clearInterval(r.interval); r.stream.getTracks().forEach(t => t.stop()); void r.ctx.close(); }
    setActive(false); setPending(false); setLevel(0); latest.current.onActive(false);
  }
  useEffect(() => {
    setStatus('listening'); wrongUntil.current = 0;
    const hidden = () => { if (document.hidden) { stop(); setMessage('Микрофон выключен. Вернись и включи его, когда будешь готов.'); } };
    document.addEventListener('visibilitychange', hidden);
    return () => { document.removeEventListener('visibilitychange', hidden); stop(); };
  }, []);
  useEffect(() => {
    silenceGate.current.reset(); latest.current.onReady(false);
    setStatus('waiting'); wrongUntil.current = 0;
    stable.current = { midi: -1, since: 0, target: props.target, matched: false, readyAt: performance.now() + 700 };
    setMessage(active ? 'Приглуши струну. Дождусь затухания и начну слушать следующую ноту.' : 'Включи микрофон и приглуши струны перед началом.');
  }, [props.target]);
  async function start() {
    if (pending || active) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('Для микрофона открой сайт по HTTPS. Адрес http:// с IP компьютера на телефоне не подойдёт.'); return;
    }
    setError(''); setPending(true);
    const token = ++generation.current;
    let ctx: AudioContext | null = null;
    let stream: MediaStream | null = null;
    try {
      ctx = new AudioContext();
      await ctx.resume();
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
      if (generation.current !== token) { stream.getTracks().forEach(t => t.stop()); void ctx.close(); return; }
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser(); analyser.fftSize = 4096;
      source.connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      const rate = ctx.sampleRate;
      recalibrate();
      silenceGate.current.reset(); latest.current.onReady(false);
      stable.current = { midi: -1, since: 0, target: latest.current.target, matched: false, readyAt: performance.now() + 400 };
      const interval = window.setInterval(() => {
        const current = latest.current;
        if (current.paused || document.hidden) { silenceGate.current.reset(); current.onReady(false); stable.current.midi = -1; setStatus('listening'); setMessage('Пауза — закрой подсказки и окно настроек, затем приглуши струны.'); return; }
        const now = performance.now();
        if (now < stable.current.readyAt || stable.current.matched) return;
        analyser.getFloatTimeDomainData(data);
        let energy = 0; for (const value of data) energy += value * value;
        const rms = Math.sqrt(energy / data.length);
        setLevel(Math.min(100, rms / thresholds.current.reference * 80));
        const setup = calibration.current;
        if (setup.phase === 'noise') {
          setup.noise.push(rms);
          setMessage('Настройка: приглуши все струны на пару секунд — измерю фоновый шум.');
          if (setup.noise.length >= 20) {
            const sorted = [...setup.noise].sort((a, b) => a - b);
            setup.noiseLevel = Math.max(0.00001, sorted[Math.floor(sorted.length * 0.75)]);
            setup.phase = 'string';
          }
          return;
        }
        if (setup.phase === 'string') {
          const sample = detectPitch(data, rate, Math.max(0.00003, setup.noiseLevel * 2));
          if (sample?.midi === 40 && Math.abs(sample.cents) <= 45) setup.signal.push(rms);
          else setup.signal = [];
          setMessage(sample && sample.midi !== 40 ? `Слышу ${heardName(sample.midi)}. Для настройки сыграй Ми: 6-я, самая толстая струна, открытая (лад 0).` : 'Сыграй Ми: 6-я, самая толстая струна, открытая (лад 0). Играй с обычной комфортной громкостью.');
          if (setup.signal.length >= 5) {
            const measured = [...setup.signal].sort((a, b) => a - b)[2];
            const tuned = sensitivity(setup.noiseLevel, measured);
            if (tuned) {
              thresholds.current = tuned; setup.phase = 'done'; setCalibrating(false);
              silenceGate.current.reset(); setMessage('Чувствительность настроена! Приглуши струну, затем начнём тренировку.');
            } else setMessage('Струну трудно отличить от фона. Поднеси телефон ближе или убери фоновый шум и повтори настройку.');
          }
          return;
        }
        if (!silenceGate.current.ready) {
          stable.current.midi = -1;
          if (silenceGate.current.update(rms, now, thresholds.current.silence)) {
            current.onReady(true); setStatus('listening'); setMessage('Слушаю… Теперь сыграй новую ноту.');
          } else {
            setStatus('waiting'); setMessage('Приглуши струну. Дождусь затухания — предыдущий звук не считается ответом.');
          }
          return;
        }
        const pitch = detectPitch(data, rate, thresholds.current.detection);
        if (!pitch) { stable.current.midi = -1; if (now < wrongUntil.current) return; setStatus('listening'); setMessage(rms > thresholds.current.detection ? 'Слышу звук, но нота неясна. Сыграй одну струну, остальные приглуши.' : 'Слушаю… Сыграй одну струну.'); return; }
        if (pitch.midi !== stable.current.midi) { stable.current.midi = pitch.midi; stable.current.since = now; return; }
        if (now - stable.current.since < 220) return;
        if (pitch.midi === current.target && Math.abs(pitch.cents) <= 40) {
          stable.current.matched = true; setStatus('correct'); setMessage(`Верно! ${heardName(pitch.midi)}.`);
          successCue();
          // Finish the cue before transitioning; the next note waits for sustained quiet.
          matchTimeout.current = window.setTimeout(() => {
            if (generation.current !== token) return;
            if (latest.current.paused || document.hidden) { stable.current.matched = false; stable.current.midi = -1; return; }
            current.onMatch();
          }, 460);
        } else {
          setStatus('wrong'); wrongUntil.current = now + 1000;
          const octave = pitch.midi % 12 === current.target % 12 && pitch.midi !== current.target;
          setMessage(pitch.midi === current.target ? `Распознано: ${heardName(pitch.midi)}, но струна звучит ${pitch.cents > 0 ? 'выше' : 'ниже'} нужного. Проверь настройку.` : `Распознано: ${heardName(pitch.midi)}. ${octave ? 'Название верное, но нужна другая высота — проверь струну.' : 'Это другая нота. Попробуй другой лад или струну.'}`);
          current.onWrong();
        }
      }, 80);
      resources.current = { stream, ctx, interval };
      ctx.onstatechange = () => {
        if (resources.current?.ctx === ctx && ctx?.state === 'suspended') {
          stop(); setMessage('Звук был приостановлен браузером. Включи микрофон ещё раз.');
        }
      };
      stream.getAudioTracks().forEach(track => track.addEventListener('ended', () => { stop(); setError('Микрофон отключился. Включи его ещё раз.'); }));
      setActive(true); setPending(false); setStatus('waiting'); setMessage('Приглуши струны. Начну слушать после затухания.'); latest.current.onActive(true);
    } catch (e) {
      stream?.getTracks().forEach(t => t.stop()); if (ctx) void ctx.close();
      if (generation.current !== token) return;
      setPending(false);
      const name = e instanceof DOMException ? e.name : '';
      setError(name === 'NotAllowedError' ? 'Доступ к микрофону не разрешён. Разреши его в настройках сайта в браузере и попробуй снова.' : name === 'NotFoundError' ? 'Микрофон не найден. Проверь устройство.' : 'Не удалось включить микрофон. Закрой другие приложения со звуком и попробуй снова.');
    }
  }
  return <section className={`microphone-panel mic-${error ? 'wrong' : status}`} aria-label="Микрофон">
    {active && calibrating && <div className="calibration-title"><strong>Настроим микрофон под твою гитару</strong><span>Ми (E) · 6-я струна · открытая, лад 0</span><small>Сначала тишина, затем один щипок обычной громкости. Это не задание и не влияет на результат.</small></div>}
    <div className="mic-controls"><button className="primary" onClick={active || pending ? stop : () => void start()}>{pending ? 'Отменить подключение' : active ? 'Выключить микрофон' : 'Включить микрофон'}</button><div className="mic-level" aria-label="Уровень входящего звука"><div style={{ width: `${level}%` }} /></div></div>
    {error ? <p role="alert">{error}</p> : <p role="status"><span className="mic-status-icon" aria-hidden="true">{status === 'wrong' ? '↔' : status === 'correct' ? '✓' : '●'}</span>{message}</p>}
    <div className="mic-settings">
      {active && <button className="text-button" onClick={recalibrate}>Настроить чувствительность заново</button>}
      {!props.sound || props.volume === 0 ? <button className="text-button" onClick={props.onEnableSound}>Включить звук правильного ответа</button> : active && <button className="text-button" onClick={() => {
        if (calibration.current.phase !== 'done') return;
        silenceGate.current.reset(); latest.current.onReady(false);
        stable.current.readyAt = performance.now() + 800;
        stable.current.midi = -1;
        successCue();
      }} disabled={calibrating}>Проверить сигнал успеха</button>}
    </div>
    <small>Звук обрабатывается на устройстве и не записывается. Можно искать нужную ноту без ограничения попыток.</small>
  </section>;
}
