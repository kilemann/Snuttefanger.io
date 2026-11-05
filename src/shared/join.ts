import type { MediaInfo } from './types';

/** Tapsfri skjøting krever rene lydfiler (omslag er greit) med samme kodek, samplingsfrekvens og antall kanaler. */
export function joinCompatible(infos: MediaInfo[]): boolean {
  const audio = infos.map((i) => i.streams.find((s) => s.type === 'audio'));
  if (audio.some((a) => !a)) return false;
  const pure = infos.every((i) => i.streams.filter((s) => s.type === 'audio').length === 1
    && i.streams.every((s) => (s.type === 'audio' ? s.index === 0 : s.attachedPic)));
  const a = audio[0]!;
  return pure && audio.every((b) => b!.codec === a.codec && b!.sampleRate === a.sampleRate && b!.channels === a.channels);
}
