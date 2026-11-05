import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { SnuttApi } from '../shared/types';

declare const __APP_VERSION__: string;

const listen = <T>(channel: string, listener: (value: T) => void) => {
  const wrapped = (_e: unknown, value: T) => listener(value);
  ipcRenderer.on(channel, wrapped);
  return () => { ipcRenderer.removeListener(channel, wrapped); };
};
const call = (channel: string) => (...args: unknown[]) => ipcRenderer.invoke(channel, ...args);

const api: SnuttApi = {
  version: __APP_VERSION__,
  getSettings: call('settings:get'), saveSettings: call('settings:save'),
  pickFolder: call('dialog:folder'), pickToolFile: call('dialog:tool'),
  getTools: call('tools:get'), installTools: call('tools:install'), updateYtDlp: call('tools:update-ytdlp'),
  fetchUrlInfo: call('url:info'), startDownload: call('download:start'),
  pickMedia: call('media:pick'), openMedia: call('media:open'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  startCuts: call('cut:start'),
  getJobs: call('jobs:get'), pauseJob: call('job:pause'), resumeJob: call('job:resume'),
  cancelJob: call('job:cancel'), retryJob: call('job:retry'), removeJob: call('job:remove'),
  showInFolder: call('shell:show'),
  onJobs: (l) => listen('jobs', l), onInstall: (l) => listen('install', l),
};
contextBridge.exposeInMainWorld('snutt', api);
