import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Readable } from 'node:stream';
import { protocol } from 'electron';

export const MEDIA_SCHEME = 'snuttmedia';

/** Bare filer brukeren selv har åpnet får en token. Renderer kan ikke be om vilkårlige stier. */
const opened = new Map<string, string>();

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo', '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.wav': 'audio/wav',
  '.aac': 'audio/aac', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.opus': 'audio/ogg',
};

export function registerSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: MEDIA_SCHEME, privileges: { stream: true, standard: true, secure: true, supportFetchAPI: true } }]);
}

export function mediaSrc(path: string): string {
  const token = randomUUID();
  opened.clear();
  opened.set(token, path);
  return `${MEDIA_SCHEME}://file/${token}`;
}

export function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  const m = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (!m[1] && !m[2])) return null;
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  return start <= end && start < size ? { start, end } : null;
}

export function registerMediaHandler(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const token = new URL(request.url).pathname.slice(1);
    const path = opened.get(token);
    if (!path) return new Response('Ikke funnet', { status: 404 });
    const { size } = await stat(path);
    const type = MIME[extname(path).toLowerCase()] ?? 'application/octet-stream';
    const header = request.headers.get('range');
    const range = parseRange(header, size);
    if (header && !range) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    const { start, end } = range ?? { start: 0, end: Math.max(0, size - 1) };
    const body = size === 0 ? null : Readable.toWeb(createReadStream(path, { start, end })) as unknown as BodyInit;
    return new Response(body, {
      status: range ? 206 : 200,
      headers: {
        'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1),
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
      },
    });
  });
}
