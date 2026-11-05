import type { Waveform } from './types';

/**
 * Finner det stilleste punktet innenfor ±window sekunder. Ved like nivåer vinner punktet nærmest t.
 * Brukes av «fest til stillhet», så kutt ikke havner midt i et ord.
 */
export function snapToQuiet(wave: Waveform, t: number, window = 0.5): number {
  const { peaks, peaksPerSecond: pps } = wave;
  if (peaks.length === 0) return t;
  const center = Math.round(t * pps);
  const from = Math.max(0, center - Math.round(window * pps));
  const to = Math.min(peaks.length - 1, center + Math.round(window * pps));
  let best = -1;
  for (let i = from; i <= to; i++) {
    if (best < 0 || peaks[i] < peaks[best] || (peaks[i] === peaks[best] && Math.abs(i - center) < Math.abs(best - center))) best = i;
  }
  return best < 0 ? t : best / pps;
}
