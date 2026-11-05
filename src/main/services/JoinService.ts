import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { msg, translate, type Language } from '../../shared/i18n';
import { joinCompatible } from '../../shared/join';
import { NO_EFFECTS, type AudioTarget, type Job, type JobProgress, type JoinEffects, type JoinRequest, type MediaInfo } from '../../shared/types';
import { TARGET_ENCODERS, audioExtension, parseOutTime } from './ExportService';
import type { JobHandle, JobRunner } from './JobQueue';
import { probeMedia } from './MediaProbeService';
import { runProcess, type RunningProcess } from './ProcessManager';

export const MAX_JOIN = 50;
export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const COVER_EXT = ['.mp3', '.m4a', '.flac'];
/** Stillhet under −50 dB i minst 0,2 s regnes som stille. 0,1 s beholdes så starten ikke blir brå. */
const SILENCE_DB = -50;
const SILENCE_MIN = 0.2;
const SILENCE_KEEP = 0.1;

export interface JoinPlan {
  ext: string;
  /** copy: filene legges etter hverandre uten omkoding. encode: alt dekodes og kodes på nytt. */
  method: 'copy' | 'encode';
  encode?: string[];
  sampleRate?: number;
  channels?: number;
}

export interface Span { start: number; end: number }

function firstAudio(info: MediaInfo) {
  const a = info.streams.find((s) => s.type === 'audio');
  if (!a) throw new Error(msg('err.joinNoAudio', { name: info.fileName }));
  return a;
}

/** Alle effekter krever omkoding. Tittel, artist og omslag gjør det ikke. */
export function hasEffects(e: JoinEffects = NO_EFFECTS): boolean {
  return e.speeds.some((s) => s !== 1) || e.trimSilence || e.normalize || e.fadeIn > 0 || e.fadeOut > 0 || e.crossfade > 0;
}

/** count: antall filer. Hastighetslisten får nøyaktig én gyldig verdi per fil. */
export function sanitizeEffects(raw: Partial<JoinEffects> | undefined, count = 0): JoinEffects {
  const e = { ...NO_EFFECTS, ...(raw ?? {}) };
  const sec = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : 0);
  const text = (v: unknown) => (typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').trim().slice(0, 200) : '');
  return {
    speeds: Array.from({ length: count }, (_, i) => (Array.isArray(e.speeds) && SPEEDS.includes(e.speeds[i]) ? e.speeds[i] : 1)),
    trimSilence: e.trimSilence === true, normalize: e.normalize === true,
    fadeIn: sec(e.fadeIn, 30), fadeOut: sec(e.fadeOut, 30), crossfade: sec(e.crossfade, 10),
    title: text(e.title), artist: text(e.artist), cover: e.cover !== false,
  };
}

export function joinPlan(infos: MediaInfo[], target: AudioTarget, effects: JoinEffects = NO_EFFECTS): JoinPlan {
  if (infos.length < 2) throw new Error(msg('err.joinCount', { max: MAX_JOIN }));
  const audio = infos.map(firstAudio);
  const same = joinCompatible(infos);
  const codec = audio[0].codec;
  const rate = audio[0].sampleRate ?? 48000;
  const channels = Math.min(2, Math.max(...audio.map((a) => a.channels ?? 2)));
  const bits = Math.max(...audio.map((a) => a.bits ?? 16));
  const effectsOn = hasEffects(effects);
  if (target === 'original') {
    if (effectsOn) throw new Error(msg('err.joinEffectsOriginal'));
    if (!same) throw new Error(msg('err.joinMismatch'));
    // FLAC-rammer husker posisjonen sin, så FLAC kodes alltid på nytt. Det er fortsatt tapsfritt.
    if (codec === 'flac') return { ext: '.flac', method: 'encode', encode: ['-c:a', 'flac'], sampleRate: rate, channels };
    return { ext: audioExtension(codec), method: 'copy' };
  }
  const t = TARGET_ENCODERS[target];
  if (same && !effectsOn && t.same.includes(codec)) return { ext: t.ext, method: 'copy' };
  return { ext: t.ext, method: 'encode', encode: t.encode(bits), sampleRate: target === 'opus' ? 48000 : rate, channels };
}

/** Leser silencedetect-utskriften og finner hva som skal beholdes av filen. */
export function parseSilence(stderr: string, duration: number): Span {
  const starts = [...stderr.matchAll(/silence_start:\s*(-?[\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...stderr.matchAll(/silence_end:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  // Helt stille fil: behold alt, ellers ville ingenting bli igjen.
  if (starts.length > 0 && starts[0] <= 0.05 && (ends[0] ?? duration) >= duration - 0.05) return { start: 0, end: duration };
  let start = 0;
  let end = duration;
  if (starts.length > 0 && starts[0] <= 0.05 && ends.length > 0) start = Math.max(0, ends[0] - SILENCE_KEEP);
  // Stillhet som varer til slutten får ingen silence_end, eller en som ligger helt i slutten.
  const last = starts.at(-1);
  if (last !== undefined && last > 0.05 && (ends.length < starts.length || (ends.at(-1) ?? 0) >= duration - 0.05)) {
    end = Math.min(duration, last + SILENCE_KEEP);
  }
  // Helt stille fil, eller noe rart: behold alt.
  return end - start > 0.05 ? { start, end } : { start: 0, end: duration };
}

export function silenceArgs(path: string): string[] {
  return ['-hide_banner', '-nostats', '-nostdin', '-i', path, '-map', '0:a:0', '-af', `silencedetect=noise=${SILENCE_DB}dB:d=${SILENCE_MIN}`, '-f', 'null', '-'];
}

/** Lengden på resultatet, brukt til fade ut og fremdrift. */
export function speedOf(effects: JoinEffects, i: number): number {
  return effects.speeds[i] ?? 1;
}

/** Hver fil får sin hastighet før skjøting, så lengden er summen av (lengde / hastighet) minus krysstoningene. */
export function playedLengths(spans: Span[], effects: JoinEffects): number[] {
  return spans.map((x, i) => (x.end - x.start) / speedOf(effects, i));
}

export function outputLength(spans: Span[], effects: JoinEffects): number {
  const sum = playedLengths(spans, effects).reduce((s, x) => s + x, 0);
  return Math.max(0, sum - effects.crossfade * (spans.length - 1));
}

const r3 = (n: number) => (Math.round(n * 1000) / 1000).toString();

/** Filtergraf: klargjør hver fil, skjøt (eller krysstone), og legg på effektene. */
export function buildJoinGraph(count: number, plan: JoinPlan, effects: JoinEffects, spans: Span[] | null, durations: number[]): string {
  const layout = plan.channels === 1 ? 'mono' : 'stereo';
  const prep = Array.from({ length: count }, (_, i) => {
    const trim = spans ? `atrim=start=${r3(spans[i].start)}:end=${r3(spans[i].end)},asetpts=PTS-STARTPTS,` : '';
    const speed = speedOf(effects, i) !== 1 ? `atempo=${speedOf(effects, i)},` : '';
    return `[${i}:a:0]${trim}${speed}aresample=${plan.sampleRate},aformat=sample_rates=${plan.sampleRate}:channel_layouts=${layout}[a${i}]`;
  });
  const parts = [...prep];
  let last: string;
  if (effects.crossfade > 0) {
    last = 'a0';
    for (let i = 1; i < count; i++) {
      parts.push(`[${last}][a${i}]acrossfade=d=${r3(effects.crossfade)}:c1=tri:c2=tri[x${i}]`);
      last = `x${i}`;
    }
  } else {
    parts.push(`${Array.from({ length: count }, (_, i) => `[a${i}]`).join('')}concat=n=${count}:v=0:a=1[j]`);
    last = 'j';
  }
  const post: string[] = [];
  // loudnorm leverer 192 kHz, så den samples ned igjen etterpå.
  if (effects.normalize) post.push('loudnorm=I=-16:TP=-1.5:LRA=11', `aresample=${plan.sampleRate}`);
  const length = outputLength(spans ?? durations.map((d) => ({ start: 0, end: d })), effects);
  const fadeIn = Math.min(effects.fadeIn, length / 2);
  const fadeOut = Math.min(effects.fadeOut, length / 2);
  if (fadeIn > 0) post.push(`afade=t=in:st=0:d=${r3(fadeIn)}`);
  if (fadeOut > 0) post.push(`afade=t=out:st=${r3(Math.max(0, length - fadeOut))}:d=${r3(fadeOut)}`);
  parts.push(`[${last}]${post.length ? post.join(',') : 'anull'}[out]`);
  return parts.join(';');
}

/** Linjer til FFmpegs concat-liste. Enkle anførselstegn i filnavn må skrives som '\''. */
export function concatList(paths: string[]): string {
  return paths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n') + '\n';
}

export interface CoverSource { path: string; index: number }

export function buildJoinArgs(
  inputs: string[], listFile: string, plan: JoinPlan, output: string,
  effects: JoinEffects = NO_EFFECTS, spans: Span[] | null = null, durations: number[] = [], cover: CoverSource | null = null,
): string[] {
  const head = ['-hide_banner', '-loglevel', 'error', '-nostats', '-nostdin', '-progress', 'pipe:1', '-n'];
  const tags = ['-map_metadata', '-1',
    ...(effects.title ? ['-metadata', `title=${effects.title}`] : []),
    ...(effects.artist ? ['-metadata', `artist=${effects.artist}`] : [])];
  if (plan.method === 'copy') {
    return [
      ...head, '-f', 'concat', '-safe', '0', '-i', listFile, ...(cover ? ['-i', cover.path] : []),
      '-map', '0:a:0', ...(cover ? ['-map', `1:${cover.index}`] : []), '-c', 'copy',
      ...(cover ? ['-disposition:v:0', 'attached_pic'] : []), ...tags, output,
    ];
  }
  const coverInput = inputs.length;
  return [
    ...head, ...inputs.flatMap((p) => ['-i', p]), ...(cover ? ['-i', cover.path] : []),
    '-filter_complex', buildJoinGraph(inputs.length, plan, effects, spans, durations),
    '-map', '[out]', ...(cover ? ['-map', `${coverInput}:${cover.index}`, '-c:v', 'copy', '-disposition:v:0', 'attached_pic'] : []),
    ...(plan.encode ?? []), ...tags, output,
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

export interface RenderControl { stopped: boolean; current?: RunningProcess }

/**
 * Lager den skjøtede filen. Brukes både av eksport og forhåndsvisning, så det du hører er det du får.
 * output velges av kalleren ut fra filtypen i planen.
 */
export async function renderJoin(
  deps: JoinDeps, req: JoinRequest, chooseOutput: (ext: string) => Promise<string>,
  onProgress: (percent: number) => void, control: RenderControl,
): Promise<{ output: string; plan: JoinPlan; length: number }> {
  const effects = sanitizeEffects(req.effects, req.inputs.length);
  const infos = await Promise.all(req.inputs.map((p) => probeMedia(deps.ffprobe(), p)));
  const plan = joinPlan(infos, req.format, effects);
  const durations = infos.map((i) => i.durationSeconds);
  let spans: Span[] | null = null;
  if (effects.trimSilence) {
    spans = [];
    for (const [i, path] of req.inputs.entries()) {
      if (control.stopped) throw new Error(msg('err.stopped'));
      // Bare silence-linjene tas vare på, siden resten av utskriften kan bli lang.
      const lines: string[] = [];
      const p = runProcess(deps.ffmpeg(), silenceArgs(path), { onStderrLine: (l) => { if (l.includes('silence_')) lines.push(l); } });
      control.current = p;
      const r = await p.result;
      if (r.code !== 0 && !r.stopped) throw new Error(msg('err.join', { detail: r.stderr.trim().split(/\r?\n/).at(-1) ?? '?' }));
      spans.push(parseSilence(lines.join('\n'), durations[i]));
      onProgress((5 * (i + 1)) / req.inputs.length);
    }
  }
  const length = outputLength(spans ?? durations.map((d) => ({ start: 0, end: d })), effects);
  if (effects.crossfade > 0) {
    const shortest = Math.min(...playedLengths(spans ?? durations.map((d) => ({ start: 0, end: d })), effects));
    if (effects.crossfade >= shortest) throw new Error(msg('err.crossfadeTooLong', { s: Math.floor(shortest * 10) / 10 }));
  }
  const coverStream = effects.cover && COVER_EXT.includes(plan.ext)
    ? infos.map((info) => ({ path: info.path, s: info.streams.find((x) => x.attachedPic) })).find((c) => c.s)
    : undefined;
  const cover = coverStream?.s ? { path: coverStream.path, index: coverStream.s.index } : null;
  const output = await chooseOutput(plan.ext);
  await mkdir(dirname(output), { recursive: true });
  const listFile = join(dirname(output), `.snutt-${process.pid}-${Date.now()}.txt`);
  if (plan.method === 'copy') await writeFile(listFile, concatList(req.inputs), 'utf8');
  try {
    if (control.stopped) throw new Error(msg('err.stopped'));
    const proc = runProcess(deps.ffmpeg(), buildJoinArgs(req.inputs, listFile, plan, output, effects, spans, durations, cover), {
      onStdoutLine: (line) => {
        const t = parseOutTime(line);
        if (t !== null && length > 0) onProgress(5 + Math.min(95, (t / length) * 95));
      },
    });
    control.current = proc;
    const r = await proc.result;
    if (r.stopped || control.stopped) { await rm(output, { force: true }); throw new Error(msg('err.stopped')); }
    if (r.code !== 0) throw new Error(msg('err.join', { detail: r.stderr.trim().split(/\r?\n/).at(-1) ?? '?' }));
  } finally {
    await rm(listFile, { force: true });
  }
  return { output, plan, length };
}

export class JoinRunner implements JobRunner<JoinRequest> {
  constructor(private readonly deps: JoinDeps) {}

  start(req: JoinRequest, _job: Readonly<Job>, onProgress: (p: JobProgress) => void): JobHandle {
    const control: RenderControl = { stopped: false };
    const done = (async () => {
      const { output, plan } = await renderJoin(this.deps, req,
        async (ext) => joinOutputPath(req.inputs[0], this.deps.exportDir(), ext, translate(this.deps.language?.() ?? 'en', 'file.joined')),
        (percent) => onProgress({ percent, speedBps: null, etaSeconds: null, totalBytes: null }), control);
      return { outputPath: output, note: plan.method === 'copy' ? msg('note.joinCopy') : msg('note.joinEncode') };
    })();
    return { done, stop: () => { control.stopped = true; control.current?.stop(); } };
  }
}
