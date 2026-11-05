import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { msg, translate, type Language } from '../../shared/i18n';
import { joinCompatible } from '../../shared/join';
import type { AudioTarget, Job, JobProgress, JoinRequest, MediaInfo } from '../../shared/types';
import { TARGET_ENCODERS, audioExtension, parseOutTime } from './ExportService';
import type { JobHandle, JobRunner } from './JobQueue';
import { probeMedia } from './MediaProbeService';
import { runProcess } from './ProcessManager';

export const MAX_JOIN = 50;

export interface JoinPlan {
  ext: string;
  /** copy: filene legges etter hverandre uten omkoding. encode: alt dekodes og kodes på nytt. */
  method: 'copy' | 'encode';
  encode?: string[];
  sampleRate?: number;
  channels?: number;
}

function firstAudio(info: MediaInfo) {
  const a = info.streams.find((s) => s.type === 'audio');
  if (!a) throw new Error(msg('err.joinNoAudio', { name: info.fileName }));
  return a;
}

export function joinPlan(infos: MediaInfo[], target: AudioTarget): JoinPlan {
  if (infos.length < 2) throw new Error(msg('err.joinCount', { max: MAX_JOIN }));
  const audio = infos.map(firstAudio);
  const same = joinCompatible(infos);
  const codec = audio[0].codec;
  const rate = audio[0].sampleRate ?? 48000;
  const channels = Math.min(2, Math.max(...audio.map((a) => a.channels ?? 2)));
  const bits = Math.max(...audio.map((a) => a.bits ?? 16));
  if (target === 'original') {
    if (!same) throw new Error(msg('err.joinMismatch'));
    // FLAC-rammer husker posisjonen sin, så FLAC kodes alltid på nytt. Det er fortsatt tapsfritt.
    if (codec === 'flac') return { ext: '.flac', method: 'encode', encode: ['-c:a', 'flac'], sampleRate: rate, channels };
    return { ext: audioExtension(codec), method: 'copy' };
  }
  const t = TARGET_ENCODERS[target];
  if (same && t.same.includes(codec)) return { ext: t.ext, method: 'copy' };
  return { ext: t.ext, method: 'encode', encode: t.encode(bits), sampleRate: target === 'opus' ? 48000 : rate, channels };
}

/** Linjer til FFmpegs concat-liste. Enkle anførselstegn i filnavn må skrives som '\''. */
export function concatList(paths: string[]): string {
  return paths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n') + '\n';
}

export function buildJoinArgs(inputs: string[], listFile: string, plan: JoinPlan, output: string): string[] {
  const head = ['-hide_banner', '-loglevel', 'error', '-nostats', '-progress', 'pipe:1', '-n'];
  if (plan.method === 'copy') {
    return [...head, '-f', 'concat', '-safe', '0', '-i', listFile, '-map', '0:a:0', '-c', 'copy', '-map_metadata', '-1', output];
  }
  const layout = plan.channels === 1 ? 'mono' : 'stereo';
  const prep = inputs.map((_, i) => `[${i}:a:0]aresample=${plan.sampleRate},aformat=sample_rates=${plan.sampleRate}:channel_layouts=${layout}[a${i}]`);
  const graph = `${prep.join(';')};${inputs.map((_, i) => `[a${i}]`).join('')}concat=n=${inputs.length}:v=0:a=1[out]`;
  return [
    ...head, ...inputs.flatMap((p) => ['-i', p]),
    '-filter_complex', graph, '-map', '[out]', ...(plan.encode ?? []), '-map_metadata', '-1', output,
  ];
}

export function joinOutputPath(first: string, exportDir: string, ext: string, word: string): string {
  const dir = exportDir || dirname(first);
  const base = `${basename(first, extname(first))} (${word})`;
  let candidate = join(dir, base + ext);
  for (let n = 2; existsSync(candidate); n++) candidate = join(dir, `${base} ${n}${ext}`);
  return candidate;
}

export interface JoinDeps { ffmpeg(): string; ffprobe(): string; exportDir(): string; language?(): Language; }

export class JoinRunner implements JobRunner<JoinRequest> {
  constructor(private readonly deps: JoinDeps) {}

  start(req: JoinRequest, _job: Readonly<Job>, onProgress: (p: JobProgress) => void): JobHandle {
    let stopRequested = false;
    let stopCurrent = () => {};
    const done = (async () => {
      const infos = await Promise.all(req.inputs.map((p) => probeMedia(this.deps.ffprobe(), p)));
      if (stopRequested) throw new Error(msg('err.stopped'));
      const plan = joinPlan(infos, req.format);
      const total = infos.reduce((sum, i) => sum + i.durationSeconds, 0);
      const output = joinOutputPath(req.inputs[0], this.deps.exportDir(), plan.ext, translate(this.deps.language?.() ?? 'en', 'file.joined'));
      await mkdir(dirname(output), { recursive: true });
      const listFile = join(dirname(output), `.snutt-${process.pid}-${Date.now()}.txt`);
      if (plan.method === 'copy') await writeFile(listFile, concatList(req.inputs), 'utf8');
      try {
        const proc = runProcess(this.deps.ffmpeg(), buildJoinArgs(req.inputs, listFile, plan, output), {
          onStdoutLine: (line) => {
            const t = parseOutTime(line);
            if (t !== null) onProgress({ percent: Math.min(100, (t / total) * 100), speedBps: null, etaSeconds: null, totalBytes: null });
          },
        });
        stopCurrent = proc.stop;
        const r = await proc.result;
        if (r.stopped) { await rm(output, { force: true }); throw new Error(msg('err.stopped')); }
        if (r.code !== 0) throw new Error(msg('err.join', { detail: r.stderr.trim().split(/\r?\n/).at(-1) ?? '?' }));
      } finally {
        await rm(listFile, { force: true });
      }
      return { outputPath: output, note: plan.method === 'copy' ? msg('note.joinCopy') : msg('note.joinEncode') };
    })();
    return { done, stop: () => { stopRequested = true; stopCurrent(); } };
  }
}
