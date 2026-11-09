import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isLanguage } from '../../shared/i18n';
import type { Settings } from '../../shared/types';

const QUALITIES = ['best', 2160, 1440, 1080, 720, 480];
const CONTAINERS = ['mp4', 'mkv'];
const AUDIO = ['mp3', 'flac', 'wav', 'aac', 'opus', 'm4a'];

export function sanitizeSettings(raw: Partial<Settings>, defaults: Settings): Settings {
  const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
  const max = Number(raw.maxDownloads);
  return {
    downloadDir: str(raw.downloadDir, defaults.downloadDir) || defaults.downloadDir,
    exportDir: str(raw.exportDir, defaults.exportDir),
    quality: QUALITIES.includes(raw.quality as never) ? raw.quality! : defaults.quality,
    container: CONTAINERS.includes(raw.container as never) ? raw.container! : defaults.container,
    audioFormat: AUDIO.includes(raw.audioFormat as never) ? raw.audioFormat! : defaults.audioFormat,
    maxDownloads: Number.isInteger(max) && max >= 1 && max <= 8 ? max : defaults.maxDownloads,
    embedThumbnail: typeof raw.embedThumbnail === 'boolean' ? raw.embedThumbnail : defaults.embedThumbnail,
    ytDlpPath: str(raw.ytDlpPath, ''),
    ffmpegPath: str(raw.ffmpegPath, ''),
    ffprobePath: str(raw.ffprobePath, ''),
    denoPath: str(raw.denoPath, ''),
    language: isLanguage(raw.language) ? raw.language : defaults.language,
    checkUpdates: typeof raw.checkUpdates === 'boolean' ? raw.checkUpdates : defaults.checkUpdates,
    dismissedVersion: str(raw.dismissedVersion, '').slice(0, 40),
    // Mangler de nye mappene (oppgradering fra 0.8 eller eldre), brukes mappene som gjaldt før.
    quickMp3Dir: str(raw.quickMp3Dir, '') || (typeof raw.downloadDir === 'string' && raw.downloadDir ? raw.downloadDir : defaults.quickMp3Dir),
    cutDownloadDir: str(raw.cutDownloadDir, '') || (typeof raw.downloadDir === 'string' && raw.downloadDir ? raw.downloadDir : defaults.cutDownloadDir),
    cutDownloadMode: raw.cutDownloadMode === 'video' || raw.cutDownloadMode === 'audio' ? raw.cutDownloadMode : defaults.cutDownloadMode,
    joinDir: typeof raw.joinDir === 'string' ? raw.joinDir : str(raw.exportDir, defaults.joinDir),
  };
}

export class SettingsService {
  private current: Settings;
  private readonly file: string;

  constructor(dir: string, private readonly defaults: Settings) {
    this.file = join(dir, 'settings.json');
    let stored: Partial<Settings> = {};
    try { stored = JSON.parse(readFileSync(this.file, 'utf8')); } catch { /* første oppstart eller skadet fil */ }
    this.current = sanitizeSettings(stored, defaults);
  }

  get(): Settings { return { ...this.current }; }

  save(patch: Partial<Settings>): Settings {
    this.current = sanitizeSettings({ ...this.current, ...patch }, this.defaults);
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.current, null, 2));
    renameSync(tmp, this.file);
    return this.get();
  }
}
