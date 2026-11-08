import { msg } from '../../shared/i18n';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { DownloadRequest, Job, JobProgress, UrlInfo } from '../../shared/types';
import type { JobHandle, JobRunner } from './JobQueue';
import { runProcess } from './ProcessManager';

const PROGRESS = 'SNUTTPROG';
const FILE = 'SNUTTFILE';
const TITLE = 'SNUTTTITLE';

export function assertHttpUrl(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error(msg('err.badUrl')); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(msg('err.httpOnly'));
  return url.href;
}

export interface ToolPaths { ffmpeg: string; deno: string | null; }

function commonArgs(tools: ToolPaths): string[] {
  const args = ['--ignore-config', '--no-playlist', '--encoding', 'utf-8', '--ffmpeg-location', dirname(tools.ffmpeg)];
  if (tools.deno) args.push('--js-runtimes', `deno:${tools.deno}`);
  return args;
}

export function buildInfoArgs(url: string, tools: ToolPaths): string[] {
  return [...commonArgs(tools), '--no-warnings', '-J', '--', url];
}

export function buildDownloadArgs(req: DownloadRequest, tools: ToolPaths, tempDir: string, embedThumbnail: boolean): string[] {
  const args = [
    ...commonArgs(tools), '--newline', '--progress', '--no-mtime',
    '--progress-template', `download:${PROGRESS} %(progress)j`,
    '--print', `before_dl:${TITLE} %(title)s`,
    '--print', `after_move:${FILE} %(filepath)s`,
    '-P', `home:${req.destination}`, '-P', `temp:${tempDir}`,
    '-o', '%(title).150B [%(id)s].%(ext)s', '--embed-metadata',
  ];
  if (req.mode === 'audio') {
    args.push('-f', 'ba/b', '-x', '--audio-format', req.audioFormat, '--audio-quality', '0');
    if (embedThumbnail && !['wav', 'aac'].includes(req.audioFormat)) args.push('--embed-thumbnail');
  } else {
    args.push('-f', 'bv*+ba/b', '--merge-output-format', req.container, '--remux-video', req.container);
    if (req.quality !== 'best') args.push('-S', `res:${req.quality}`);
    if (embedThumbnail) args.push('--embed-thumbnail');
  }
  args.push('--', req.url);
  return args;
}

export function parseProgressLine(line: string): JobProgress | null {
  if (!line.startsWith(`${PROGRESS} `)) return null;
  try {
    const p = JSON.parse(line.slice(PROGRESS.length + 1));
    const total = p.total_bytes ?? p.total_bytes_estimate ?? null;
    return {
      percent: total && p.downloaded_bytes != null ? Math.min(100, (p.downloaded_bytes / total) * 100) : (p.status === 'finished' ? 100 : null),
      speedBps: p.speed ?? null,
      etaSeconds: p.eta ?? null,
      totalBytes: total,
    };
  } catch { return null; }
}

export function parseInfoJson(json: string): UrlInfo {
  const d = JSON.parse(json);
  if (d._type === 'playlist') throw new Error(msg('err.playlist'));
  const heights = [...new Set<number>((d.formats ?? [])
    .filter((f: any) => f.vcodec && f.vcodec !== 'none' && typeof f.height === 'number')
    .map((f: any) => f.height as number))].sort((a, b) => b - a);
  return {
    title: d.title ?? '?', uploader: d.uploader ?? null,
    durationSeconds: typeof d.duration === 'number' ? d.duration : null,
    thumbnail: typeof d.thumbnail === 'string' && d.thumbnail.startsWith('https://') ? d.thumbnail : null,
    heights,
  };
}

/** Plukker yt-dlps egen feilmelding ut av stderr. */
export function extractError(stderr: string): string {
  const lines = stderr.split(/\r?\n/).filter((l) => l.startsWith('ERROR:'));
  const message = lines.at(-1)?.replace(/^ERROR:\s*/, '') ?? stderr.trim().split(/\r?\n/).at(-1);
  return message || msg('err.ytdlpSilent');
}

export interface DownloaderDeps {
  ytDlp(): string;
  tools(): ToolPaths;
  tempRoot: string;
  embedThumbnail(): boolean;
}

export async function fetchUrlInfo(deps: DownloaderDeps, url: string): Promise<UrlInfo> {
  const safe = assertHttpUrl(url);
  const r = await runProcess(deps.ytDlp(), buildInfoArgs(safe, deps.tools()), { keepOutput: true, timeoutMs: 90_000 }).result;
  if (r.stopped) throw new Error(msg('err.timeout'));
  if (r.code !== 0) throw new Error(extractError(r.stderr));
  return parseInfoJson(r.stdout);
}

export class DownloadRunner implements JobRunner<DownloadRequest> {
  constructor(private readonly deps: DownloaderDeps) {}

  private tempDir(job: Readonly<Job>): string { return join(this.deps.tempRoot, job.id); }

  start(req: DownloadRequest, job: Readonly<Job>, onProgress: (p: JobProgress) => void, onTitle?: (title: string) => void): JobHandle {
    const tempDir = this.tempDir(job);
    const args = buildDownloadArgs(req, this.deps.tools(), tempDir, this.deps.embedThumbnail());
    let outputPath: string | undefined;
    const proc = runProcess(this.deps.ytDlp(), args, {
      onStdoutLine: (line) => {
        const p = parseProgressLine(line);
        if (p) onProgress(p);
        else if (line.startsWith(`${FILE} `)) outputPath = line.slice(FILE.length + 1).trim();
        else if (line.startsWith(`${TITLE} `)) onTitle?.(line.slice(TITLE.length + 1).trim());
      },
    });
    const done = (async () => {
      await mkdir(req.destination, { recursive: true });
      const r = await proc.result;
      if (r.stopped) throw new Error(msg('err.stopped'));
      if (r.code !== 0) throw new Error(extractError(r.stderr));
      await rm(tempDir, { recursive: true, force: true });
      if (!outputPath) throw new Error(msg('err.noFile'));
      return { outputPath };
    })();
    return { done, stop: proc.stop };
  }

  async cleanup(job: Readonly<Job>): Promise<void> {
    // Sletter bare jobbens egen midlertidige mappe, aldri noe i målmappen.
    await rm(this.tempDir(job), { recursive: true, force: true }).catch(() => {});
  }
}
