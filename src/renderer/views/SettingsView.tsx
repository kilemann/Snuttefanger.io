import { useEffect, useState } from 'react';
import type { AudioFormat, InstallState, Quality, Settings, ToolName, ToolStatus, VideoContainer } from '../../shared/types';
import { cleanError } from '../main';

const api = window.snutt;
const TOOL_LABEL: Record<ToolName, string> = { ytDlp: 'yt-dlp', ffmpeg: 'FFmpeg', ffprobe: 'ffprobe', deno: 'Deno' };
const SOURCE: Record<ToolStatus['source'], string> = { custom: 'valgt av deg', managed: 'installert av appen', system: 'fra systemet', missing: 'mangler' };
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
  const missing = tools.some((t) => t.source === 'missing');

  return (
    <div className="narrow">
      <h1>Innstillinger</h1>
      <div className="section" style={{ borderTop: 0, paddingTop: 0 }}>
        <h2>Verktøy</h2>
        <p className="muted small">Appen laster ned verktøyene fra utgivernes GitHub-sider og kontrollerer sjekksummene. Deno brukes av yt-dlp for YouTube.</p>
        {tools.map((t) => (
          <div className="tool" key={t.name}>
            <div>{TOOL_LABEL[t.name]}</div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="grow small">
                <span className={t.version ? '' : 'error'}>{t.version ?? (t.source === 'missing' ? 'Mangler' : 'Virker ikke')}</span>
                <span className="muted">, {SOURCE[t.source]}</span><br />
                {t.path && <code>{t.path}</code>}
              </div>
              <button className="btn" onClick={() => chooseTool(t.name)}>Velg fil</button>
              {t.source === 'custom' && <button className="btn" onClick={() => resetTool(t.name)}>Bruk standard</button>}
            </div>
          </div>
        ))}
        <div className="row" style={{ marginTop: 12 }}>
          <button className={`btn ${missing ? 'primary' : ''}`} disabled={busy || !missing} onClick={() => runInstall(api.installTools)}>Installer det som mangler</button>
          <button className="btn" disabled={busy} onClick={() => runInstall(api.updateYtDlp)}>Oppdater yt-dlp</button>
        </div>
        {busy && install && (
          <div style={{ marginTop: 10 }}>
            <div className={`meter ${install.percent == null ? 'unknown' : ''}`}><div style={install.percent != null ? { width: `${install.percent}%` } : undefined} /></div>
            <div className="muted small num">{install.message}{install.percent != null ? `, ${Math.floor(install.percent)} %` : ''}</div>
          </div>
        )}
        {error && <p className="error small" role="alert" style={{ marginTop: 8 }}>{error}</p>}
      </div>

      <div className="section">
        <h2>Mapper</h2>
        <div className="row" style={{ marginBottom: 8 }}>
          <label className="field grow">Nedlastinger
            <input type="text" value={settings.downloadDir} disabled />
          </label>
          <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={async () => { const d = await api.pickFolder(settings.downloadDir); if (d) await save({ downloadDir: d }); }}>Velg mappe</button>
        </div>
        <div className="row">
          <label className="field grow">Klipp
            <input type="text" value={settings.exportDir || 'Samme mappe som originalfilen'} disabled />
          </label>
          <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={async () => { const d = await api.pickFolder(settings.exportDir); if (d) await save({ exportDir: d }); }}>Velg mappe</button>
          {settings.exportDir && <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={() => save({ exportDir: '' })}>Bruk originalmappen</button>}
        </div>
      </div>

      <div className="section">
        <h2>Standardvalg for nedlasting</h2>
        <div className="row end">
          <label className="field">Kvalitet
            <select value={String(settings.quality)} onChange={(e) => save({ quality: (e.target.value === 'best' ? 'best' : Number(e.target.value)) as Quality })}>
              <option value="best">Beste tilgjengelige</option>
              {[2160, 1440, 1080, 720, 480].map((q) => <option key={q} value={q}>Opptil {q}p</option>)}
            </select>
          </label>
          <label className="field">Videoformat
            <select value={settings.container} onChange={(e) => save({ container: e.target.value as VideoContainer })}>
              <option value="mp4">MP4</option><option value="mkv">MKV</option>
            </select>
          </label>
          <label className="field">Lydformat
            <select value={settings.audioFormat} onChange={(e) => save({ audioFormat: e.target.value as AudioFormat })}>
              {['mp3', 'm4a', 'opus', 'aac', 'flac', 'wav'].map((a) => <option key={a} value={a}>{a.toUpperCase()}</option>)}
            </select>
          </label>
          <label className="field">Samtidige nedlastinger
            <select value={settings.maxDownloads} onChange={(e) => save({ maxDownloads: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
        <label className="row small" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={settings.embedThumbnail} onChange={(e) => save({ embedThumbnail: e.target.checked })} />
          Bygg inn miniatyrbilde i filen
        </label>
      </div>
    </div>
  );
}
