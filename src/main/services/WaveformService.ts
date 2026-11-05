import { stat } from 'node:fs/promises';
import type { Waveform } from '../../shared/types';
import { runProcess } from './ProcessManager';

/** 100 topper per sekund gir 10 ms oppløsning. En time lyd blir 360 000 byte. */
export const PEAKS_PER_SECOND = 100;
const SAMPLE_RATE = 8000;
const SAMPLES_PER_PEAK = SAMPLE_RATE / PEAKS_PER_SECOND;

export function waveformArgs(path: string): string[] {
  // Lav samplingsfrekvens og mono er nok til å se lydnivået, og gjør dekodingen rask.
  return ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', path, '-map', '0:a:0', '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 's16le', '-'];
}

/** Samler 16-bits sampler til topper (0–255). Halve sampler mellom bitene tas vare på. */
export class PeakCollector {
  private peaks: number[] = [];
  private current = 0;
  private count = 0;
  private carry: Buffer | null = null;

  push(chunk: Buffer): void {
    let buf = this.carry ? Buffer.concat([this.carry, chunk]) : chunk;
    const even = buf.length - (buf.length % 2);
    this.carry = even < buf.length ? buf.subarray(even) : null;
    for (let i = 0; i < even; i += 2) {
      const v = Math.abs(buf.readInt16LE(i));
      if (v > this.current) this.current = v;
      if (++this.count === SAMPLES_PER_PEAK) this.flush();
    }
    buf = Buffer.alloc(0);
  }

  private flush(): void {
    // Kvadratrot gjør svak lyd synlig uten at sterk lyd fyller hele høyden.
    this.peaks.push(Math.round(255 * Math.sqrt(Math.min(1, this.current / 32768))));
    this.current = 0;
    this.count = 0;
  }

  finish(): Uint8Array {
    if (this.count > 0) this.flush();
    return Uint8Array.from(this.peaks);
  }
}

const cache = new Map<string, Waveform>();

export async function getWaveform(ffmpeg: string, path: string): Promise<Waveform> {
  const { size, mtimeMs } = await stat(path);
  const key = `${path}|${size}|${mtimeMs}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const collector = new PeakCollector();
  const r = await runProcess(ffmpeg, waveformArgs(path), { onStdoutData: (c) => collector.push(c), timeoutMs: 10 * 60_000 }).result;
  if (r.code !== 0) throw new Error(r.stderr.trim().split(/\r?\n/).at(-1) || 'ffmpeg');
  const peaks = collector.finish();
  let maxPeak = 0;
  for (const p of peaks) if (p > maxPeak) maxPeak = p;
  const wave: Waveform = { peaksPerSecond: PEAKS_PER_SECOND, peaks, maxPeak };
  cache.set(key, wave);
  while (cache.size > 6) cache.delete(cache.keys().next().value!);
  return wave;
}

