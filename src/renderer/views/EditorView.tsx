import { useCallback, useEffect, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { MediaStream, OpenedMedia } from '../../shared/types';
import { cleanError } from '../main';
import { formatBytes, formatTime, parseTime } from '../format';

const api = window.snutt;

function describe(s: MediaStream): string {
  if (s.type === 'video') return `Video: ${s.codec}, ${s.width}x${s.height}${s.frameRate ? `, ${s.frameRate.toFixed(2).replace('.00', '')} bilder/s` : ''}`;
  if (s.type === 'audio') return `Lyd: ${s.codec}${s.channels ? `, ${s.channels} kanaler` : ''}${s.sampleRate ? `, ${s.sampleRate} Hz` : ''}`;
  if (s.type === 'subtitle') return `Undertekst: ${s.codec}`;
  return `Annet: ${s.codec}`;
}

function TimeField({ label, value, onCommit }: { label: string; value: number; onCommit(v: number): void }) {
  const [text, setText] = useState(formatTime(value));
  useEffect(() => setText(formatTime(value)), [value]);
  const commit = () => {
    const t = parseTime(text);
    if (t === null) setText(formatTime(value)); else onCommit(t);
  };
  return (
    <label className="field">{label}
      <input type="text" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); e.stopPropagation(); }} />
    </label>
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
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(duration);
  const [playing, setPlaying] = useState(false);
  const [unplayable, setUnplayable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clamp = useCallback((t: number) => Math.min(duration, Math.max(0, t)), [duration]);
  const seek = useCallback((t: number) => {
    const c = clamp(t);
    setTime(c);
    if (ref.current) ref.current.currentTime = c;
  }, [clamp]);
  const setIn = useCallback((t: number) => setStart(Math.min(clamp(t), end - 0.01)), [clamp, end]);
  const setOut = useCallback((t: number) => setEnd(Math.max(clamp(t), start + 0.01)), [clamp, start]);
  const toggle = useCallback(() => {
    const v = ref.current;
    if (!v || unplayable) return;
    if (v.paused) void v.play().catch(() => setUnplayable(true)); else v.pause();
  }, [unplayable]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const t = ref.current?.currentTime ?? time;
      if (e.key === ' ') {
        if (e.target instanceof HTMLButtonElement) return; // Mellomrom trykker på knappen som har fokus.
        e.preventDefault(); toggle();
      }
      else if (e.key === 'i' || e.key === 'I') setIn(t);
      else if (e.key === 'o' || e.key === 'O') setOut(t);
      else if (e.key === 'ArrowLeft') seek(t - (e.shiftKey ? 10 : 1));
      else if (e.key === 'ArrowRight') seek(t + (e.shiftKey ? 10 : 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [time, toggle, setIn, setOut, seek]);

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

  const exportCut = async () => {
    setError(null);
    try { await api.startCut({ input: media.path, startSeconds: start, endSeconds: end }); onQueued(); }
    catch (e) { setError(cleanError(e)); }
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
        <div className="strip-sel" style={{ left: pct(start), width: `calc(${pct(end)} - ${pct(start)})` }} />
        <div className="strip-head" style={{ left: pct(time) }} />
        <button className="strip-handle" style={{ left: pct(start) }} aria-label="Dra start" onPointerDown={drag(setIn)} />
        <button className="strip-handle" style={{ left: pct(end) }} aria-label="Dra slutt" onPointerDown={drag(setOut)} />
      </div>
      <div className="controls">
        <button className="btn" onClick={toggle} disabled={unplayable}>{playing ? 'Pause' : 'Spill av'}</button>
        <div className="num" aria-label="Avspillingstid">{formatTime(time)} av {formatTime(duration)}</div>
      </div>
      <div className="controls end">
        <button className="btn" onClick={() => setIn(time)}>Sett start her</button>
        <TimeField label="Start" value={start} onCommit={setIn} />
        <TimeField label="Slutt" value={end} onCommit={setOut} />
        <button className="btn" onClick={() => setOut(time)}>Sett slutt her</button>
        <div className="grow" />
        <button className="btn primary" onClick={exportCut}>Eksporter klipp</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <p className="muted small">
        Valgt lengde {formatTime(end - start)}. Eksporten er tapsfri og originalfilen endres ikke. Klippet starter på nærmeste keyframe før valgt start, så det kan bli litt lengre enn valgt.
      </p>
      <p className="muted small">Hurtigtaster: <kbd>Mellomrom</kbd> spill av, <kbd>I</kbd> start, <kbd>O</kbd> slutt, <kbd>←</kbd> <kbd>→</kbd> ett sekund, med <kbd>Shift</kbd> ti sekunder.</p>
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
