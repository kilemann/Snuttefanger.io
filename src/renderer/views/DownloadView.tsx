import { useState } from 'react';
import type { AudioFormat, Quality, Settings, UrlInfo, VideoContainer } from '../../shared/types';
import { cleanError } from '../main';
import { formatTime } from '../format';

const api = window.snutt;
const QUALITIES: Exclude<Quality, 'best'>[] = [2160, 1440, 1080, 720, 480];
const AUDIO: AudioFormat[] = ['mp3', 'm4a', 'opus', 'aac', 'flac', 'wav'];

export function DownloadView({ settings, onQueued }: { settings: Settings; onQueued(): void }) {
  const [url, setUrl] = useState('');
  const [info, setInfo] = useState<UrlInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'video' | 'audio'>('video');
  const [quality, setQuality] = useState<Quality>(settings.quality);
  const [container, setContainer] = useState<VideoContainer>(settings.container);
  const [audioFormat, setAudioFormat] = useState<AudioFormat>(settings.audioFormat);
  const [destination, setDestination] = useState(settings.downloadDir);

  const fetchInfo = async () => {
    setBusy(true); setError(null); setInfo(null);
    try { setInfo(await api.fetchUrlInfo(url)); }
    catch (e) { setError(cleanError(e)); }
    finally { setBusy(false); }
  };

  const start = async () => {
    setError(null);
    try {
      await api.startDownload({ url, title: info?.title ?? url, mode, quality, container, audioFormat, destination });
      setUrl(''); setInfo(null);
      onQueued();
    } catch (e) { setError(cleanError(e)); }
  };

  const available = QUALITIES.filter((q) => !info || info.heights.length === 0 || info.heights.some((h) => h >= q));
  const audioNote = audioFormat === 'flac' || audioFormat === 'wav'
    ? `${audioFormat.toUpperCase()} tar mer plass, men gir ikke bedre lyd enn kilden. Nettsteder leverer normalt tapsbeheftet lyd.`
    : audioFormat === 'mp3' || audioFormat === 'aac'
      ? 'Lyden omkodes hvis kilden har et annet format, og det gir et lite kvalitetstap.'
      : 'Lyden beholdes uendret hvis kilden allerede har dette formatet.';

  return (
    <div className="narrow">
      <h1>Last ned</h1>
      <form className="row" onSubmit={(e) => { e.preventDefault(); void fetchInfo(); }}>
        <input className="grow" type="url" aria-label="Nettadresse" placeholder="Lim inn adressen til en video" value={url}
          onChange={(e) => { setUrl(e.target.value); setInfo(null); }} />
        <button className="btn" type="submit" disabled={busy || !url.trim()}>{busy ? 'Henter info' : 'Hent info'}</button>
      </form>
      {error && <p className="error" role="alert" style={{ marginTop: 12 }}>{error}</p>}
      {info && (
        <>
          <div className="info">
            {info.thumbnail ? <img src={info.thumbnail} alt="" /> : <div className="meter" style={{ height: 99 }} />}
            <div>
              <div className="title">{info.title}</div>
              <div className="muted">{[info.uploader, info.durationSeconds != null ? formatTime(info.durationSeconds).replace(/\.\d+$/, '') : null].filter(Boolean).join(', ')}</div>
            </div>
          </div>
          <div className="row end">
            <label className="field">Type
              <select value={mode} onChange={(e) => setMode(e.target.value as 'video' | 'audio')}>
                <option value="video">Video med lyd</option>
                <option value="audio">Bare lyd</option>
              </select>
            </label>
            {mode === 'video' ? (
              <>
                <label className="field">Kvalitet
                  <select value={String(quality)} onChange={(e) => setQuality(e.target.value === 'best' ? 'best' : Number(e.target.value) as Quality)}>
                    <option value="best">Beste tilgjengelige</option>
                    {available.map((q) => <option key={q} value={q}>Opptil {q}p</option>)}
                  </select>
                </label>
                <label className="field">Filformat
                  <select value={container} onChange={(e) => setContainer(e.target.value as VideoContainer)}>
                    <option value="mp4">MP4</option><option value="mkv">MKV</option>
                  </select>
                </label>
              </>
            ) : (
              <label className="field">Lydformat
                <select value={audioFormat} onChange={(e) => setAudioFormat(e.target.value as AudioFormat)}>
                  {AUDIO.map((a) => <option key={a} value={a}>{a.toUpperCase()}</option>)}
                </select>
              </label>
            )}
          </div>
          {mode === 'audio' && <p className="muted small" style={{ marginTop: 10 }}>{audioNote}</p>}
          <div className="row" style={{ marginTop: 14 }}>
            <input className="grow" type="text" aria-label="Lagres i" value={destination} disabled />
            <button className="btn" onClick={async () => { const d = await api.pickFolder(destination); if (d) setDestination(d); }}>Velg mappe</button>
            <button className="btn primary" onClick={start}>Last ned</button>
          </div>
        </>
      )}
      {!info && !error && !busy && <p className="muted" style={{ marginTop: 16 }}>Du får velge kvalitet og format når informasjonen er hentet. Last bare ned innhold du har rett til å bruke.</p>}
    </div>
  );
}
