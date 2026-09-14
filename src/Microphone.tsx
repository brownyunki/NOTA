import { useEffect, useRef, useState } from 'react';
import { detectPitch, heardName } from './pitch';
import { SilenceGate } from './silence-gate';
import { sensitivity } from './calibration';
// Memory only: shared by workouts and modes, cleared by a page refresh.
let visitCalibration: NonNullable<ReturnType<typeof sensitivity>> | null = null;

type Props = { target: number; completed: boolean; paused: boolean; sound: boolean; volume: number; onTraining: (training: boolean) => void; onEnableSound: () => void; onMatch: () => void; onWrong: () => void; onActive: (active: boolean) => void; onReady: (ready: boolean) => void };
export function Microphone(props: Props) {
  const latest = useRef(props); latest.current = props;
  const [active, setActive] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('Включи микрофон и сыграй ноту на экране.');
  const [level, setLevel] = useState(0);
  const [error, setError] = useState('');
  const [heardNotes, setHeardNotes] = useState<string[]>([]);
  const previewNote = useRef<number | null>(null);
  const [status, setStatus] = useState<'listening' | 'waiting' | 'wrong' | 'correct'>('listening');
  const silenceGate = useRef(new SilenceGate());
  const wrongUntil = useRef(0);
  const matchTimeout = useRef<number | undefined>(undefined);
  const notificationGain = useRef<GainNode | null>(null);
  const [calibrating, setCalibrating] = useState(visitCalibration === null);
  const [phase, setPhase] = useState<'noise' | 'string' | 'damp' | 'high' | 'ready'>(visitCalibration ? 'ready' : 'noise');
  const [training, setTraining] = useState(false);
  const trainingRef = useRef(false);
  const calibration = useRef({ phase: 'noise', noise: [] as number[], signal: [] as number[], noiseLevel: 0.0001, bassLevel: 0 });
  const thresholds = useRef({ detection: 0.006, silence: 0.006, reference: 0.02, noise: 0.0001 });
  function recalibrate() {
    setHeardNotes([]); previewNote.current = null;
    visitCalibration = null;
    trainingRef.current = false; setTraining(false); latest.current.onTraining(false); setPhase('noise');
    clearTimeout(matchTimeout.current);
    calibration.current = { phase: 'noise', noise: [], signal: [], noiseLevel: 0.0001, bassLevel: 0 };
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
    tone.type = 'sine'; tone.frequency.setValueAtTime(659.25, ctx.currentTime);
    tone.frequency.linearRampToValueAtTime(783.99, ctx.currentTime + 0.18);
    envelope.gain.setValueAtTime(0, ctx.currentTime);
    envelope.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.035);
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
    setMessage('Микрофон выключен. Чтобы продолжить, включи его.');
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
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      const rate = ctx.sampleRate;
      if (visitCalibration) {
        thresholds.current = visitCalibration; calibration.current.phase = 'done'; setCalibrating(false); setPhase('ready');
      } else recalibrate();
      silenceGate.current.reset(); latest.current.onReady(false);
      stable.current = { midi: -1, since: 0, target: latest.current.target, matched: false, readyAt: performance.now() + 400 };
      const interval = window.setInterval(() => {
        const current = latest.current;
        // Keep the input meter live even while answer checking is paused.
        analyser.getFloatTimeDomainData(data);
        let energy = 0; for (const value of data) energy += value * value;
        const rms = Math.sqrt(energy / data.length);
        setLevel(Math.min(100, rms / thresholds.current.reference * 80));
        if (current.completed) { silenceGate.current.reset(); current.onReady(false); setStatus('waiting'); setMessage('Тренировка завершена. Микрофон включён, проверка нот на паузе. Можно начать ещё 10 нот.'); return; }
        if (current.paused || document.hidden) { silenceGate.current.reset(); current.onReady(false); stable.current.midi = -1; setStatus('waiting'); setMessage('Пауза — закрой подсказки и окно настроек, затем приглуши струны.'); return; }
        const now = performance.now();
        if (now < stable.current.readyAt || stable.current.matched) return;
        const setup = calibration.current;
        if (setup.phase === 'noise') {
          setup.noise.push(rms);
          setMessage('Настройка: приглуши все струны на пару секунд — измерю фоновый шум.');
          if (setup.noise.length >= 20) {
            const sorted = [...setup.noise].sort((a, b) => a - b);
            setup.noiseLevel = Math.max(0.00001, sorted[Math.floor(sorted.length * 0.75)]);
            setup.phase = 'string';
            setPhase('string');
          }
          return;
        }
        if (setup.phase === 'damp') {
          setMessage('Шестая струна измерена. Приглуши её перед переходом к первой струне.');
          if (silenceGate.current.update(rms, now, Math.max(0.00003, setup.noiseLevel * 1.8, setup.bassLevel * 0.015))) {
            setup.phase = 'high'; setPhase('high');
          }
          return;
        }
        if (setup.phase === 'string' || setup.phase === 'high') {
          const high = setup.phase === 'high';
          const expected = high ? 64 : 40;
          const position = high ? '1-я, самая тонкая струна' : '6-я, самая толстая струна';
          const sample = detectPitch(data, rate, Math.max(0.00003, setup.noiseLevel * 2));
          if (sample?.midi === expected && Math.abs(sample.cents) <= 45) setup.signal.push(rms);
          else setup.signal = [];
          setMessage(sample && sample.midi !== expected ? `Распознана другая нота или октава: ${heardName(sample.midi)}. Сыграй Ми: ${position}, открытая (лад 0).` : `Сыграй Ми: ${position}, открытая (лад 0). Играй с обычной комфортной громкостью.`);
          if (setup.signal.length >= 5) {
            const measured = [...setup.signal].sort((a, b) => a - b)[2];
            const tuned = sensitivity(setup.noiseLevel, high ? setup.bassLevel : measured, measured);
            if (tuned) {
              if (!high) {
                setup.bassLevel = measured; setup.signal = []; setup.phase = 'damp';
                setPhase('damp'); silenceGate.current.reset(); return;
              }
              thresholds.current = tuned; visitCalibration = tuned; setup.phase = 'done'; setCalibrating(false); setPhase('ready');
              silenceGate.current.reset(); setMessage('Чувствительность настроена! Приглуши струну, затем начнём тренировку.');
            } else setMessage('Струну трудно отличить от фона. Поднеси телефон ближе или убери фоновый шум и повтори настройку.');
          }
          return;
        }
        if (!trainingRef.current) {
          const heard = detectPitch(data, rate, thresholds.current.detection);
          setStatus('listening');
          if (!heard) {
            stable.current.midi = -1;
            if (rms < thresholds.current.silence) previewNote.current = null;
            setMessage(rms >= thresholds.current.detection ? 'Звук слышен, но высота пока не определена. Сыграй одну ноту.' : rms > thresholds.current.noise * 1.5 ? 'Слишком тихо. Попробуй поднести телефон ближе.' : 'Свободная проверка: сыграй любую струну, и здесь появится распознанная нота.');
            return;
          }
          if (stable.current.midi !== heard.midi) { stable.current.midi = heard.midi; stable.current.since = now; return; }
          if (now - stable.current.since < 220) return;
          const name = `${heardName(heard.midi)} · ${Math.round(heard.frequency)} Гц`;
          setMessage(`Слышу: ${name}`);
          if (previewNote.current !== heard.midi) {
            previewNote.current = heard.midi;
            setHeardNotes(notes => [...notes, name].slice(-6));
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
        if (!pitch) { stable.current.midi = -1; if (now < wrongUntil.current) return; setStatus('listening'); setMessage(rms >= thresholds.current.detection ? 'Высота не определена. Звук слышен, но нота неустойчива. Приглуши остальные струны и сыграй ноту на экране.' : rms > thresholds.current.noise * 1.5 ? 'Слишком тихо. Поднеси телефон ближе к гитаре или повтори настройку чувствительности.' : 'Слушаю… Сыграй ноту на экране.'); return; }
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
          setMessage(pitch.midi === current.target ? `Распознано: ${heardName(pitch.midi)}, но струна звучит ${pitch.cents > 0 ? 'выше' : 'ниже'} нужного. Проверь настройку.` : `Распознана другая нота или октава: ${heardName(pitch.midi)}. ${octave ? 'Название верное, но нужна другая высота — проверь струну.' : 'Попробуй другой лад или струну.'}`);
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
  const trebleStep = phase === 'high' || phase === 'damp';
  const calibrationString = trebleStep ? 1 : 6;
  const recalibrateButton = <button className="text-button recalibrate-button" onClick={recalibrate}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1" /></svg><span>Настроить чувствительность заново</span></button>;
  return <section className={`microphone-panel mic-${error ? 'wrong' : status}`} aria-label="Микрофон">
    {training && <div className="mic-compact-status"><span>✓ Микрофон настроен</span><button className="text-button" onClick={() => {
      clearTimeout(matchTimeout.current);
      trainingRef.current = false; setTraining(false);
      silenceGate.current.reset(); latest.current.onReady(false);
      stable.current = { midi: -1, since: 0, target: props.target, matched: false, readyAt: performance.now() + 500 };
      setHeardNotes([]); previewNote.current = null;
      setStatus('waiting'); setMessage(active ? 'Свободный режим. Приглуши струны, затем сыграй любую ноту.' : 'Микрофон выключен. Включи его, чтобы играть свободно.');
      latest.current.onTraining(false);
    }}>Свободный режим</button></div>}
    {!training && <div className="calibration-title">
      <div className="eyebrow">ПОДГОТОВКА МИКРОФОНА</div>
      <div className="calibration-heading"><h2>{phase === 'ready' ? 'Микрофон настроен' : phase === 'noise' ? 'Сначала — немного тишины' : trebleStep ? 'Шаг 2: открытая первая Ми' : 'Шаг 1: открытая шестая Ми'}</h2>{phase === 'ready' && recalibrateButton}</div>
      <span>{phase === 'ready' ? 'Чувствительность сохранена до перезагрузки страницы.' : phase === 'noise' ? 'Приглуши все струны. Измерим фоновый шум.' : trebleStep ? 'Ми (E) · самая тонкая струна · лад 0' : 'Ми (E) · самая толстая струна · лад 0'}</span>
      {(phase === 'string' || trebleStep) && <div className="calibration-strings" role="img" aria-label={`${calibrationString}-я струна. Играть открытой, не зажимая лады`}>{[1, 2, 3, 4, 5, 6].map(n => <div key={n} className={n === calibrationString ? 'target-string' : ''}><span>{n}</span><i style={{ height: `${n * 0.4 + 0.5}px` }} />{n === calibrationString && <b>● 0</b>}</div>)}</div>}
      <small>{(phase === 'string' || trebleStep) ? 'Один щипок привычной громкости. Остальные струны приглуши.' : 'Это подготовка чувствительности микрофона, не настройка струн и не задание.'}</small>
    </div>}
    <div className="mic-controls"><button data-enter-start={!active && !pending && !props.completed && !props.paused ? "true" : undefined} aria-keyshortcuts={!active && !pending ? "Enter" : undefined} className={`mic-toggle ${active ? 'is-active' : ''}`} aria-pressed={active} onClick={active || pending ? stop : () => void start()}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />{!active && <path d="m3 3 18 18" />}</svg><span>{pending ? 'Отменить подключение' : active ? 'Выключить микрофон' : 'Включить микрофон'}</span></button><div className="mic-level" aria-label="Уровень входящего звука"><div style={{ width: `${level}%` }} /></div></div>
    {error ? <p role="alert">{error}</p> : <p role="status"><span className="mic-status-icon" aria-hidden="true">{status === 'wrong' ? '↔' : status === 'correct' ? '✓' : '●'}</span>{message}</p>}
    {!training && phase === 'ready' && <div className="mic-preview-notes"><small>Последние звуки</small><div>{heardNotes.map((note, i) => <span key={i}>{note}</span>)}</div></div>}
    {!training && active && !calibrating && <button data-enter-start={!props.paused ? "true" : undefined} aria-keyshortcuts="Enter" className="primary" onClick={() => {
      trainingRef.current = true; setTraining(true); latest.current.onTraining(true);
      silenceGate.current.reset(); stable.current.midi = -1;
      setMessage('Приглуши струны. Сейчас появится первая нота.');
    }}>Начать тренировку →</button>}
    <div className="mic-settings">
      {active && !props.completed && (training || phase !== 'ready') && recalibrateButton}
      {(!props.sound || props.volume === 0) && <button className="text-button" onClick={props.onEnableSound}>Включить звук правильного ответа</button>}
    </div>
    <small>Звук обрабатывается на устройстве и не записывается. Можно искать нужную ноту без ограничения попыток.</small>
  </section>;
}
