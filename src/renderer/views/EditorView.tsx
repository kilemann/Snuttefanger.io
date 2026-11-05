import { useCallback, useEffect, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { MediaStream, OpenedMedia } from '../../shared/types';
import { cleanError } from '../main';
import { formatBytes, formatTime, parseTime } from '../format';

const api = window.snutt;

function describe(s: MediaStream): string {
  if (s.type === 'video') return `Video: ${s.codec}, ${s.width}x${s.height}${s.frameRate ? `, ${s.frameRate.toFixed(2).replace('.00', '')} bilder/s` : ''}`;
  if (s.type === 'audio') return `Lyd: ${s.codec}${s.channels ? `, ${s.channels} kanaler` : ''}${s.sampleRate ? `, ${s.sampleRate} Hz` : ''}`;
  if (s.type === 'subtitle') return `Undertekst: ${s.codec}`;
  if (s.attachedPic) return `Omslagsbilde: ${s.codec}`;
  return `Annet: ${s.codec}`;
}

const MAX_CLIPS = 10;
interface Clip { start: number; end: number; }

function TimeField({ label, value, onCommit, onFocus }: { label: string; value: number; onCommit(v: number): void; onFocus(): void }) {
  const [text, setText] = useState(formatTime(value));
  useEffect(() => setText(formatTime(value)), [value]);
  const commit = () => {
    const t = parseTime(text);
    if (t === null) setText(formatTime(value)); else { onCommit(t); setText(formatTime(value)); }
  };
  return (
    <input type="text" aria-label={label} value={text} onFocus={onFocus} onChange={(e) => setText(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); e.stopPropagation(); }} />
  );
}

export function EditorView({ media, error, onOpen, onQueued }: { media: OpenedMedia | null; error: string | null; onOpen(p: string): void; onQueued(): void }) {
  const [over, setOver] = useState(false);
  const pick = async () => { const p = await api.pickMedia(); if (p) onOpen(p); };
  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setOver(false);
    const f = e.dataTransfer.files[0];
    if (f) onOpen(api.pathForFile(f));
  };
  const dnd = {
    onDragOver: (e: DragEvent) => { e.preventDefault(); setOver(true); },
    onDragLeave: () => setOver(false), onDrop,
  };

  if (!media) {
    return (
      <div className="narrow">
        <h1>Klipp</h1>
        {error && <p className="error" role="alert">{error}</p>}
        <div className={`drop ${over ? 'over' : ''}`} {...dnd}>
          <p>Slipp en video- eller lydfil her</p>
          <button className="btn primary" onClick={pick}>Åpne fil</button>
        </div>
      </div>
    );
  }
  return (
    <div {...dnd}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h1 style={{ margin: 0, overflowWrap: 'anywhere' }}>{media.fileName}</h1>
        <button className="btn" onClick={pick}>Åpne en annen fil</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <Cutter key={media.src} media={media} onQueued={onQueued} />
    </div>
  );
}

function Cutter({ media, onQueued }: { media: OpenedMedia; onQueued(): void }) {
  const duration = media.durationSeconds;
  const ref = useRef<HTMLVideoElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(0);
  // Klipp over valgt antall beholdes, så de kommer tilbake hvis antallet settes opp igjen.
  const [clips, setClips] = useState<Clip[]>([{ start: 0, end: duration }]);
  const [count, setCount] = useState(1);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [unplayable, setUnplayable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clamp = useCallback((t: number) => Math.min(duration, Math.max(0, t)), [duration]);
  const seek = useCallback((t: number) => {
    const c = clamp(t);
    setTime(c);
    if (ref.current) ref.current.currentTime = c;
  }, [clamp]);
  const setIn = useCallback((i: number, t: number) => setClips((all) => all.map((c, n) => n === i ? { ...c, start: Math.min(clamp(t), c.end - 0.01) } : c)), [clamp]);
  const setOut = useCallback((i: number, t: number) => setClips((all) => all.map((c, n) => n === i ? { ...c, end: Math.max(clamp(t), c.start + 0.01) } : c)), [clamp]);
  const toggle = useCallback(() => {
    const v = ref.current;
    if (!v || unplayable) return;
    if (v.paused) void v.play().catch(() => setUnplayable(true)); else v.pause();
  }, [unplayable]);

  const changeCount = (next: number) => {
    setClips((all) => {
      const out = [...all];
      while (out.length < next) {
        const start = Math.min(time, Math.max(0, duration - 1));
        out.push({ start, end: duration });
      }
      return out;
    });
    setCount(next);
    setActive((a) => Math.min(a, next - 1));
  };
  const selectClip = (i: number) => { setActive(i); seek(clips[i].start); };
  const visible = clips.slice(0, count);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
      if (e.target instanceof HTMLInputElement && e.target.type === 'text') return;
      if (e.target instanceof HTMLSelectElement) return;
      const t = ref.current?.currentTime ?? time;
      if (e.key === ' ') {
        if (e.target instanceof HTMLButtonElement) return; // Mellomrom trykker på knappen som har fokus.
        e.preventDefault(); toggle();
      }
      else if (e.key === 'i' || e.key === 'I') setIn(active, t);
      else if (e.key === 'o' || e.key === 'O') setOut(active, t);
      else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(t - (e.shiftKey ? 10 : 1)); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); seek(t + (e.shiftKey ? 10 : 1)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [time, active, toggle, setIn, setOut, seek]);

  const fromPointer = (clientX: number) => {
    const r = stripRef.current!.getBoundingClientRect();
    return clamp(((clientX - r.left) / r.width) * duration);
  };
  const drag = (apply: (t: number) => void) => (e: ReactPointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    apply(fromPointer(e.clientX));
    const move = (ev: PointerEvent) => apply(fromPointer(ev.clientX));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const pct = (t: number) => `${(t / duration) * 100}%`;

  const exportCuts = async () => {
    setError(null);
    try {
      await api.startCuts({ input: media.path, clips: visible.map((c) => ({ startSeconds: c.start, endSeconds: c.end })) });
      onQueued();
    } catch (e) { setError(cleanError(e)); }
  };

  return (
    <>
      <div className="player">
        {unplayable ? (
          <div className="notice">Forhåndsvisning støttes ikke for dette formatet ennå. Du kan fortsatt skrive inn start og slutt og klippe filen.</div>
        ) : (
          <video ref={ref} src={media.src} preload="metadata"
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
            onError={() => setUnplayable(true)} onClick={toggle} />
        )}
      </div>
      <div className="strip" ref={stripRef} onPointerDown={drag(seek)} aria-label="Klippestripe">
        {visible.map((c, i) => (
          <div key={i} className={`strip-sel ${i === active ? 'active' : ''}`} style={{ left: pct(c.start), width: `calc(${pct(c.end)} - ${pct(c.start)})`, zIndex: i === active ? 2 : 1 }}>
            {count > 1 ? i + 1 : ''}
          </div>
        ))}
        <div className="strip-head" style={{ left: pct(time), zIndex: 3 }} />
        <button className="strip-handle" style={{ left: pct(clips[active].start), zIndex: 4 }} aria-label="Dra start" onPointerDown={drag((t) => setIn(active, t))} />
        <button className="strip-handle" style={{ left: pct(clips[active].end), zIndex: 4 }} aria-label="Dra slutt" onPointerDown={drag((t) => setOut(active, t))} />
      </div>
      <div className="controls">
        <button className="btn" onClick={toggle} disabled={unplayable}>{playing ? 'Pause' : 'Spill av'}</button>
        <div className="num" aria-label="Avspillingstid">{formatTime(time)} av {formatTime(duration)}</div>
        <div className="grow" />
        <label className="row small">Antall klipp
          <select aria-label="Antall klipp" value={count} onChange={(e) => changeCount(Number(e.target.value))}>
            {Array.from({ length: MAX_CLIPS }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
          </select>
        </label>
        <button className="btn primary" onClick={exportCuts}>{count === 1 ? 'Eksporter klipp' : `Eksporter ${count} klipp`}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="clips">
        <div /><div /><div className="clips-head">Start</div><div className="clips-head">Slutt</div><div /><div className="clips-head">Lengde</div>
        {visible.map((c, i) => (
          <div className={`clip-row ${i === active ? 'active' : ''}`} key={i} data-clip={i + 1}>
            <label className="clip-name">
              <input type="radio" name="aktivt-klipp" checked={i === active} onChange={() => selectClip(i)} />
              Klipp {i + 1}
            </label>
            <button className="btn" onClick={() => { setActive(i); setIn(i, time); }}>Sett start her</button>
            <TimeField label={`Start klipp ${i + 1}`} value={c.start} onFocus={() => setActive(i)} onCommit={(t) => setIn(i, t)} />
            <TimeField label={`Slutt klipp ${i + 1}`} value={c.end} onFocus={() => setActive(i)} onCommit={(t) => setOut(i, t)} />
            <button className="btn" onClick={() => { setActive(i); setOut(i, time); }}>Sett slutt her</button>
            <div className="num small muted">{formatTime(c.end - c.start)}</div>
          </div>
        ))}
      </div>
      <p className="muted small">
        Hvert klipp blir en egen fil som starter på 0. Video og lyd kopieres uten kvalitetstap, og originalfilen endres ikke. Videoklipp starter på nærmeste keyframe før valgt start, så de kan bli litt lengre enn valgt.
      </p>
      <p className="muted small">Hurtigtaster for valgt klipp: <kbd>I</kbd> start, <kbd>O</kbd> slutt. Avspilling: <kbd>Mellomrom</kbd> spill av, <kbd>←</kbd> <kbd>→</kbd> ett sekund, med <kbd>Shift</kbd> ti sekunder.</p>
      <div className="section">
        <h2>Om filen</h2>
        <ul className="streams small muted">
          <li>{formatBytes(media.sizeBytes)}{media.bitrate ? `, ${Math.round(media.bitrate / 1000)} kbit/s` : ''}</li>
          {media.streams.map((s, i) => <li key={i}>{describe(s)}</li>)}
        </ul>
      </div>
    </>
  );
}
