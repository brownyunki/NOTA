import { useEffect, useRef, useState } from 'react';
import { detectPitch, heardName } from './pitch';

type Props = { target: number; paused: boolean; sound: boolean; volume: number; onMatch: () => void; onWrong: () => void; onActive: (active: boolean) => void };
export function Microphone(props: Props) {
  const latest = useRef(props); latest.current = props;
  const [active, setActive] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('Включи микрофон и сыграй одну струну.');
  const [level, setLevel] = useState(0);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<'listening' | 'wrong' | 'correct'>('listening');
  const wrongUntil = useRef(0);
  const matchTimeout = useRef<number | undefined>(undefined);
  const notificationGain = useRef<GainNode | null>(null);
  useEffect(() => {
    if (notificationGain.current) notificationGain.current.gain.value = props.sound ? props.volume / 100 : 0;
  }, [props.sound, props.volume]);
  const resources = useRef<{ stream: MediaStream; ctx: AudioContext; interval: number } | null>(null);
  const generation = useRef(0);
  const stable = useRef({ midi: -1, since: 0, target: props.target, matched: false, readyAt: 0 });
  function stop() {
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
    setStatus('listening'); wrongUntil.current = 0;
    stable.current = { midi: -1, since: 0, target: props.target, matched: false, readyAt: performance.now() + 700 };
    setMessage(active ? 'Слушаю следующую ноту…' : 'Включи микрофон и сыграй одну струну.');
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
      stable.current = { midi: -1, since: 0, target: latest.current.target, matched: false, readyAt: performance.now() + 400 };
      const interval = window.setInterval(() => {
        const current = latest.current;
        if (current.paused || document.hidden) { stable.current.midi = -1; setStatus('listening'); setMessage('Пауза — закрой подсказки и окно настроек, затем сыграй ноту.'); return; }
        const now = performance.now();
        if (now < stable.current.readyAt || stable.current.matched) return;
        analyser.getFloatTimeDomainData(data);
        let energy = 0; for (const value of data) energy += value * value;
        setLevel(Math.min(100, Math.sqrt(energy / data.length) * 700));
        const pitch = detectPitch(data, rate);
        if (!pitch) { stable.current.midi = -1; if (now < wrongUntil.current) return; setStatus('listening'); setMessage(energy / data.length > 0.000036 ? 'Слышу звук, но нота неясна. Сыграй одну струну, остальные приглуши.' : 'Слушаю… Сыграй одну струну.'); return; }
        if (pitch.midi !== stable.current.midi) { stable.current.midi = pitch.midi; stable.current.since = now; return; }
        if (now - stable.current.since < 220) return;
        if (pitch.midi === current.target && Math.abs(pitch.cents) <= 40) {
          stable.current.matched = true; setStatus('correct'); setMessage(`Верно! ${heardName(pitch.midi)}.`);
          if (current.sound && current.volume > 0 && ctx) {
            const output = ctx.createGain(); output.gain.value = current.volume / 100;
            notificationGain.current = output; output.connect(ctx.destination);
            const tone = ctx.createOscillator(); const envelope = ctx.createGain();
            tone.type = 'sine'; tone.frequency.setValueAtTime(880, ctx.currentTime);
            tone.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.085);
            envelope.gain.setValueAtTime(0, ctx.currentTime);
            envelope.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.008);
            envelope.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
            tone.connect(envelope); envelope.connect(output);
            tone.onended = () => { tone.disconnect(); envelope.disconnect(); output.disconnect(); if (notificationGain.current === output) notificationGain.current = null; };
            tone.start(); tone.stop(ctx.currentTime + 0.2);
          }
          // Finish the cue before transitioning; the next note also has a 700 ms listening delay.
          matchTimeout.current = window.setTimeout(() => {
            if (generation.current !== token) return;
            if (latest.current.paused || document.hidden) { stable.current.matched = false; stable.current.midi = -1; return; }
            current.onMatch();
          }, 260);
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
      setActive(true); setPending(false); setStatus('listening'); setMessage('Слушаю… Сыграй одну струну.'); latest.current.onActive(true);
    } catch (e) {
      stream?.getTracks().forEach(t => t.stop()); if (ctx) void ctx.close();
      if (generation.current !== token) return;
      setPending(false);
      const name = e instanceof DOMException ? e.name : '';
      setError(name === 'NotAllowedError' ? 'Доступ к микрофону не разрешён. Разреши его в настройках сайта в браузере и попробуй снова.' : name === 'NotFoundError' ? 'Микрофон не найден. Проверь устройство.' : 'Не удалось включить микрофон. Закрой другие приложения со звуком и попробуй снова.');
    }
  }
  return <section className={`microphone-panel mic-${error ? 'wrong' : status}`} aria-label="Микрофон">
    <div className="mic-controls"><button className="primary" onClick={active || pending ? stop : () => void start()}>{pending ? 'Отменить подключение' : active ? 'Выключить микрофон' : 'Включить микрофон'}</button><div className="mic-level" aria-label="Уровень входящего звука"><div style={{ width: `${level}%` }} /></div></div>
    {error ? <p role="alert">{error}</p> : <p role="status"><span className="mic-status-icon" aria-hidden="true">{status === 'wrong' ? '↔' : status === 'correct' ? '✓' : '●'}</span>{message}</p>}
    <small>Звук обрабатывается на устройстве и не записывается. Можно искать нужную ноту без ограничения попыток.</small>
  </section>;
}
