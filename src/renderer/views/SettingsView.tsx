import { useEffect, useState } from 'react';
import { LANGUAGES, type Language, type TextKey } from '../../shared/i18n';
import type { AudioFormat, InstallState, Quality, Settings, ToolName, ToolStatus, VideoContainer } from '../../shared/types';
import { cleanError } from '../main';
import { t, tm } from '../i18n';

const api = window.snutt;
const TOOL_LABEL: Record<ToolName, string> = { ytDlp: 'yt-dlp', ffmpeg: 'FFmpeg', ffprobe: 'ffprobe', deno: 'Deno' };
const SOURCE: Record<ToolStatus['source'], TextKey> = { custom: 'set.custom', managed: 'set.managed', system: 'set.system', missing: 'set.srcMissing' };
const TOOL_KEY: Record<ToolName, keyof Settings> = { ytDlp: 'ytDlpPath', ffmpeg: 'ffmpegPath', ffprobe: 'ffprobePath', deno: 'denoPath' };

export function SettingsView({ settings, onChange, onToolsChanged }: { settings: Settings; onChange(s: Settings): void; onToolsChanged(): void }) {
  const [tools, setTools] = useState<ToolStatus[]>([]);
  const [install, setInstall] = useState<InstallState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void api.getTools().then(setTools); return api.onInstall(setInstall); }, []);

  const save = async (patch: Partial<Settings>) => onChange(await api.saveSettings(patch));
  const runInstall = async (action: () => Promise<ToolStatus[]>) => {
    setBusy(true); setError(null);
    try { setTools(await action()); onToolsChanged(); }
    catch (e) { setError(cleanError(e)); }
    finally { setBusy(false); }
  };
  const chooseTool = async (name: ToolName) => {
    const p = await api.pickToolFile();
    if (p) { await save({ [TOOL_KEY[name]]: p }); setTools(await api.getTools()); onToolsChanged(); }
  };
  const resetTool = async (name: ToolName) => {
    await save({ [TOOL_KEY[name]]: '' }); setTools(await api.getTools()); onToolsChanged();
  };
  const missing = tools.some((tool) => tool.source === 'missing');
  const allWorking = tools.length > 0 && tools.every((tool) => tool.version);

  return (
    <div className="narrow">
      <h1>{t('set.title')}</h1>
      <div className="section" style={{ borderTop: 0, paddingTop: 0 }}>
        <label className="field" style={{ maxWidth: 220 }}>{t('set.language')}
          <select aria-label={t('set.language')} value={settings.language} onChange={(e) => save({ language: e.target.value as Language })}>
            {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
      </div>

      <div className="section">
        <h2>{t('set.tools')}</h2>
        <p className="muted small">{t('set.toolsNote')}</p>
        {tools.map((tool) => (
          <div className="tool" key={tool.name}>
            <div>{TOOL_LABEL[tool.name]}</div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="grow small">
                <span className={tool.version ? '' : 'error'}>{tool.version ?? (tool.source === 'missing' ? t('set.missing') : t('set.notWorking'))}</span>
                <span className="muted">, {t(SOURCE[tool.source])}</span><br />
                {tool.path && <code>{tool.path}</code>}
              </div>
              <button className="btn" onClick={() => chooseTool(tool.name)}>{t('set.chooseFile')}</button>
              {tool.source === 'custom' && <button className="btn" onClick={() => resetTool(tool.name)}>{t('set.useDefault')}</button>}
            </div>
          </div>
        ))}
        <div className="row" style={{ marginTop: 12 }}>
          <button className={`btn ${missing ? 'primary' : ''}`} disabled={busy || !missing} onClick={() => runInstall(api.installTools)}>{t('set.install')}</button>
          <button className="btn" disabled={busy} onClick={() => runInstall(api.updateYtDlp)}>{t('set.update')}</button>
          <button className="btn" disabled={busy} onClick={() => runInstall(api.updateFfmpeg)}>{t('set.updateFfmpeg')}</button>
        </div>
        {!busy && !missing && allWorking && <p className="ok small" style={{ marginTop: 8 }}>{t('set.allInstalled')}</p>}
        {busy && install && (
          <div style={{ marginTop: 10 }}>
            <div className={`meter ${install.percent == null ? 'unknown' : ''}`}><div style={install.percent != null ? { width: `${install.percent}%` } : undefined} /></div>
            <div className="muted small num">{tm(install.message)}{install.percent != null ? `, ${Math.floor(install.percent)} %` : ''}</div>
          </div>
        )}
        {error && <p className="error small" role="alert" style={{ marginTop: 8 }}>{error}</p>}
      </div>

      <div className="section">
        <h2>{t('set.folders')}</h2>
        <div className="row" style={{ marginBottom: 8 }}>
          <label className="field grow">{t('set.downloads')}
            <input type="text" value={settings.downloadDir} disabled />
          </label>
          <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={async () => { const d = await api.pickFolder(settings.downloadDir); if (d) await save({ downloadDir: d }); }}>{t('set.chooseFolder')}</button>
        </div>
        <div className="row">
          <label className="field grow">{t('set.clips')}
            <input type="text" value={settings.exportDir || t('set.sameFolder')} disabled />
          </label>
          <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={async () => { const d = await api.pickFolder(settings.exportDir); if (d) await save({ exportDir: d }); }}>{t('set.chooseFolder')}</button>
          {settings.exportDir && <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={() => save({ exportDir: '' })}>{t('set.useOriginal')}</button>}
        </div>
      </div>

      <div className="section">
        <h2>{t('set.defaults')}</h2>
        <div className="row end">
          <label className="field">{t('set.quality')}
            <select value={String(settings.quality)} onChange={(e) => save({ quality: (e.target.value === 'best' ? 'best' : Number(e.target.value)) as Quality })}>
              <option value="best">{t('dl.best')}</option>
              {[2160, 1440, 1080, 720, 480].map((q) => <option key={q} value={q}>{t('dl.upTo', { q: String(q) })}</option>)}
            </select>
          </label>
          <label className="field">{t('set.videoFormat')}
            <select value={settings.container} onChange={(e) => save({ container: e.target.value as VideoContainer })}>
              <option value="mp4">MP4</option><option value="mkv">MKV</option>
            </select>
          </label>
          <label className="field">{t('set.audioFormat')}
            <select value={settings.audioFormat} onChange={(e) => save({ audioFormat: e.target.value as AudioFormat })}>
              {['mp3', 'm4a', 'opus', 'aac', 'flac', 'wav'].map((a) => <option key={a} value={a}>{a.toUpperCase()}</option>)}
            </select>
          </label>
          <label className="field">{t('set.simultaneous')}
            <select aria-label={t('set.simultaneous')} value={settings.maxDownloads} onChange={(e) => save({ maxDownloads: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
        <label className="row small" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={settings.embedThumbnail} onChange={(e) => save({ embedThumbnail: e.target.checked })} />
          {t('set.thumbnail')}
        </label>
      </div>
    </div>
  );
}
