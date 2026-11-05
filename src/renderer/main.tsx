import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Job, OpenedMedia, Settings, SnuttApi } from '../shared/types';
import { DownloadView } from './views/DownloadView';
import { EditorView } from './views/EditorView';
import { InfoDialog } from './views/InfoDialog';
import { QueueView } from './views/QueueView';
import { SettingsView } from './views/SettingsView';

declare global { interface Window { snutt: SnuttApi; } }
const api = window.snutt;

export type View = 'download' | 'editor' | 'queue' | 'settings';
const NAV: { id: View; label: string }[] = [
  { id: 'download', label: 'Last ned' }, { id: 'editor', label: 'Klipp' },
  { id: 'queue', label: 'Kø' }, { id: 'settings', label: 'Innstillinger' },
];

function App() {
  const [view, setView] = useState<View>('download');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [media, setMedia] = useState<OpenedMedia | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [toolsMissing, setToolsMissing] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const refreshTools = async () => {
    const tools = await api.getTools();
    setToolsMissing(tools.some((t) => t.name !== 'deno' && !t.version));
  };

  useEffect(() => {
    void api.getSettings().then(setSettings);
    void api.getJobs().then(setJobs);
    void refreshTools();
    return api.onJobs(setJobs);
  }, []);

  const openMedia = async (path: string) => {
    setView('editor');
    setMediaError(null);
    try { setMedia(await api.openMedia(path)); }
    catch (e) { setMediaError(cleanError(e)); }
  };

  const active = jobs.filter((j) => j.status === 'running' || j.status === 'queued').length;
  if (!settings) return null;

  return (
    <div className="app">
      <nav className="side" aria-label="Hovedmeny">
        <div className="brand-row">
          <div className="brand">Snuttefanger</div>
          <div className="ver">v{api.version}</div>
          <button className="infobtn" aria-label="Om appen og hjelp" title="Om appen og hjelp" onClick={() => setInfoOpen(true)}>i</button>
        </div>
        {NAV.map((n) => (
          <button key={n.id} aria-current={view === n.id ? 'page' : undefined} onClick={() => setView(n.id)}>
            {n.label}{n.id === 'queue' && active > 0 && <span className="count">{active}</span>}
          </button>
        ))}
      </nav>
      <main className="main">
        {toolsMissing && view !== 'settings' && (
          <div className="banner row">
            <div className="grow">Snuttefanger trenger yt-dlp og FFmpeg før den kan laste ned og klippe.</div>
            <button className="btn primary" onClick={() => setView('settings')}>Gå til verktøy</button>
          </div>
        )}
        {view === 'download' && <DownloadView settings={settings} onQueued={() => setView('queue')} />}
        {view === 'editor' && <EditorView media={media} error={mediaError} onOpen={openMedia} onQueued={() => setView('queue')} />}
        {view === 'queue' && <QueueView jobs={jobs} onOpen={openMedia} />}
        {view === 'settings' && <SettingsView settings={settings} onChange={setSettings} onToolsChanged={refreshTools} />}
      </main>
      {infoOpen && <InfoDialog version={api.version} onClose={() => setInfoOpen(false)} />}
    </div>
  );
}

export function cleanError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

createRoot(document.getElementById('root')!).render(<App />);
