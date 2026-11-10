import { useEffect, useRef, useState, type DragEvent } from 'react';
import { joinCompatible } from '../../shared/join';
import { AUDIO_TARGETS, type AudioTarget, type JoinEffects, type JoinRequest, type MediaInfo, type PreviewResult } from '../../shared/types';
import { cleanError } from '../main';
import { formatTime } from '../format';
import { getLanguage, t } from '../i18n';

const api = window.snutt;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const FADES = [0, 0.5, 1, 2, 3, 5];
const CROSSFADES = [0, 0.5, 1, 2, 3];

export interface JoinItem { path: string; info?: MediaInfo; error?: string; speed?: number }

export interface JoinState { items: JoinItem[]; format: AudioTarget | null; effects: JoinEffects }

function describeAudio(info: MediaInfo): string {
  const a = info.streams.find((s) => s.type === 'audio');
  if (!a) return t('join.noAudio');
  const ch = a.channels === 1 ? 'mono' : a.channels === 2 ? 'stereo' : t('cut.channels', { n: String(a.channels) });
  return [a.codec.toUpperCase(), a.sampleRate ? `${(a.sampleRate / 1000).toFixed(1).replace(/\.0$/, '')} kHz` : null, a.channels ? ch : null].filter(Boolean).join(', ');
}

const effectsOn = (e: JoinEffects) => e.speeds.some((s) => s !== 1) || e.trimSilence || e.normalize || e.fadeIn > 0 || e.fadeOut > 0 || e.crossfade > 0;
const speedLabel = (s: number) => `${getLanguage() === 'nb' ? String(s).replace('.', ',') : String(s)}x`;

export function JoinView({ state, setState, onQueued, pending, failed, joinDir, onGoSettings }: {
  state: JoinState; setState(f: (old: JoinState) => JoinState): void; onQueued(): void; pending: number; failed: number; joinDir: string; onGoSettings(): void;
}) {
  const { items } = state;
  // Hastigheten ligger på hver fil, så den følger med når rekkefølgen endres.
  const effects: JoinEffects = { ...state.effects, speeds: items.map((it) => it.speed ?? 1) };
  const setSpeed = (i: number, speed: number) => setItems((old) => old.map((it, n) => (n === i ? { ...it, speed } : it)));
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ result: PreviewResult; key: string } | null>(null);
  const [previewing, setPreviewing] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => api.onPreview((p) => setPreviewing(p)), []);

  const setItems = (f: (old: JoinItem[]) => JoinItem[]) => setState((s) => ({ ...s, items: f(s.items) }));
  const setEffects = (patch: Partial<JoinEffects>) => setState((s) => ({ ...s, effects: { ...s.effects, ...patch } }));
  const add = (paths: string[]) => {
    setItems((old) => [...old, ...paths.map((path) => ({ path }))]);
    for (const path of paths) {
      api.probeMedia(path).then(
        (info) => setItems((old) => old.map((it) => (it.path === path && !it.info ? { ...it, info } : it))),
        (e) => setItems((old) => old.map((it) => (it.path === path && !it.info ? { ...it, error: cleanError(e) } : it))),
      );
    }
  };
  const move = (i: number, d: number) => setItems((old) => {
    const out = [...old];
    [out[i], out[i + d]] = [out[i + d], out[i]];
    return out;
  });
  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setOver(false);
    add([...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean));
  };

  const ready = items.length >= 2 && items.every((it) => it.info && it.info.streams.some((s) => s.type === 'audio'));
  const infos = items.flatMap((it) => (it.info ? [it.info] : []));
  const compatible = ready && joinCompatible(infos);
  const fx = effectsOn(effects);
  const originalAllowed = compatible && !fx;
  // Standard: Original når filene passer sammen og ingen effekter er på, ellers MP3. Brukerens eget valg vinner når det er lov.
  const chosen: AudioTarget = state.format && (state.format !== 'original' || originalAllowed) ? state.format : (originalAllowed ? 'original' : 'mp3');
  const sum = infos.reduce((s, i) => s + i.durationSeconds, 0);
  const played = items.reduce((s, it) => s + (it.info ? it.info.durationSeconds / (it.speed ?? 1) : 0), 0);
  const estimate = Math.max(0, played - effects.crossfade * Math.max(0, infos.length - 1));
  const request: JoinRequest = { inputs: items.map((it) => it.path), format: chosen, effects };
  const key = JSON.stringify(request);
  const stale = preview !== null && preview.key !== key;

  const start = async () => {
    setError(null);
    try { await api.startJoin(request); onQueued(); }
    catch (e) { setError(cleanError(e)); }
  };
  const makePreview = async () => {
    setError(null);
    audioRef.current?.pause();
    setPreviewing(0);
    try {
      const result = await api.previewJoin(request);
      if (result) setPreview({ result, key });
    } catch (e) { setError(cleanError(e)); }
    finally { setPreviewing(null); }
  };
  const stopPreview = async () => { await api.stopPreview(); setPreviewing(null); };

  return (
    <div className="narrow" onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
      <h1>{t('join.title')}</h1>
      {pending > 0 && <p className="banner" role="status">{t('join.waiting', { n: String(pending) })}</p>}
      {failed > 0 && <p className="error" role="alert">{t('join.someFailed', { n: String(failed) })}</p>}
      {items.length === 0 ? (
        <div className={`drop ${over ? 'over' : ''}`}>
          <p>{t('join.drop')}</p>
          <button className="btn primary" onClick={async () => add(await api.pickMediaMany())}>{t('join.add')}</button>
        </div>
      ) : (
        <>
          <ol className="join-list">
            {items.map((it, i) => (
              <li key={`${it.path}-${i}`} className="join-item">
                <span className="join-n num">{i + 1}</span>
                <div className="join-name">
                  <div>{it.path.split(/[\\/]/).pop()}</div>
                  <div className={`small ${it.error || (it.info && !it.info.streams.some((s) => s.type === 'audio')) ? 'error' : 'muted'}`}>
                    {it.error ?? (it.info ? `${formatTime(it.info.durationSeconds)}, ${describeAudio(it.info)}` : t('join.reading'))}
                  </div>
                </div>
                <select className="join-speed" aria-label={t('join.speedN', { n: String(i + 1) })} title={t('join.speedN', { n: String(i + 1) })}
                  value={it.speed ?? 1} onChange={(e) => setSpeed(i, Number(e.target.value))}>
                  {SPEEDS.map((sp) => <option key={sp} value={sp}>{speedLabel(sp)}</option>)}
                </select>
                <button className="btn" aria-label={`${t('join.up')} ${i + 1}`} title={t('join.up')} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button className="btn" aria-label={`${t('join.down')} ${i + 1}`} title={t('join.down')} disabled={i === items.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button className="btn" aria-label={`${t('join.remove')} ${i + 1}`} title={t('join.remove')} onClick={() => setItems((old) => old.filter((_, n) => n !== i))}>✕</button>
              </li>
            ))}
          </ol>
          <div className="row" style={{ marginBottom: 14 }}>
            <button className="btn" onClick={async () => add(await api.pickMediaMany())}>{t('join.add')}</button>
            <button className="btn" onClick={() => { setState((s) => ({ ...s, items: [], format: null })); setPreview(null); }}>{t('join.clear')}</button>
            <div className="grow" />
            {infos.length > 0 && <span className="muted num">{t('join.total', { t: formatTime(sum) })}</span>}
          </div>
          {items.length < 2 && <p className="muted">{t('join.empty')}</p>}
          {ready && <p className={compatible ? 'ok' : 'muted'}>{compatible ? t('join.lossless') : t('join.mismatch')}</p>}

          <div className="section">
            <h2>{t('join.effects')}</h2>
            <div className="row end">
              <label className="field">{t('join.speedAll')}
                <select aria-label={t('join.speedAll')} value="" onChange={(e) => { const v = Number(e.target.value); if (v) setItems((old) => old.map((it) => ({ ...it, speed: v }))); }}>
                  <option value="" disabled>{t('join.setAll')}</option>
                  {SPEEDS.map((s) => <option key={s} value={s}>{speedLabel(s)}</option>)}
                </select>
              </label>
              <label className="field">{t('join.fadeIn')}
                <select aria-label={t('join.fadeIn')} value={effects.fadeIn} onChange={(e) => setEffects({ fadeIn: Number(e.target.value) })}>
                  {FADES.map((s) => <option key={s} value={s}>{s === 0 ? t('join.none') : t('join.seconds', { s })}</option>)}
                </select>
              </label>
              <label className="field">{t('join.fadeOut')}
                <select aria-label={t('join.fadeOut')} value={effects.fadeOut} onChange={(e) => setEffects({ fadeOut: Number(e.target.value) })}>
                  {FADES.map((s) => <option key={s} value={s}>{s === 0 ? t('join.none') : t('join.seconds', { s })}</option>)}
                </select>
              </label>
              <label className="field">{t('join.crossfade')}
                <select aria-label={t('join.crossfade')} value={effects.crossfade} onChange={(e) => setEffects({ crossfade: Number(e.target.value) })}>
                  {CROSSFADES.map((s) => <option key={s} value={s}>{s === 0 ? t('join.none') : t('join.seconds', { s })}</option>)}
                </select>
              </label>
            </div>
            <label className="row small" style={{ marginTop: 12 }}>
              <input type="checkbox" checked={effects.trimSilence} onChange={(e) => setEffects({ trimSilence: e.target.checked })} />
              {t('join.trim')}
            </label>
            <label className="row small" style={{ marginTop: 6 }}>
              <input type="checkbox" checked={effects.normalize} onChange={(e) => setEffects({ normalize: e.target.checked })} />
              {t('join.normalize')}
            </label>
            {fx && <p className="muted small" style={{ marginTop: 10 }}>{t('join.effectsNote')}</p>}
          </div>

          <div className="section">
            <h2>{t('join.tags')}</h2>
            <div className="row">
              <label className="field grow">{t('join.titleField')}
                <input type="text" aria-label={t('join.titleField')} value={effects.title} onChange={(e) => setEffects({ title: e.target.value })} />
              </label>
              <label className="field grow">{t('join.artist')}
                <input type="text" aria-label={t('join.artist')} value={effects.artist} onChange={(e) => setEffects({ artist: e.target.value })} />
              </label>
            </div>
            <label className="row small" style={{ marginTop: 10 }}>
              <input type="checkbox" checked={effects.cover} onChange={(e) => setEffects({ cover: e.target.checked })} />
              {t('join.cover')}
            </label>
          </div>

          <div className="section">
            <p className="muted small folder-info" style={{ marginTop: 0, marginBottom: 10 }}>
              {t('dl.quickFolder')} <code>{joinDir || t('set.sameAsFirst')}</code>. <button className="linkbtn" onClick={onGoSettings}>{t('dl.changeInSettings')}</button>
            </p>
            <div className="row end">
              <label className="field">{t('join.format')}
                <select aria-label={t('join.format')} value={chosen} onChange={(e) => setState((s) => ({ ...s, format: e.target.value as AudioTarget }))}>
                  {AUDIO_TARGETS.filter((f) => f !== 'original' || originalAllowed).map((f) => (
                    <option key={f} value={f}>{f === 'original' ? t('cut.original') : f.toUpperCase()}</option>
                  ))}
                </select>
              </label>
              {previewing === null
                ? <button className="btn" disabled={!ready} onClick={makePreview}>{t('join.preview')}</button>
                : <button className="btn" onClick={stopPreview}>{t('join.previewStop')}</button>}
              <button className="btn primary" disabled={!ready} onClick={start}>{t('join.start', { n: String(items.length) })}</button>
              <div className="grow" />
              {ready && <span className="muted num small" style={{ alignSelf: 'center' }}>{t('join.length', { t: formatTime(estimate).replace(/\.\d+$/, '') })}</span>}
            </div>
            {previewing !== null && (
              <div style={{ marginTop: 12 }}>
                <div className="meter"><div style={{ width: `${previewing}%` }} /></div>
                <div className="muted small num">{t('join.previewing', { p: String(Math.floor(previewing)) })}</div>
              </div>
            )}
            {preview && previewing === null && (
              <div style={{ marginTop: 12 }}>
                <audio ref={audioRef} className="preview" controls src={preview.result.src} aria-label={t('join.preview')} />
                {stale && <p className="muted small">{t('join.previewOld')}</p>}
              </div>
            )}
            {error && <p className="error" role="alert" style={{ marginTop: 10 }}>{error}</p>}
            <p className="muted small" style={{ marginTop: 14 }}>{compatible && !fx ? `${t('join.note')} ` : ''}{t('join.noteFormat')}</p>
          </div>
        </>
      )}
    </div>
  );
}
