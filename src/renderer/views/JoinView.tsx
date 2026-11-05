import { useState, type DragEvent } from 'react';
import { joinCompatible } from '../../shared/join';
import { AUDIO_TARGETS, type AudioTarget, type MediaInfo } from '../../shared/types';
import { cleanError } from '../main';
import { formatTime } from '../format';
import { t } from '../i18n';

const api = window.snutt;

export interface JoinItem { path: string; info?: MediaInfo; error?: string }

function describeAudio(info: MediaInfo): string {
  const a = info.streams.find((s) => s.type === 'audio');
  if (!a) return t('join.noAudio');
  const ch = a.channels === 1 ? 'mono' : a.channels === 2 ? 'stereo' : t('cut.channels', { n: String(a.channels) });
  return [a.codec.toUpperCase(), a.sampleRate ? `${(a.sampleRate / 1000).toFixed(1).replace(/\.0$/, '')} kHz` : null, a.channels ? ch : null].filter(Boolean).join(', ');
}

export function JoinView({ items, setItems, onQueued }: { items: JoinItem[]; setItems(f: (old: JoinItem[]) => JoinItem[]): void; onQueued(): void }) {
  const [over, setOver] = useState(false);
  const [format, setFormat] = useState<AudioTarget | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  // Standard: Original når filene passer sammen, ellers MP3. Brukerens eget valg vinner.
  const chosen: AudioTarget = format ?? (compatible ? 'original' : 'mp3');
  const total = infos.reduce((sum, i) => sum + i.durationSeconds, 0);

  const start = async () => {
    setError(null);
    try { await api.startJoin({ inputs: items.map((it) => it.path), format: chosen }); onQueued(); }
    catch (e) { setError(cleanError(e)); }
  };

  return (
    <div className="narrow" onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
      <h1>{t('join.title')}</h1>
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
                <button className="btn" aria-label={`${t('join.up')} ${i + 1}`} title={t('join.up')} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button className="btn" aria-label={`${t('join.down')} ${i + 1}`} title={t('join.down')} disabled={i === items.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button className="btn" aria-label={`${t('join.remove')} ${i + 1}`} title={t('join.remove')} onClick={() => setItems((old) => old.filter((_, n) => n !== i))}>✕</button>
              </li>
            ))}
          </ol>
          <div className="row" style={{ marginBottom: 14 }}>
            <button className="btn" onClick={async () => add(await api.pickMediaMany())}>{t('join.add')}</button>
            <button className="btn" onClick={() => { setItems(() => []); setFormat(null); }}>{t('join.clear')}</button>
            <div className="grow" />
            {infos.length > 0 && <span className="muted num">{t('join.total', { t: formatTime(total) })}</span>}
          </div>
          {items.length < 2 && <p className="muted">{t('join.empty')}</p>}
          {ready && <p className={compatible ? 'ok' : 'muted'}>{compatible ? t('join.lossless') : t('join.mismatch')}</p>}
          <div className="row end">
            <label className="field">{t('join.format')}
              <select aria-label={t('join.format')} value={chosen} onChange={(e) => setFormat(e.target.value as AudioTarget)}>
                {AUDIO_TARGETS.filter((f) => f !== 'original' || compatible).map((f) => (
                  <option key={f} value={f}>{f === 'original' ? t('cut.original') : f.toUpperCase()}</option>
                ))}
              </select>
            </label>
            <button className="btn primary" disabled={!ready} onClick={start}>{t('join.start', { n: String(items.length) })}</button>
          </div>
          {error && <p className="error" role="alert" style={{ marginTop: 10 }}>{error}</p>}
          <p className="muted small" style={{ marginTop: 14 }}>{compatible ? `${t('join.note')} ` : ''}{t('join.noteFormat')}</p>
        </>
      )}
    </div>
  );
}
