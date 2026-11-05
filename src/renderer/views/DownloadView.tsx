import { useState } from 'react';
import type { AudioFormat, Quality, Settings, UrlInfo, VideoContainer } from '../../shared/types';
import { cleanError } from '../main';
import { formatTime } from '../format';
import { t } from '../i18n';

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
    ? t('dl.noteBig', { fmt: audioFormat.toUpperCase() })
    : audioFormat === 'mp3' || audioFormat === 'aac' ? t('dl.noteReencode') : t('dl.noteKeep');

  return (
    <div className="narrow">
      <h1>{t('dl.title')}</h1>
      <form className="row" onSubmit={(e) => { e.preventDefault(); void fetchInfo(); }}>
        <input className="grow" type="url" aria-label={t('dl.address')} placeholder={t('dl.placeholder')} value={url}
          onChange={(e) => { setUrl(e.target.value); setInfo(null); }} />
        <button className="btn" type="submit" disabled={busy || !url.trim()}>{busy ? t('dl.gettingInfo') : t('dl.getInfo')}</button>
      </form>
      <div className="row end" style={{ marginTop: 14 }}>
        <label className="field">{t('dl.type')}
          <select aria-label={t('dl.typeLabel')} value={mode} onChange={(e) => setMode(e.target.value as 'video' | 'audio')}>
            <option value="video">{t('dl.videoAudio')}</option>
            <option value="audio">{t('dl.audioOnly')}</option>
          </select>
        </label>
        {mode === 'video' ? (
          <>
            <label className="field">{t('dl.quality')}
              <select value={String(quality)} onChange={(e) => setQuality(e.target.value === 'best' ? 'best' : Number(e.target.value) as Quality)}>
                <option value="best">{t('dl.best')}</option>
                {available.map((q) => <option key={q} value={q}>{t('dl.upTo', { q: String(q) })}</option>)}
              </select>
            </label>
            <label className="field">{t('dl.fileFormat')}
              <select value={container} onChange={(e) => setContainer(e.target.value as VideoContainer)}>
                <option value="mp4">MP4</option><option value="mkv">MKV</option>
              </select>
            </label>
          </>
        ) : (
          <label className="field">{t('dl.audioFormat')}
            <select value={audioFormat} onChange={(e) => setAudioFormat(e.target.value as AudioFormat)}>
              {AUDIO.map((a) => <option key={a} value={a}>{a.toUpperCase()}</option>)}
            </select>
          </label>
        )}
      </div>
      {mode === 'audio' && <p className="muted small" style={{ marginTop: 10 }}>{audioNote}</p>}
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
          <div className="row">
            <input className="grow" type="text" aria-label={t('dl.saveTo')} value={destination} disabled />
            <button className="btn" onClick={async () => { const d = await api.pickFolder(destination); if (d) setDestination(d); }}>{t('dl.chooseFolder')}</button>
            <button className="btn primary" onClick={start}>{t('dl.start')}</button>
          </div>
        </>
      )}
      {!info && !error && !busy && <p className="muted" style={{ marginTop: 16 }}>{t('dl.hint')}</p>}
    </div>
  );
}
