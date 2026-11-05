import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { CutBatch, CutRequest, DownloadRequest, InstallState, Job, Settings, ToolName } from '../shared/types';
import { mediaSrc, registerMediaHandler, registerSchemePrivileges } from './protocol';
import { BinaryManager } from './services/BinaryManager';
import { DownloadRunner, assertHttpUrl, fetchUrlInfo, type DownloaderDeps } from './services/DownloaderService';
import { CutRunner, MAX_CLIPS, validateCut } from './services/ExportService';
import { JobQueue } from './services/JobQueue';
import { probeMedia } from './services/MediaProbeService';
import { stopAllProcesses } from './services/ProcessManager';
import { SettingsService } from './services/SettingsService';

registerSchemePrivileges();
if (process.env.SNUTT_USER_DATA) app.setPath('userData', process.env.SNUTT_USER_DATA);

let win: BrowserWindow | null = null;
const send = (channel: string, value: unknown) => { if (win && !win.isDestroyed()) win.webContents.send(channel, value); };

function createWindow(): void {
  win = new BrowserWindow({
    width: 1240, height: 820, minWidth: 900, minHeight: 620,
    title: 'Snuttefanger', backgroundColor: '#1c1a26', autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  void win.loadFile(join(__dirname, '../renderer/index.html'));
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  const data = app.getPath('userData');
  const tempRoot = join(data, 'tmp');
  mkdirSync(data, { recursive: true });
  rmSync(tempRoot, { recursive: true, force: true }); // Pause overlever ikke omstart i fase 1.
  const settings = new SettingsService(data, {
    downloadDir: join(app.getPath('videos'), 'Snuttefanger'), exportDir: '', quality: 'best', container: 'mp4', audioFormat: 'mp3',
    maxDownloads: 3, embedThumbnail: true, ytDlpPath: '', ffmpegPath: '', ffprobePath: '', denoPath: '',
  });
  const binaries = new BinaryManager(join(data, 'bin'), () => settings.get(), (s: InstallState) => send('install', s));
  const queue = new JobQueue((jobs: Job[]) => send('jobs', jobs));
  queue.setLimit('download', settings.get().maxDownloads);

  const deps: DownloaderDeps = {
    ytDlp: () => binaries.require('ytDlp'),
    tools: () => ({ ffmpeg: binaries.require('ffmpeg'), deno: binaries.locate('deno').path }),
    tempRoot,
    embedThumbnail: () => settings.get().embedThumbnail,
  };
  queue.register('download', new DownloadRunner(deps));
  queue.register('export', new CutRunner({
    ffmpeg: () => binaries.require('ffmpeg'), ffprobe: () => binaries.require('ffprobe'), exportDir: () => settings.get().exportDir,
  }));

  const pickFolder = async (current?: string) => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'], defaultPath: current || undefined });
    return r.canceled ? null : r.filePaths[0];
  };

  ipcMain.handle('settings:get', () => settings.get());
  ipcMain.handle('settings:save', (_e, patch: Partial<Settings>) => {
    const s = settings.save(patch);
    queue.setLimit('download', s.maxDownloads);
    return s;
  });
  ipcMain.handle('dialog:folder', (_e, current?: string) => pickFolder(current));
  ipcMain.handle('dialog:tool', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openFile'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('tools:get', () => binaries.status());
  ipcMain.handle('tools:install', async () => { await binaries.install(); return binaries.status(); });
  ipcMain.handle('tools:update-ytdlp', async () => { await binaries.install(['ytDlp' as ToolName]); return binaries.status(); });
  ipcMain.handle('url:info', (_e, url: string) => fetchUrlInfo(deps, url));
  ipcMain.handle('download:start', (_e, req: DownloadRequest) => {
    const safe = { ...req, url: assertHttpUrl(req.url) };
    binaries.require('ytDlp'); binaries.require('ffmpeg');
    queue.enqueue('download', req.title || safe.url, safe);
  });
  ipcMain.handle('media:pick', async () => {
    const r = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [{ name: 'Video og lyd', extensions: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'mp3', 'flac', 'wav', 'aac', 'm4a', 'ogg', 'opus'] }, { name: 'Alle filer', extensions: ['*'] }],
    });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('media:open', async (_e, path: string) => {
    const info = await probeMedia(binaries.require('ffprobe'), path);
    return { ...info, src: mediaSrc(path) };
  });
  ipcMain.handle('cut:start', async (_e, batch: CutBatch) => {
    const info = await probeMedia(binaries.require('ffprobe'), batch.input);
    const { clips } = batch;
    if (clips.length < 1 || clips.length > MAX_CLIPS) throw new Error(`Velg mellom 1 og ${MAX_CLIPS} klipp.`);
    // Alle klipp kontrolleres før noe legges i køen, så en feil ikke gir halve eksporter.
    clips.forEach((c, i) => {
      try { validateCut(c.startSeconds, c.endSeconds, info.durationSeconds); }
      catch (e) { throw new Error(`Klipp ${i + 1}: ${(e as Error).message}`); }
    });
    clips.forEach((c, i) => {
      const prefix = clips.length > 1 ? `Klipp ${i + 1} av ${clips.length}` : 'Klipp';
      queue.enqueue('export', `${prefix} fra ${info.fileName}`, { input: batch.input, ...c } satisfies CutRequest);
    });
  });
  ipcMain.handle('jobs:get', () => queue.list());
  ipcMain.handle('job:pause', (_e, id: string) => queue.pause(id));
  ipcMain.handle('job:resume', (_e, id: string) => queue.resume(id));
  ipcMain.handle('job:cancel', (_e, id: string) => queue.cancel(id));
  ipcMain.handle('job:retry', (_e, id: string) => queue.retry(id));
  ipcMain.handle('job:remove', (_e, id: string) => queue.remove(id));
  ipcMain.handle('shell:show', (_e, path: string) => {
    if (queue.list().some((j) => j.outputPath === path)) shell.showItemInFolder(path);
  });

  registerMediaHandler();
  createWindow();
  app.on('before-quit', () => { queue.stopAll(); stopAllProcesses(); });
});

app.on('window-all-closed', () => app.quit());
