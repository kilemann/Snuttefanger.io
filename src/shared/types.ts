import type { Language } from './i18n';

export type JobKind = 'download' | 'export';
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
}

export interface CutBatch {
  input: string;
  clips: { startSeconds: number; endSeconds: number; mode: CutMode; audioFormat: AudioTarget }[];
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
}

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
  fetchUrlInfo(url: string): Promise<UrlInfo>;
  startDownload(request: DownloadRequest): Promise<void>;
  pickMedia(): Promise<string | null>;
  openMedia(path: string): Promise<OpenedMedia>;
  pathForFile(file: File): string;
  startCuts(batch: CutBatch): Promise<void>;
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
