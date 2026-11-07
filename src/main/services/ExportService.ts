import { msg, translate, type Language } from '../../shared/i18n';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import type { AudioTarget, CutMode, CutRequest, Job, JobProgress, MediaInfo } from '../../shared/types';
import type { JobHandle, JobRunner } from './JobQueue';
import { probeMedia } from './MediaProbeService';
import { runProcess } from './ProcessManager';

export function validateCut(start: number, end: number, duration: number): void {
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error(msg('err.badTimes'));
  if (start < 0 || end > duration + 0.5) throw new Error(msg('err.outside'));
  if (end - start < 0.01) throw new Error(msg('err.order'));
}

/** Container that can hold the audio codec as it is, so audio-only export never re-encodes. */
const AUDIO_EXT: Record<string, string> = {
  aac: '.m4a', alac: '.m4a', mp3: '.mp3', opus: '.opus', vorbis: '.ogg', flac: '.flac', ac3: '.ac3', eac3: '.eac3',
};
const COVER_EXT = ['.mp4', '.m4v', '.mov', '.m4a', '.mp3', '.flac'];

export function audioExtension(codec: string): string {
  if (codec.startsWith('pcm_')) return '.wav';
  return AUDIO_EXT[codec] ?? '.mka';
}

export const MAX_CLIPS = 10;

export interface CutOptions {
  /** The cover must come from a separate input. In the main input it makes FFmpeg keep the original timestamps. */
  cover?: { index: number; outputVideoIndex: number };
  /** FLAC frames remember their position. Re-encoding to FLAC is mathematically lossless and starts at 0 with the right length. */
  encodeFlac?: boolean;
  /** Only the first audio track. */
  audioOnly?: boolean;
  /** Codec arguments when the audio is re-encoded. Missing means the audio is copied. */
  encode?: string[];
}

interface Target { ext: string; same: string[]; encode(bits: number): string[] }
export const TARGET_ENCODERS: Record<Exclude<AudioTarget, 'original'>, Target> = {
  mp3: { ext: '.mp3', same: ['mp3'], encode: () => ['-c:a', 'libmp3lame', '-q:a', '0'] },
  m4a: { ext: '.m4a', same: ['aac'], encode: () => ['-c:a', 'aac', '-b:a', '256k'] },
  opus: { ext: '.opus', same: ['opus'], encode: () => ['-c:a', 'libopus', '-b:a', '192k'] },
  // FLAC og WAV er tapsfrie, så de kodes alltid på nytt. Det gir riktig lengde og tid fra 0.
  flac: { ext: '.flac', same: [], encode: () => ['-c:a', 'flac'] },
  wav: { ext: '.wav', same: [], encode: (bits) => ['-c:a', bits > 16 ? 'pcm_s24le' : 'pcm_s16le'] },
};

export function isAudioTarget(v: unknown): v is AudioTarget {
  return v === 'original' || (typeof v === 'string' && Object.hasOwn(TARGET_ENCODERS, v));
}

/** Filtype og eventuell omkoding for et lydklipp. */
export function audioPlan(info: MediaInfo, target: AudioTarget = 'original'): { ext: string; encode?: string[] } {
  const audio = info.streams.find((s) => s.type === 'audio');
  if (!audio) throw new Error(msg('err.noAudio'));
  if (target === 'original') {
    return { ext: audioExtension(audio.codec), encode: audio.codec === 'flac' ? ['-c:a', 'flac'] : undefined };
  }
  const t = TARGET_ENCODERS[target];
  return { ext: t.ext, encode: t.same.includes(audio.codec) ? undefined : t.encode(audio.bits ?? 16) };
}

export function outputExtension(info: MediaInfo, mode: CutMode, target: AudioTarget = 'original'): string {
  return mode === 'av' ? extname(info.path) : audioPlan(info, target).ext;
}

export function cutOptions(info: MediaInfo, mode: CutMode = 'av', target: AudioTarget = 'original'): CutOptions {
  const ext = outputExtension(info, mode, target).toLowerCase();
  const cover = COVER_EXT.includes(ext) ? info.streams.find((s) => s.attachedPic) : undefined;
  const outputVideoIndex = mode === 'audio' ? 0 : info.streams.filter((s) => s.type === 'video').length;
  return {
    cover: cover && { index: cover.index, outputVideoIndex },
    encodeFlac: mode === 'av' && ext === '.flac' && info.streams.some((s) => s.codec === 'flac'),
    audioOnly: mode === 'audio',
    ...(mode === 'audio' ? { encode: audioPlan(info, target).encode } : {}),
  };
}

export function buildCutArgs(input: string, start: number, end: number, output: string, options: CutOptions = {}): string[] {
  const { encodeFlac, audioOnly, encode } = options;
  // Ved omkoding er søk før -i nøyaktig, fordi FFmpeg dekoder og kutter på riktig sted.
  const seekBefore = !audioOnly || !!encode;
  // Bare lyd tar aldri med omslaget her: kutt etter -i ville kastet det. Det legges på i et eget steg (buildCoverArgs).
  const cover = audioOnly ? undefined : options.cover;
  const maps = audioOnly ? ['-map', '0:a:0'] : ['-map', '0:V?', '-map', '0:a?', '-map', '0:s?', '-map', '0:t?'];
  return [
    '-hide_banner', '-loglevel', 'error', '-nostats', '-progress', 'pipe:1', '-n',
    // Søk før -i hopper til nærmeste keyframe i videoen. Bare lyd har ingen keyframe å ta hensyn til,
    // så der kuttes det etter -i, nøyaktig på lydrammen. Det leser fra starten av filen, men dekoder ingenting.
    ...(seekBefore ? ['-ss', start.toFixed(3), '-to', end.toFixed(3)] : []), '-i', input,
    ...(cover ? ['-t', '1', '-i', input] : []),
    ...(seekBefore ? [] : ['-ss', start.toFixed(3), '-t', (end - start).toFixed(3)]),
    ...maps,
    ...(cover ? ['-map', `1:${cover.index}`] : []),
    '-ignore_unknown',
    ...(audioOnly && encode ? encode : ['-c', 'copy', ...(encodeFlac ? ['-c:a', 'flac'] : [])]),
    ...(cover ? [`-disposition:v:${cover.outputVideoIndex}`, 'attached_pic'] : []),
    '-map_metadata', '0', '-avoid_negative_ts', 'make_zero',
    output,
  ];
}

/** Steg 2 for bare lyd: kopierer det ferdige lydklippet og legger omslaget fra originalen på. */
export function buildCoverArgs(audio: string, source: string, coverIndex: number, output: string): string[] {
  return [
    '-hide_banner', '-loglevel', 'error', '-nostats', '-n', '-i', audio, '-i', source,
    '-map', '0:a', '-map', `1:${coverIndex}`, '-c', 'copy', '-disposition:v:0', 'attached_pic', '-map_metadata', '0', output,
  ];
}

function stamp(seconds: number): string {
  const s = Math.floor(seconds);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}.${pad(Math.floor(s / 60) % 60)}.${pad(s % 60)}`;
}

/** Gjør et klippnavn trygt som filnavn i Windows: ingen ulovlige tegn, ingen reserverte navn, maks 120 tegn. */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120).replace(/[. ]+$/, '');
  if (!cleaned) return '';
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(cleaned) ? `${cleaned}_` : cleaned;
}

export function cutOutputPath(input: string, start: number, end: number, exportDir: string, ext = extname(input), word = 'clip', name = ''): string {
  const dir = exportDir || dirname(input);
  const base = safeFileName(name) || `${basename(input, extname(input))} (${word} ${stamp(start)}-${stamp(end)})`;
  let candidate = join(dir, base + ext);
  for (let n = 2; existsSync(candidate); n++) candidate = join(dir, `${base} ${n}${ext}`);
  return candidate;
}

export function parseOutTime(line: string): number | null {
  const m = line.match(/^out_time_us=(\d+)/);
  return m ? Number(m[1]) / 1e6 : null;
}

export interface ExportDeps { ffmpeg(): string; ffprobe(): string; exportDir(): string; language?(): Language; }

export class CutRunner implements JobRunner<CutRequest> {
  constructor(private readonly deps: ExportDeps) {}

  start(req: CutRequest, _job: Readonly<Job>, onProgress: (p: JobProgress) => void): JobHandle {
    const mode = req.mode ?? 'av';
    let output = '';
    const wanted = req.endSeconds - req.startSeconds;
    let stopRequested = false;
    let stopCurrent = () => {};
    const done = (async () => {
      const source = await probeMedia(this.deps.ffprobe(), req.input);
      if (stopRequested) throw new Error(msg('err.stopped'));
      output = cutOutputPath(req.input, req.startSeconds, req.endSeconds, this.deps.exportDir(), outputExtension(source, mode, req.audioFormat), translate(this.deps.language?.() ?? 'en', mode === 'audio' ? 'file.audioClip' : 'file.clip'), req.name ?? '');
      await mkdir(dirname(output), { recursive: true });
      const options = cutOptions(source, mode, req.audioFormat);
      const coverAfter = mode === 'audio' ? options.cover : undefined;
      const ext = extname(output);
      const first = coverAfter ? join(dirname(output), `.snutt-${process.pid}-${Date.now()}${ext}`) : output;
      const cleanupFirst = () => (first !== output ? rm(first, { force: true }) : Promise.resolve());
      const proc = runProcess(this.deps.ffmpeg(), buildCutArgs(req.input, req.startSeconds, req.endSeconds, first, options), {
        onStdoutLine: (line) => {
          const t = parseOutTime(line);
          if (t !== null) onProgress({ percent: Math.min(100, (t / wanted) * 100), speedBps: null, etaSeconds: null, totalBytes: null });
        },
      });
      stopCurrent = proc.stop;
      const r = await proc.result;
      if (r.stopped) {
        await rm(first, { force: true });
        throw new Error(msg('err.stopped'));
      }
      if (r.code !== 0) {
        await cleanupFirst();
        throw new Error(msg('err.cut', { detail: r.stderr.trim().split(/\r?\n/).at(-1) ?? '?' }));
      }
      if (coverAfter) {
        const step = runProcess(this.deps.ffmpeg(), buildCoverArgs(first, req.input, coverAfter.index, output));
        stopCurrent = step.stop;
        const r2 = await step.result;
        await cleanupFirst();
        if (r2.stopped) { await rm(output, { force: true }); throw new Error(msg('err.stopped')); }
        if (r2.code !== 0) throw new Error(msg('err.cut', { detail: r2.stderr.trim().split(/\r?\n/).at(-1) ?? '?' }));
      }
      const info = await probeMedia(this.deps.ffprobe(), output);
      const extra = info.durationSeconds - wanted;
      const note = extra > 0.1 && mode === 'av'
        ? msg('note.keyframe', { s: Math.round(extra * 10) / 10 })
        : undefined;
      return { outputPath: output, note };
    })();
    return { done, stop: () => { stopRequested = true; stopCurrent(); } };
  }
}
