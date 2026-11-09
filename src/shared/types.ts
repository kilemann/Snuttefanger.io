import type { Language } from './i18n';

export type JobKind = 'download' | 'export' | 'join';
export type JobStatus = 'queued' | 'running' | 'paused' | 'done' | 'failed' | 'canceled';

export interface JobProgress {
  percent: number | null;
  speedBps: number | null;
  etaSeconds: number | null;
  totalBytes: number | null;
}

export interface Job {
  id: string;
  kind: JobKind;
  title: string;
  status: JobStatus;
  progress: JobProgress;
  outputPath?: string;
  error?: string;
  note?: string;
  createdAt: number;
}

export type Quality = 'best' | 2160 | 1440 | 1080 | 720 | 480;
export type VideoContainer = 'mp4' | 'mkv';
export type AudioFormat = 'mp3' | 'flac' | 'wav' | 'aac' | 'opus' | 'm4a';

export interface DownloadRequest {
  url: string;
  title: string;
  mode: 'video' | 'audio';
  quality: Quality;
  container: VideoContainer;
  audioFormat: AudioFormat;
  destination: string;
}

export interface UrlInfo {
  title: string;
  uploader: string | null;
  durationSeconds: number | null;
  thumbnail: string | null;
  heights: number[];
}

export interface MediaStream {
  index: number;
  type: 'video' | 'audio' | 'subtitle' | 'other';
  attachedPic: boolean;
  codec: string;
  width?: number;
  height?: number;
  frameRate?: number;
  channels?: number;
  sampleRate?: number;
  bits?: number;
}

export interface MediaInfo {
  path: string;
  fileName: string;
  sizeBytes: number;
  durationSeconds: number;
  startSeconds: number;
  formatName: string;
  bitrate: number | null;
  streams: MediaStream[];
}

export interface OpenedMedia extends MediaInfo {
  src: string;
}

/** av: video and audio as in the original. audio: only the first audio track, without re-encoding. */
export type CutMode = 'av' | 'audio';

/** original: lyden kopieres uendret. De andre kodes om, med mindre lyden allerede har det formatet. */
export type AudioTarget = 'original' | 'mp3' | 'm4a' | 'opus' | 'flac' | 'wav';
export const AUDIO_TARGETS: AudioTarget[] = ['original', 'mp3', 'm4a', 'opus', 'flac', 'wav'];

export interface CutRequest {
  input: string;
  startSeconds: number;
  endSeconds: number;
  mode: CutMode;
  audioFormat?: AudioTarget;
  /** Valgfritt navn som blir filnavnet. */
  name?: string;
}

export interface JoinEffects {
  /** Avspillingshastighet per fil, uten endret tonehøyde, 0.5–2. Mangler en verdi, brukes 1. */
  speeds: number[];
  /** Fjerner stillhet i starten og slutten av hver fil. */
  trimSilence: boolean;
  /** Utjevner lydnivået (EBU R128). */
  normalize: boolean;
  fadeIn: number;
  fadeOut: number;
  /** Krysstoning mellom filene i sekunder. 0 betyr rett skjøt. */
  crossfade: number;
  title: string;
  artist: string;
  cover: boolean;
}

export const NO_EFFECTS: JoinEffects = { speeds: [], trimSilence: false, normalize: false, fadeIn: 0, fadeOut: 0, crossfade: 0, title: '', artist: '', cover: true };

export interface JoinRequest {
  inputs: string[];
  format: AudioTarget;
  effects?: JoinEffects;
}

export interface Waveform { peaksPerSecond: number; peaks: Uint8Array; maxPeak: number }

export interface ClipProject {
  count: number;
  active: number;
  clips: { start: number; end: number; mode: CutMode; fmt: AudioTarget; name?: string }[];
}

export interface PreviewResult { src: string; durationSeconds: number; path: string }

export interface CutBatch {
  input: string;
  clips: { startSeconds: number; endSeconds: number; mode: CutMode; audioFormat: AudioTarget; name?: string }[];
}

export interface Settings {
  downloadDir: string;
  exportDir: string;
  quality: Quality;
  container: VideoContainer;
  audioFormat: AudioFormat;
  maxDownloads: number;
  embedThumbnail: boolean;
  ytDlpPath: string;
  ffmpegPath: string;
  ffprobePath: string;
  denoPath: string;
  language: Language;
  checkUpdates: boolean;
  /** Versjonen brukeren har sagt Ikke nå til. */
  dismissedVersion: string;
  /** Hurtig nedlasting: lyd som MP3, eller video i valgt filformat. */
  quickMode: 'audio' | 'video';
  /** Åpne filen i Klipp når hurtig nedlasting er ferdig. */
  quickOpenCut: boolean;
}

export interface UpdateInfo { latest: string; newer: boolean }

export type ToolName = 'ytDlp' | 'ffmpeg' | 'ffprobe' | 'deno';

export interface ToolStatus {
  name: ToolName;
  path: string | null;
  version: string | null;
  source: 'custom' | 'managed' | 'system' | 'missing';
}

export interface InstallState {
  active: boolean;
  message: string;
  percent: number | null;
  error: string | null;
}

export interface SnuttApi {
  version: string;
  getSettings(): Promise<Settings>;
  saveSettings(patch: Partial<Settings>): Promise<Settings>;
  pickFolder(current?: string): Promise<string | null>;
  pickToolFile(): Promise<string | null>;
  getTools(): Promise<ToolStatus[]>;
  installTools(): Promise<ToolStatus[]>;
  updateYtDlp(): Promise<ToolStatus[]>;
  updateFfmpeg(): Promise<ToolStatus[]>;
  previewJoin(request: JoinRequest): Promise<PreviewResult | null>;
  stopPreview(): Promise<void>;
  getWaveform(path: string): Promise<Waveform>;
  loadProject(path: string): Promise<ClipProject | null>;
  saveProject(path: string, project: ClipProject): Promise<void>;
  forgetProject(path: string): Promise<void>;
  onPreview(listener: (percent: number) => void): () => void;
  checkUpdate(): Promise<UpdateInfo | null>;
  openDownloadPage(): Promise<void>;
  fetchUrlInfo(url: string): Promise<UrlInfo>;
  /** Gir id-en til jobben i køen. */
  startDownload(request: DownloadRequest): Promise<string>;
  pickMedia(): Promise<string | null>;
  pickMediaMany(): Promise<string[]>;
  probeMedia(path: string): Promise<MediaInfo>;
  startJoin(request: JoinRequest): Promise<void>;
  openMedia(path: string): Promise<OpenedMedia>;
  pathForFile(file: File): string;
  /** Gir id-ene til jobbene, i samme rekkefølge som klippene. */
  startCuts(batch: CutBatch): Promise<string[]>;
  getJobs(): Promise<Job[]>;
  pauseJob(id: string): Promise<void>;
  resumeJob(id: string): Promise<void>;
  cancelJob(id: string): Promise<void>;
  retryJob(id: string): Promise<void>;
  removeJob(id: string): Promise<void>;
  showInFolder(path: string): Promise<void>;
  onJobs(listener: (jobs: Job[]) => void): () => void;
  onInstall(listener: (state: InstallState) => void): () => void;
}
