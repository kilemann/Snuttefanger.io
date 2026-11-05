import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import type { CutRequest, Job, JobProgress, MediaInfo } from '../../shared/types';
import type { JobHandle, JobRunner } from './JobQueue';
import { probeMedia } from './MediaProbeService';
import { runProcess } from './ProcessManager';

export function validateCut(start: number, end: number, duration: number): void {
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error('Start og slutt må være gyldige tider.');
  if (start < 0 || end > duration + 0.5) throw new Error('Klippet må ligge innenfor filens lengde.');
  if (end - start < 0.01) throw new Error('Slutt må komme etter start.');
}

export const MAX_CLIPS = 10;

export interface CutOptions {
  /** Omslagsbildet må hentes fra en egen inngang. Ligger det i hovedinngangen, beholder FFmpeg tidsstemplene fra originalen. */
  cover?: { index: number; outputVideoIndex: number };
  /** FLAC-rammer husker posisjonen sin. Ny FLAC-koding er matematisk tapsfri og gir tid fra 0 og riktig lengde. */
  encodeFlac?: boolean;
}

export function cutOptions(info: MediaInfo): CutOptions {
  // I Matroska ville bildet blitt et eget videospor med ett bilde, så MKV-klipp får ikke med omslaget.
  const matroska = ['.mkv', '.mka', '.webm'].includes(extname(info.path).toLowerCase());
  const cover = matroska ? undefined : info.streams.find((s) => s.attachedPic);
  return {
    cover: cover && { index: cover.index, outputVideoIndex: info.streams.filter((s) => s.type === 'video').length },
    encodeFlac: info.streams.some((s) => s.codec === 'flac') && extname(info.path).toLowerCase() === '.flac',
  };
}

export function buildCutArgs(input: string, start: number, end: number, output: string, options: CutOptions = {}): string[] {
  const { cover, encodeFlac } = options;
  return [
    '-hide_banner', '-loglevel', 'error', '-nostats', '-progress', 'pipe:1', '-n',
    '-ss', start.toFixed(3), '-to', end.toFixed(3), '-i', input,
    ...(cover ? ['-t', '1', '-i', input] : []),
    '-map', '0:V?', '-map', '0:a?', '-map', '0:s?', '-map', '0:t?',
    ...(cover ? ['-map', `1:${cover.index}`] : []),
    '-ignore_unknown', '-c', 'copy',
    ...(encodeFlac ? ['-c:a', 'flac'] : []),
    ...(cover ? [`-disposition:v:${cover.outputVideoIndex}`, 'attached_pic'] : []),
    '-map_metadata', '0', '-avoid_negative_ts', 'make_zero',
    output,
  ];
}

function stamp(seconds: number): string {
  const s = Math.floor(seconds);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}.${pad(Math.floor(s / 60) % 60)}.${pad(s % 60)}`;
}

export function cutOutputPath(input: string, start: number, end: number, exportDir: string): string {
  const ext = extname(input);
  const dir = exportDir || dirname(input);
  const base = `${basename(input, ext)} (klipp ${stamp(start)}-${stamp(end)})`;
  let candidate = join(dir, base + ext);
  for (let n = 2; existsSync(candidate); n++) candidate = join(dir, `${base} ${n}${ext}`);
  return candidate;
}

export function parseOutTime(line: string): number | null {
  const m = line.match(/^out_time_us=(\d+)/);
  return m ? Number(m[1]) / 1e6 : null;
}

export interface ExportDeps { ffmpeg(): string; ffprobe(): string; exportDir(): string; }

export class CutRunner implements JobRunner<CutRequest> {
  constructor(private readonly deps: ExportDeps) {}

  start(req: CutRequest, _job: Readonly<Job>, onProgress: (p: JobProgress) => void): JobHandle {
    const output = cutOutputPath(req.input, req.startSeconds, req.endSeconds, this.deps.exportDir());
    const wanted = req.endSeconds - req.startSeconds;
    let stopRequested = false;
    let stopCurrent = () => {};
    const done = (async () => {
      const source = await probeMedia(this.deps.ffprobe(), req.input);
      if (stopRequested) throw new Error('Stoppet');
      const proc = runProcess(this.deps.ffmpeg(), buildCutArgs(req.input, req.startSeconds, req.endSeconds, output, cutOptions(source)), {
        onStdoutLine: (line) => {
          const t = parseOutTime(line);
          if (t !== null) onProgress({ percent: Math.min(100, (t / wanted) * 100), speedBps: null, etaSeconds: null, totalBytes: null });
        },
      });
      stopCurrent = proc.stop;
      const r = await proc.result;
      if (r.stopped) {
        await rm(output, { force: true });
        throw new Error('Stoppet');
      }
      if (r.code !== 0) throw new Error(`FFmpeg klarte ikke å klippe filen: ${r.stderr.trim().split(/\r?\n/).at(-1) ?? 'ukjent feil'}`);
      const info = await probeMedia(this.deps.ffprobe(), output);
      const extra = info.durationSeconds - wanted;
      const note = extra > 0.1
        ? `Klippet ble ${extra.toFixed(1).replace('.', ',')} s lengre enn valgt, fordi tapsfri klipping må starte på en keyframe.`
        : undefined;
      return { outputPath: output, note };
    })();
    return { done, stop: () => { stopRequested = true; stopCurrent(); } };
  }
}
