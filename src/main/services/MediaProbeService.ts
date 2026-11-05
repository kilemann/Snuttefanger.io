import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import type { MediaInfo, MediaStream } from '../../shared/types';
import { runProcess } from './ProcessManager';

function parseRate(rate: unknown): number | undefined {
  if (typeof rate !== 'string') return undefined;
  const [a, b] = rate.split('/').map(Number);
  return a && b ? a / b : undefined;
}

export function parseProbe(json: string, path: string, sizeBytes: number): MediaInfo {
  const data = JSON.parse(json);
  const streams: MediaStream[] = (data.streams ?? []).map((s: any): MediaStream => {
    const attached = s.disposition?.attached_pic === 1;
    const type = attached ? 'other' : (['video', 'audio', 'subtitle'].includes(s.codec_type) ? s.codec_type : 'other');
    return {
      index: s.index, type, attachedPic: attached, codec: s.codec_name ?? 'ukjent',
      width: s.width, height: s.height, frameRate: type === 'video' ? parseRate(s.avg_frame_rate) : undefined,
      channels: s.channels, sampleRate: s.sample_rate ? Number(s.sample_rate) : undefined,
    };
  });
  const duration = Number(data.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Filen har ingen lesbar varighet.');
  return {
    path, fileName: basename(path), sizeBytes, durationSeconds: duration,
    startSeconds: Number(data.format?.start_time) || 0,
    formatName: data.format?.format_name ?? 'ukjent',
    bitrate: data.format?.bit_rate ? Number(data.format.bit_rate) : null,
    streams,
  };
}

export async function probeMedia(ffprobe: string, path: string): Promise<MediaInfo> {
  const { size } = await stat(path);
  const r = await runProcess(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path], { keepOutput: true, timeoutMs: 60_000 }).result;
  if (r.code !== 0) throw new Error(`Kunne ikke lese filen: ${r.stderr.trim() || 'ukjent format'}`);
  return parseProbe(r.stdout, path, size);
}
