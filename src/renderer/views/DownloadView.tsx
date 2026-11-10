import { useState } from 'react';
import type { AudioFormat, Quality, Settings, UrlInfo, VideoContainer } from '../../shared/types';
import { cleanError } from '../main';
import { formatTime } from '../format';
import { t } from '../i18n';

const api = window.snutt;
const QUALITIES: Exclude<Quality, 'best'>[] = [2160, 1440, 1080, 720, 480];
const AUDIO: AudioFormat[] = ['mp3', 'm4a', 'opus', 'aac', 'flac', 'wav'];

/** Viser hvor filene lagres. Mappene endres under Innstillinger. */
function SavedIn({ path, onGoSettings }: { path: string; onGoSettings(): void }) {
  return (
    <p className="muted small folder-info">
      {t('dl.quickFolder')} <code>{path}</code>. <button className="linkbtn" onClick={onGoSettings}>{t('dl.changeInSettings')}</button>
    </p>
  );
}

export function DownloadView({ settings, onQueued, onSettings, onOpenWhenDone, onGoSettings }: { settings: Settings; onQueued(): void; onSettings(s: Settings): void; onOpenWhenDone(id: string): void; onGoSettings(): void }) {
  // Valg som lagres vises med en gang, og lagres etterpå.
  const save = async (patch: Partial<Settings>) => {
    onSettings({ ...settings, ...patch });
    onSettings(await api.saveSettings(patch));
  };

  // 1. Hurtig MP3: starter når du limer inn.
  const [quick, setQuick] = useState('');
  const [quickDone, setQuickDone] = useState<string[]>([]);
  const [quickError, setQuickError] = useState<string | null>(null);
  const startQuick = async (text: string) => {
    const link = text.trim();
    if (!link) return;
    setQuickError(null);
    try {
      await api.startDownload({ url: link, title: link, mode: 'audio', quality: 'best', container: settings.container, audioFormat: 'mp3', destination: settings.quickMp3Dir });
      setQuick('');
      setQuickDone((old) => [link, ...old].slice(0, 5));
    } catch (e) {
      setQuick(link);
      setQuickError(cleanError(e));
    }
  };

  // 2. Last ned til Klipp: starter med knappen, og Klipp åpnes når filen er ferdig.
  const [cutUrl, setCutUrl] = useState('');
  const [cutDone, setCutDone] = useState<string | null>(null);
  const [cutError, setCutError] = useState<string | null>(null);
  const startCut = async () => {
    const link = cutUrl.trim();
    if (!link) return;
    setCutError(null);
    try {
      const id = await api.startDownload({
        url: link, title: link, mode: settings.cutDownloadMode, quality: 'best', container: settings.container, audioFormat: 'mp3', destination: settings.cutDownloadDir,
      });
      onOpenWhenDone(id);
      setCutUrl('');
      setCutDone(link);
    } catch (e) { setCutError(cleanError(e)); }
  };

  // 3. Vanlig nedlasting med Hent info.
  const [url, setUrl] = useState('');
  const [info, setInfo] = useState<UrlInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'video' | 'audio'>('video');
  const [quality, setQuality] = useState<Quality>(settings.quality);
  const [container, setContainer] = useState<VideoContainer>(settings.container);
  const [audioFormat, setAudioFormat] = useState<AudioFormat>(settings.audioFormat);

  const fetchInfo = async () => {
    setBusy(true); setError(null); setInfo(null);
    try { setInfo(await api.fetchUrlInfo(url)); }
    catch (e) { setError(cleanError(e)); }
    finally { setBusy(false); }
  };

  const start = async () => {
    setError(null);
    try {
      await api.startDownload({ url, title: info?.title ?? url, mode, quality, container, audioFormat, destination: settings.downloadDir });
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

      <section className="quick dl-card dl-mp3" aria-labelledby="quick-title">
        <h2 id="quick-title">{t('dl.quickTitle')}</h2>
        <p className="muted small dl-desc">{t('dl.quickDesc')}</p>
        <input className="quick-input" type="url" aria-label={t('dl.quickLabel')} placeholder={t('dl.quickPlaceholder')} value={quick}
          onChange={(e) => { setQuick(e.target.value); setQuickError(null); }}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (!text) return;
            e.preventDefault();
            void startQuick(text);
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') void startQuick(quick); }} />
        {quickError && <p className="error small" role="alert" style={{ marginTop: 8 }}>{quickError}</p>}
        {quickDone.map((u, i) => <p key={`${u}-${i}`} className="ok small quick-done">{t('dl.quickStarted', { url: u })}</p>)}
        <SavedIn path={settings.quickMp3Dir} onGoSettings={onGoSettings} />
      </section>

      <section className="quick dl-card dl-cut" aria-labelledby="cut-title">
        <h2 id="cut-title">{t('dl.cutTitle')}</h2>
        <p className="muted small dl-desc">{t('dl.cutHint')}</p>
        <form className="row" onSubmit={(e) => { e.preventDefault(); void startCut(); }}>
          <input className="grow" type="url" aria-label={t('dl.cutLabel')} placeholder={t('dl.cutPlaceholder')} value={cutUrl}
            onChange={(e) => { setCutUrl(e.target.value); setCutError(null); }} />
          <select aria-label={t('dl.quickAs')} value={settings.cutDownloadMode} onChange={(e) => save({ cutDownloadMode: e.target.value as 'audio' | 'video' })}>
            <option value="audio">MP3</option>
            <option value="video">{t('dl.quickVideo', { fmt: settings.container.toUpperCase() })}</option>
          </select>
          <button className="btn primary" type="submit" disabled={!cutUrl.trim()}>{t('dl.cutStart')}</button>
        </form>
        {cutError && <p className="error small" role="alert" style={{ marginTop: 8 }}>{cutError}</p>}
        {cutDone && <p className="ok small quick-done">{t('dl.cutStarted', { url: cutDone })}</p>}
        <SavedIn path={settings.cutDownloadDir} onGoSettings={onGoSettings} />
      </section>

      <section className="quick dl-card dl-custom" aria-labelledby="custom-title">
      <h2 id="custom-title">{t('dl.normal')}</h2>
      <p className="muted small dl-desc">{t('dl.normalDesc')}</p>
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
      <SavedIn path={settings.downloadDir} onGoSettings={onGoSettings} />
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
            <button className="btn primary" onClick={start}>{t('dl.start')}</button>
          </div>
        </>
      )}
      {!info && !error && !busy && <p className="muted small" style={{ marginTop: 10 }}>{t('dl.hint')}</p>}
      </section>
    </div>
  );
}
