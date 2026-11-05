import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { TextKey } from '../shared/i18n';
import type { Job, OpenedMedia, Settings, SnuttApi } from '../shared/types';
import { setLanguage, t, tm } from './i18n';
import { DownloadView } from './views/DownloadView';
import { EditorView } from './views/EditorView';
import { InfoDialog } from './views/InfoDialog';
import { JoinView, type JoinItem } from './views/JoinView';
import { QueueView } from './views/QueueView';
import { SettingsView } from './views/SettingsView';

declare global { interface Window { snutt: SnuttApi; } }
const api = window.snutt;

export type View = 'download' | 'editor' | 'join' | 'queue' | 'settings';
const NAV: { id: View; label: TextKey }[] = [
  { id: 'download', label: 'nav.download' }, { id: 'editor', label: 'nav.cut' }, { id: 'join', label: 'nav.join' },
  { id: 'queue', label: 'nav.queue' }, { id: 'settings', label: 'nav.settings' },
];

function App() {
  const [view, setView] = useState<View>('download');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [media, setMedia] = useState<OpenedMedia | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [toolsMissing, setToolsMissing] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [joinItems, setJoinItems] = useState<JoinItem[]>([]);
  const addToJoin = (path: string) => {
    setJoinItems((old) => [...old, { path }]);
    api.probeMedia(path).then(
      (info) => setJoinItems((old) => old.map((it) => (it.path === path && !it.info ? { ...it, info } : it))),
      (e) => setJoinItems((old) => old.map((it) => (it.path === path && !it.info ? { ...it, error: cleanError(e) } : it))),
    );
  };

  const refreshTools = async () => {
    const tools = await api.getTools();
    setToolsMissing(tools.some((tool) => tool.name !== 'deno' && !tool.version));
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
  setLanguage(settings.language);

  return (
    <div className="app">
      <nav className="side" aria-label={t('app.menu')}>
        <div className="brand-row">
          <div className="brand">Snuttefanger</div>
          <div className="ver">v{api.version}</div>
          <button className="infobtn" aria-label={t('app.about')} title={t('app.about')} onClick={() => setInfoOpen(true)}>i</button>
        </div>
        {NAV.map((n) => (
          <button key={n.id} aria-current={view === n.id ? 'page' : undefined} onClick={() => setView(n.id)}>
            {t(n.label)}{n.id === 'queue' && active > 0 && <span className="count">{active}</span>}
          </button>
        ))}
      </nav>
      <main className="main">
        {toolsMissing && view !== 'settings' && (
          <div className="banner row">
            <div className="grow">{t('app.toolsBanner')}</div>
            <button className="btn primary" onClick={() => setView('settings')}>{t('app.goToTools')}</button>
          </div>
        )}
        {view === 'download' && <DownloadView settings={settings} onQueued={() => setView('queue')} />}
        {view === 'editor' && <EditorView media={media} error={mediaError} onOpen={openMedia} onQueued={() => setView('queue')} />}
        {view === 'join' && <JoinView items={joinItems} setItems={setJoinItems} onQueued={() => setView('queue')} />}
        {view === 'queue' && <QueueView jobs={jobs} onOpen={openMedia} onAddToJoin={addToJoin} joinPaths={joinItems.map((it) => it.path)} />}
        {view === 'settings' && <SettingsView settings={settings} onChange={setSettings} onToolsChanged={refreshTools} />}
      </main>
      {infoOpen && <InfoDialog version={api.version} onClose={() => setInfoOpen(false)} />}
    </div>
  );
}

export function cleanError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return tm(m.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
}

createRoot(document.getElementById('root')!).render(<App />);
