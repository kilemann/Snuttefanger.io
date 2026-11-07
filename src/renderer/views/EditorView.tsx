import { useCallback, useEffect, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { AUDIO_TARGETS, type AudioTarget, type CutMode, type MediaStream, type OpenedMedia, type Waveform } from '../../shared/types';
import { snapToQuiet } from '../../shared/waveform';
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
const MIN_SPAN = 1;

/** Tegner bølgeformen for synlig del av tidslinjen. Høyeste topp per skjermpiksel, speilet rundt midten. */
function WaveCanvas({ wave, viewStart, viewSpan }: { wave: Waveform; viewStart: number; viewSpan: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el || width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const h = el.clientHeight;
    el.width = Math.round(width * dpr);
    el.height = Math.round(h * dpr);
    const ctx = el.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, h);
    ctx.fillStyle = getComputedStyle(el).color;
    const { peaks, peaksPerSecond: pps } = wave;
    const mid = h / 2;
    const maxH = h / 2 - 14;
    // Skaleres etter høyeste topp i filen, så også svake opptak fyller stripen.
    const top = Math.max(1, wave.maxPeak);
    for (let x = 0; x < width; x++) {
      const from = Math.floor((viewStart + (x / width) * viewSpan) * pps);
      const to = Math.max(from + 1, Math.floor((viewStart + ((x + 1) / width) * viewSpan) * pps));
      let peak = 0;
      for (let i = from; i < to && i < peaks.length; i++) if (peaks[i] > peak) peak = peaks[i];
      const y = Math.max(0.5, (peak / top) * maxH);
      ctx.fillRect(x, mid - y, 1, y * 2);
    }
  }, [wave, viewStart, viewSpan, width]);
  return <canvas ref={ref} className="strip-wave" aria-hidden="true" />;
}
interface Clip { start: number; end: number; mode: CutMode; fmt: AudioTarget; name: string; }
interface Snap { clips: Clip[]; count: number }
const HISTORY = 100;

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

export function EditorView({ media, error, onOpen, onQueued, onSendToJoin }: { media: OpenedMedia | null; error: string | null; onOpen(p: string): void; onQueued(): void; onSendToJoin(ids: string[]): void }) {
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
      <Cutter key={media.src} media={media} onQueued={onQueued} onSendToJoin={onSendToJoin} />
    </div>
  );
}

function Cutter({ media, onQueued, onSendToJoin }: { media: OpenedMedia; onQueued(): void; onSendToJoin(ids: string[]): void }) {
  const duration = media.durationSeconds;
  const hasVideo = media.streams.some((s) => s.type === 'video');
  const hasAudio = media.streams.some((s) => s.type === 'audio');
  // Valget vises bare når filen har både bilde og lyd. Rene lydfiler eksporteres som de er.
  const canChoose = hasVideo && hasAudio;
  const showFormat = hasAudio;
  // Lydformat gjelder lydklipp, og alle klipp fra rene lydfiler.
  const isAudioClip = (c: Clip) => !hasVideo || c.mode === 'audio';
  const ref = useRef<HTMLVideoElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(0);
  // Klipp over valgt antall beholdes, så de kommer tilbake hvis antallet settes opp igjen.
  const [clips, setClips] = useState<Clip[]>([{ start: 0, end: duration, mode: 'av', fmt: 'original', name: '' }]);
  const [count, setCount] = useState(1);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [unplayable, setUnplayable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wave, setWave] = useState<Waveform | null>(null);
  const [waveLoading, setWaveLoading] = useState(hasAudio);
  const [snap, setSnap] = useState(false);
  const [view, setView] = useState({ start: 0, span: duration });
  const [restored, setRestored] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (!hasAudio) return;
    let alive = true;
    api.getWaveform(media.path).then((w) => { if (alive) setWave(w); }, () => {}).finally(() => { if (alive) setWaveLoading(false); });
    return () => { alive = false; };
  }, [media.path, hasAudio]);

  // Klippene huskes per fil, så du kan fortsette der du slapp.
  useEffect(() => {
    let alive = true;
    api.loadProject(media.path).then((p) => {
      if (!alive) return;
      if (p && p.clips.length > 0) {
        const fixed = p.clips.map((c) => {
          const start = Math.min(Math.max(0, c.start), Math.max(0, duration - 0.01));
          return { start, end: Math.min(duration, Math.max(c.end, start + 0.01)), mode: c.mode === 'audio' ? 'audio' as const : 'av' as const, fmt: AUDIO_TARGETS.includes(c.fmt) ? c.fmt : 'original' as const, name: typeof c.name === 'string' ? c.name : '' };
        });
        setClips(fixed);
        setCount(Math.min(Math.max(1, p.count), fixed.length));
        setActive(Math.min(Math.max(0, p.active), fixed.length - 1));
        setRestored(true);
        past.current = []; future.current = []; bumpHistory();
      }
      loaded.current = true;
    }, () => { loaded.current = true; });
    return () => { alive = false; };
  }, [media.path, duration]);

  // Angre og gjør om: øyeblikksbilder av klippene. Valgt klipp regnes ikke som en endring.
  const past = useRef<Snap[]>([]);
  const future = useRef<Snap[]>([]);
  const latest = useRef<Snap>({ clips, count });
  latest.current = { clips, count };
  const [, setHistoryTick] = useState(0);
  const bumpHistory = () => setHistoryTick((n) => n + 1);
  const same = (a: Snap, b: Snap) => a.count === b.count && JSON.stringify(a.clips) === JSON.stringify(b.clips);
  const record = useCallback(() => {
    // Samme tilstand to ganger (for eksempel når et felt bekreftes uten endring) gir ikke et ekstra angresteg.
    const top = past.current.at(-1);
    if (top && same(top, latest.current)) return;
    past.current.push(latest.current);
    if (past.current.length > HISTORY) past.current.shift();
    future.current = [];
    bumpHistory();
  }, []);
  const restore = (snap: Snap) => {
    setClips(snap.clips); setCount(snap.count);
    setActive((a) => Math.min(a, snap.count - 1));
  };
  const undo = useCallback(() => {
    while (past.current.length > 0 && same(past.current.at(-1)!, latest.current)) past.current.pop();
    const snap = past.current.pop();
    if (!snap) return;
    future.current.push(latest.current);
    restore(snap); bumpHistory();
  }, []);
  const redo = useCallback(() => {
    while (future.current.length > 0 && same(future.current.at(-1)!, latest.current)) future.current.pop();
    const snap = future.current.pop();
    if (!snap) return;
    past.current.push(latest.current);
    restore(snap); bumpHistory();
  }, []);

  const clamp = useCallback((v: number) => Math.min(duration, Math.max(0, v)), [duration]);
  const seek = useCallback((v: number) => {
    const c = clamp(v);
    setTime(c);
    if (ref.current) ref.current.currentTime = c;
  }, [clamp]);
  const update = useCallback((i: number, change: (c: Clip) => Clip) => setClips((all) => all.map((c, n) => n === i ? change(c) : c)), []);
  const setIn = useCallback((i: number, v: number) => update(i, (c) => ({ ...c, start: Math.min(clamp(v), c.end - 0.01) })), [clamp, update]);
  const setOut = useCallback((i: number, v: number) => update(i, (c) => ({ ...c, end: Math.max(clamp(v), c.start + 0.01) })), [clamp, update]);
  const snapT = useCallback((v: number) => (snap && wave ? snapToQuiet(wave, v) : v), [snap, wave]);
  const toggle = useCallback(() => {
    const v = ref.current;
    if (!v || unplayable) return;
    if (v.paused) void v.play().catch(() => setUnplayable(true)); else v.pause();
  }, [unplayable]);

  const changeCount = (next: number) => {
    record();
    setClips((all) => {
      const out = [...all];
      while (out.length < next) {
        const start = Math.min(time, Math.max(0, duration - 1));
        out.push({ start, end: duration, mode: out[out.length - 1].mode, fmt: out[out.length - 1].fmt, name: '' });
      }
      return out;
    });
    setCount(next);
    setActive((a) => Math.min(a, next - 1));
  };
  const selectClip = (i: number) => { setActive(i); seek(clips[i].start); };

  useEffect(() => {
    if (!loaded.current) return;
    const timer = setTimeout(() => { void api.saveProject(media.path, { count, active, clips }).catch(() => {}); }, 600);
    return () => clearTimeout(timer);
  }, [clips, count, active, media.path]);

  const resetProject = async () => {
    await api.forgetProject(media.path).catch(() => {});
    record();
    setClips([{ start: 0, end: duration, mode: 'av', fmt: 'original', name: '' }]);
    setCount(1); setActive(0); setRestored(false);
  };

  // Zoom rundt et ankerpunkt (markøren eller avspillingen), så det du ser på blir stående.
  const zoom = useCallback((factor: number, anchor: number) => setView((v) => {
    const span = Math.min(duration, Math.max(Math.min(MIN_SPAN, duration), v.span * factor));
    const rel = v.span > 0 ? (anchor - v.start) / v.span : 0;
    const start = Math.min(Math.max(0, anchor - rel * span), duration - span);
    return { start, span };
  }), [duration]);
  const pan = useCallback((seconds: number) => setView((v) => ({ ...v, start: Math.min(Math.max(0, v.start + seconds), duration - v.span) })), [duration]);
  const zoomed = view.span < duration - 0.001;

  // Følg avspillingen når den går ut av synlig del.
  useEffect(() => {
    if (!zoomed) return;
    if (time < view.start || time > view.start + view.span) {
      setView((v) => ({ ...v, start: Math.min(Math.max(0, time - v.span * 0.1), duration - v.span) }));
    }
  }, [time, zoomed, view.start, view.span, duration]);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const r = el.getBoundingClientRect();
      const anchor = view.start + ((e.clientX - r.left) / r.width) * view.span;
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoom(e.deltaY < 0 ? 0.8 : 1.25, anchor); }
      else if (zoomed) { e.preventDefault(); pan(((e.deltaY + e.deltaX) / r.width) * view.span); }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [view, zoom, pan, zoomed]);
  const visible = clips.slice(0, count);
  const formatColumn = showFormat && visible.some(isAudioClip);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
      // Ctrl+Z i et tekstfelt angrer teksten, ikke klippene.
      if ((e.ctrlKey || e.metaKey) && !(e.target instanceof HTMLInputElement && e.target.type === 'text')) {
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
        if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); return; }
      }
      if (e.target instanceof HTMLInputElement && e.target.type === 'text') return;
      if (e.target instanceof HTMLSelectElement) return;
      const now = ref.current?.currentTime ?? time;
      if (e.key === ' ') {
        if (e.target instanceof HTMLButtonElement) return; // Mellomrom trykker på knappen som har fokus.
        e.preventDefault(); toggle();
      }
      else if (e.key === 'i' || e.key === 'I') { record(); setIn(active, snapT(now)); }
      else if (e.key === 'o' || e.key === 'O') { record(); setOut(active, snapT(now)); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(now - (e.shiftKey ? 10 : 1)); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); seek(now + (e.shiftKey ? 10 : 1)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [time, active, toggle, setIn, setOut, seek, snapT, record, undo, redo]);

  const fromPointer = (clientX: number) => {
    const r = stripRef.current!.getBoundingClientRect();
    return clamp(view.start + ((clientX - r.left) / r.width) * view.span);
  };
  const drag = (apply: (v: number) => void) => (e: ReactPointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    apply(fromPointer(e.clientX));
    const move = (ev: PointerEvent) => apply(fromPointer(ev.clientX));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const pct = (v: number) => `${((v - view.start) / view.span) * 100}%`;

  const exportCuts = async (toJoin = false) => {
    setError(null);
    try {
      const ids = await api.startCuts({
        input: media.path,
        clips: visible.map((c) => ({
          startSeconds: c.start, endSeconds: c.end, audioFormat: isAudioClip(c) ? c.fmt : 'original',
          // Rene lydfiler med Original kopieres som før, med alle spor. Andre formater lager et lydklipp.
          mode: hasVideo ? (canChoose ? c.mode : 'av') : (c.fmt === 'original' ? 'av' : 'audio'),
          name: c.name,
        })),
      });
      if (toJoin) onSendToJoin(ids); else onQueued();
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
      <div className={`strip ${hasAudio ? 'has-wave' : ''}`} ref={stripRef} onPointerDown={drag(seek)} aria-label={t('cut.strip')}>
        {wave && <WaveCanvas wave={wave} viewStart={view.start} viewSpan={view.span} />}
        {visible.map((c, i) => (
          <div key={i} className={`strip-sel ${i === active ? 'active' : ''}`} style={{ left: pct(c.start), width: `calc(${pct(c.end)} - ${pct(c.start)})`, zIndex: i === active ? 2 : 1 }}>
            {count > 1 ? i + 1 : ''}{canChoose && c.mode === 'audio' ? ' ♪' : ''}{isAudioClip(c) && c.fmt !== 'original' ? ` ${c.fmt.toUpperCase()}` : ''}
          </div>
        ))}
        <div className="strip-head" style={{ left: pct(time), zIndex: 3 }} />
        <button className="strip-handle" style={{ left: pct(clips[active].start), zIndex: 4 }} aria-label={t('cut.dragStart')} onPointerDown={(e) => { record(); drag((v) => setIn(active, snapT(v)))(e); }} />
        <button className="strip-handle" style={{ left: pct(clips[active].end), zIndex: 4 }} aria-label={t('cut.dragEnd')} onPointerDown={(e) => { record(); drag((v) => setOut(active, snapT(v)))(e); }} />
      </div>
      <div className="wave-bar row small">
        <button className="btn" aria-label={t('cut.zoomOut')} title={t('cut.zoomOut')} disabled={!zoomed} onClick={() => zoom(2, time)}>−</button>
        <button className="btn" aria-label={t('cut.zoomIn')} title={t('cut.zoomIn')} disabled={view.span <= Math.min(MIN_SPAN, duration) + 0.001} onClick={() => zoom(0.5, time)}>+</button>
        <button className="btn" disabled={!zoomed} onClick={() => setView({ start: 0, span: duration })}>{t('cut.zoomFit')}</button>
        <span className="muted num">{formatTime(view.start).replace(/\.\d+$/, '')}–{formatTime(view.start + view.span).replace(/\.\d+$/, '')}</span>
        <button className="btn" title={`${t('cut.undo')} (Ctrl+Z)`} disabled={past.current.length === 0} onClick={undo}>↶ {t('cut.undo')}</button>
        <button className="btn" title={`${t('cut.redo')} (Ctrl+Y)`} disabled={future.current.length === 0} onClick={redo}>↷ {t('cut.redo')}</button>
        <div className="grow" />
        {waveLoading && <span className="muted">{t('cut.waveLoading')}</span>}
        {wave && (
          <label className="row" title={t('cut.snapTip')}>
            <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
            {t('cut.snap')}
          </label>
        )}
      </div>
      {restored && (
        <p className="muted small row" style={{ marginTop: 8 }}>{t('cut.restored')} <button className="btn" onClick={resetProject}>{t('cut.reset')}</button></p>
      )}
      <div className="controls">
        <button className="btn" onClick={toggle} disabled={unplayable}>{playing ? t('cut.pause') : t('cut.play')}</button>
        <div className="num" aria-label={t('cut.time')}>{t('cut.of', { t: formatTime(time), d: formatTime(duration) })}</div>
        <div className="grow" />
        <label className="row small">{t('cut.clips')}
          <select aria-label={t('cut.count')} value={count} onChange={(e) => changeCount(Number(e.target.value))}>
            {Array.from({ length: MAX_CLIPS }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
          </select>
        </label>
        {hasAudio && <button className="btn" onClick={() => exportCuts(true)}>{t('cut.toJoin')}</button>}
        <button className="btn primary" onClick={() => exportCuts()}>{count === 1 ? t('cut.export1') : t('cut.exportN', { n: String(count) })}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="clips" style={{ gridTemplateColumns: `auto auto 120px 120px auto auto${canChoose ? ' auto' : ''}${formatColumn ? ' auto' : ''}` }}>
        <div /><div /><div className="clips-head">{t('cut.start')}</div><div className="clips-head">{t('cut.end')}</div><div />
        <div className="clips-head">{t('cut.length')}</div>{canChoose && <div className="clips-head">{t('cut.mode')}</div>}
        {formatColumn && <div className="clips-head">{t('cut.format')}</div>}
        {visible.map((c, i) => (
          <div className={`clip-row ${i === active ? 'active' : ''}`} key={i} data-clip={i + 1}>
            <div className="clip-name">
              <input type="radio" name="active-clip" aria-label={t('cut.selectN', { n: String(i + 1) })} checked={i === active} onChange={() => selectClip(i)} />
              <input type="text" className="clip-title" aria-label={t('cut.nameN', { n: String(i + 1) })} placeholder={t('cut.clipN', { n: String(i + 1) })}
                value={c.name} maxLength={120} onFocus={() => { setActive(i); record(); }}
                onChange={(e) => update(i, (old) => ({ ...old, name: e.target.value }))} onKeyDown={(e) => e.stopPropagation()} />
            </div>
            <button className="btn" title={t('cut.setStartTip')} onClick={() => { setActive(i); record(); setIn(i, snapT(time)); }}>{t('cut.setStart')}</button>
            <TimeField label={t('cut.startN', { n: String(i + 1) })} value={c.start} onFocus={() => setActive(i)} onCommit={(v) => { if (Math.abs(v - c.start) > 0.0005) { record(); setIn(i, v); } }} />
            <TimeField label={t('cut.endN', { n: String(i + 1) })} value={c.end} onFocus={() => setActive(i)} onCommit={(v) => { if (Math.abs(v - c.end) > 0.0005) { record(); setOut(i, v); } }} />
            <button className="btn" title={t('cut.setEndTip')} onClick={() => { setActive(i); record(); setOut(i, snapT(time)); }}>{t('cut.setEnd')}</button>
            <div className="num small muted">{formatTime(c.end - c.start)}</div>
            {canChoose && (
              <select aria-label={t('cut.modeN', { n: String(i + 1) })} value={c.mode} onFocus={() => setActive(i)}
                onChange={(e) => { record(); update(i, (old) => ({ ...old, mode: e.target.value as CutMode })); }}>
                <option value="av">{t('cut.av')}</option>
                <option value="audio">{t('cut.audio')}</option>
              </select>
            )}
            {formatColumn && (isAudioClip(c) ? (
              <select aria-label={t('cut.formatN', { n: String(i + 1) })} value={c.fmt} onFocus={() => setActive(i)}
                onChange={(e) => { record(); update(i, (old) => ({ ...old, fmt: e.target.value as AudioTarget })); }}>
                {AUDIO_TARGETS.map((f) => <option key={f} value={f}>{f === 'original' ? t('cut.original') : f.toUpperCase()}</option>)}
              </select>
            ) : <div />)}
          </div>
        ))}
      </div>
      <p className="muted small">{t('cut.nameNote')} {t('cut.noteAv')}{canChoose ? ` ${t('cut.noteAudio')}` : ''}</p>
      {formatColumn && <p className="muted small">{t('cut.noteFormat')}</p>}
      <p className="muted small">
        {t('cut.scClip')} <kbd>I</kbd> {t('cut.scStart')}, <kbd>O</kbd> {t('cut.scEnd')}. {t('cut.scPlayback')} <kbd>{t('cut.scSpace')}</kbd> {t('cut.scPlay')}, <kbd>←</kbd> <kbd>→</kbd> {t('cut.scSecond')} <kbd>Shift</kbd> {t('cut.scTen')}. {wave ? t('cut.zoomHint') : ''}
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
