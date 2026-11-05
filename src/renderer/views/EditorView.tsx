import { useCallback, useEffect, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { CutMode, MediaStream, OpenedMedia } from '../../shared/types';
import { cleanError } from '../main';
import { formatBytes, formatTime, parseTime } from '../format';
import { t } from '../i18n';

const api = window.snutt;

function describe(s: MediaStream): string {
  if (s.type === 'video') {
    const fps = s.frameRate ? `, ${t('cut.fps', { n: s.frameRate.toFixed(2).replace(/\.00$/, '') })}` : '';
    return `${t('cut.video')}: ${s.codec}, ${s.width}x${s.height}${fps}`;
  }
  if (s.type === 'audio') {
    return `${t('cut.audioStream')}: ${s.codec}${s.channels ? `, ${s.channels === 1 ? 'mono' : s.channels === 2 ? 'stereo' : t('cut.channels', { n: String(s.channels) })}` : ''}${s.sampleRate ? `, ${s.sampleRate} Hz` : ''}`;
  }
  if (s.type === 'subtitle') return `${t('cut.subtitles')}: ${s.codec}`;
  if (s.attachedPic) return `${t('cut.cover')}: ${s.codec}`;
  return `${t('cut.other')}: ${s.codec}`;
}

const MAX_CLIPS = 10;
interface Clip { start: number; end: number; mode: CutMode; }

function TimeField({ label, value, onCommit, onFocus }: { label: string; value: number; onCommit(v: number): void; onFocus(): void }) {
  const [text, setText] = useState(formatTime(value));
  useEffect(() => setText(formatTime(value)), [value]);
  const commit = () => {
    const v = parseTime(text);
    if (v === null) setText(formatTime(value)); else { onCommit(v); setText(formatTime(value)); }
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
        <h1>{t('cut.title')}</h1>
        {error && <p className="error" role="alert">{error}</p>}
        <div className={`drop ${over ? 'over' : ''}`} {...dnd}>
          <p>{t('cut.drop')}</p>
          <button className="btn primary" onClick={pick}>{t('cut.open')}</button>
        </div>
      </div>
    );
  }
  return (
    <div {...dnd}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h1 style={{ margin: 0, overflowWrap: 'anywhere' }}>{media.fileName}</h1>
        <button className="btn" onClick={pick}>{t('cut.openAnother')}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <Cutter key={media.src} media={media} onQueued={onQueued} />
    </div>
  );
}

function Cutter({ media, onQueued }: { media: OpenedMedia; onQueued(): void }) {
  const duration = media.durationSeconds;
  const hasVideo = media.streams.some((s) => s.type === 'video');
  const hasAudio = media.streams.some((s) => s.type === 'audio');
  // Valget vises bare når filen har både bilde og lyd. Rene lydfiler eksporteres som de er.
  const canChoose = hasVideo && hasAudio;
  const ref = useRef<HTMLVideoElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(0);
  // Klipp over valgt antall beholdes, så de kommer tilbake hvis antallet settes opp igjen.
  const [clips, setClips] = useState<Clip[]>([{ start: 0, end: duration, mode: 'av' }]);
  const [count, setCount] = useState(1);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [unplayable, setUnplayable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clamp = useCallback((v: number) => Math.min(duration, Math.max(0, v)), [duration]);
  const seek = useCallback((v: number) => {
    const c = clamp(v);
    setTime(c);
    if (ref.current) ref.current.currentTime = c;
  }, [clamp]);
  const update = useCallback((i: number, change: (c: Clip) => Clip) => setClips((all) => all.map((c, n) => n === i ? change(c) : c)), []);
  const setIn = useCallback((i: number, v: number) => update(i, (c) => ({ ...c, start: Math.min(clamp(v), c.end - 0.01) })), [clamp, update]);
  const setOut = useCallback((i: number, v: number) => update(i, (c) => ({ ...c, end: Math.max(clamp(v), c.start + 0.01) })), [clamp, update]);
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
        out.push({ start, end: duration, mode: out[out.length - 1].mode });
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
      const now = ref.current?.currentTime ?? time;
      if (e.key === ' ') {
        if (e.target instanceof HTMLButtonElement) return; // Mellomrom trykker på knappen som har fokus.
        e.preventDefault(); toggle();
      }
      else if (e.key === 'i' || e.key === 'I') setIn(active, now);
      else if (e.key === 'o' || e.key === 'O') setOut(active, now);
      else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(now - (e.shiftKey ? 10 : 1)); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); seek(now + (e.shiftKey ? 10 : 1)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [time, active, toggle, setIn, setOut, seek]);

  const fromPointer = (clientX: number) => {
    const r = stripRef.current!.getBoundingClientRect();
    return clamp(((clientX - r.left) / r.width) * duration);
  };
  const drag = (apply: (v: number) => void) => (e: ReactPointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    apply(fromPointer(e.clientX));
    const move = (ev: PointerEvent) => apply(fromPointer(ev.clientX));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const pct = (v: number) => `${(v / duration) * 100}%`;

  const exportCuts = async () => {
    setError(null);
    try {
      await api.startCuts({
        input: media.path,
        clips: visible.map((c) => ({ startSeconds: c.start, endSeconds: c.end, mode: canChoose ? c.mode : 'av' })),
      });
      onQueued();
    } catch (e) { setError(cleanError(e)); }
  };

  return (
    <>
      <div className="player">
        {unplayable ? (
          <div className="notice">{t('cut.noPreview')}</div>
        ) : (
          <video ref={ref} src={media.src} preload="metadata"
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
            onError={() => setUnplayable(true)} onClick={toggle} />
        )}
      </div>
      <div className="strip" ref={stripRef} onPointerDown={drag(seek)} aria-label={t('cut.strip')}>
        {visible.map((c, i) => (
          <div key={i} className={`strip-sel ${i === active ? 'active' : ''}`} style={{ left: pct(c.start), width: `calc(${pct(c.end)} - ${pct(c.start)})`, zIndex: i === active ? 2 : 1 }}>
            {count > 1 ? i + 1 : ''}{canChoose && c.mode === 'audio' ? ' ♪' : ''}
          </div>
        ))}
        <div className="strip-head" style={{ left: pct(time), zIndex: 3 }} />
        <button className="strip-handle" style={{ left: pct(clips[active].start), zIndex: 4 }} aria-label={t('cut.dragStart')} onPointerDown={drag((v) => setIn(active, v))} />
        <button className="strip-handle" style={{ left: pct(clips[active].end), zIndex: 4 }} aria-label={t('cut.dragEnd')} onPointerDown={drag((v) => setOut(active, v))} />
      </div>
      <div className="controls">
        <button className="btn" onClick={toggle} disabled={unplayable}>{playing ? t('cut.pause') : t('cut.play')}</button>
        <div className="num" aria-label={t('cut.time')}>{t('cut.of', { t: formatTime(time), d: formatTime(duration) })}</div>
        <div className="grow" />
        <label className="row small">{t('cut.clips')}
          <select aria-label={t('cut.count')} value={count} onChange={(e) => changeCount(Number(e.target.value))}>
            {Array.from({ length: MAX_CLIPS }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
          </select>
        </label>
        <button className="btn primary" onClick={exportCuts}>{count === 1 ? t('cut.export1') : t('cut.exportN', { n: String(count) })}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className={`clips ${canChoose ? 'with-mode' : ''}`}>
        <div /><div /><div className="clips-head">{t('cut.start')}</div><div className="clips-head">{t('cut.end')}</div><div />
        <div className="clips-head">{t('cut.length')}</div>{canChoose && <div className="clips-head">{t('cut.mode')}</div>}
        {visible.map((c, i) => (
          <div className={`clip-row ${i === active ? 'active' : ''}`} key={i} data-clip={i + 1}>
            <label className="clip-name">
              <input type="radio" name="active-clip" checked={i === active} onChange={() => selectClip(i)} />
              {t('cut.clipN', { n: String(i + 1) })}
            </label>
            <button className="btn" onClick={() => { setActive(i); setIn(i, time); }}>{t('cut.setStart')}</button>
            <TimeField label={t('cut.startN', { n: String(i + 1) })} value={c.start} onFocus={() => setActive(i)} onCommit={(v) => setIn(i, v)} />
            <TimeField label={t('cut.endN', { n: String(i + 1) })} value={c.end} onFocus={() => setActive(i)} onCommit={(v) => setOut(i, v)} />
            <button className="btn" onClick={() => { setActive(i); setOut(i, time); }}>{t('cut.setEnd')}</button>
            <div className="num small muted">{formatTime(c.end - c.start)}</div>
            {canChoose && (
              <select aria-label={t('cut.modeN', { n: String(i + 1) })} value={c.mode} onFocus={() => setActive(i)}
                onChange={(e) => update(i, (old) => ({ ...old, mode: e.target.value as CutMode }))}>
                <option value="av">{t('cut.av')}</option>
                <option value="audio">{t('cut.audio')}</option>
              </select>
            )}
          </div>
        ))}
      </div>
      <p className="muted small">{t('cut.noteAv')}{canChoose ? ` ${t('cut.noteAudio')}` : ''}</p>
      <p className="muted small">
        {t('cut.scClip')} <kbd>I</kbd> {t('cut.scStart')}, <kbd>O</kbd> {t('cut.scEnd')}. {t('cut.scPlayback')} <kbd>{t('cut.scSpace')}</kbd> {t('cut.scPlay')}, <kbd>←</kbd> <kbd>→</kbd> {t('cut.scSecond')} <kbd>Shift</kbd> {t('cut.scTen')}.
      </p>
      <div className="section">
        <h2>{t('cut.aboutFile')}</h2>
        <ul className="streams small muted">
          <li>{formatBytes(media.sizeBytes)}{media.bitrate ? `, ${Math.round(media.bitrate / 1000)} kbit/s` : ''}</li>
          {media.streams.map((s, i) => <li key={i}>{describe(s)}</li>)}
        </ul>
      </div>
    </>
  );
}
