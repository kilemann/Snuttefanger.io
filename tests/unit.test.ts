import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assetsFor, parseChecksum } from '../src/main/services/BinaryManager';
import { assertHttpUrl, buildDownloadArgs, buildInfoArgs, extractError, parseInfoJson, parseProgressLine } from '../src/main/services/DownloaderService';
import { buildCutArgs, parseOutTime, validateCut } from '../src/main/services/ExportService';
import { JobQueue, type JobHandle } from '../src/main/services/JobQueue';
import { parseProbe } from '../src/main/services/MediaProbeService';
import { sanitizeSettings } from '../src/main/services/SettingsService';
import type { DownloadRequest, Job, Settings } from '../src/shared/types';

const tools = { ffmpeg: '/x/ffmpeg', deno: '/x/deno' };
const req: DownloadRequest = { url: 'https://a.no/v', title: 't', mode: 'video', quality: 1080, container: 'mp4', audioFormat: 'mp3', destination: '/d' };

test('bare http og https godtas', () => {
  assert.equal(assertHttpUrl(' https://a.no/x '), 'https://a.no/x');
  assert.throws(() => assertHttpUrl('file:///etc/passwd'));
  assert.throws(() => assertHttpUrl('--exec=calc'));
});

test('URL står alltid etter -- så den ikke kan bli et yt-dlp-valg', () => {
  for (const a of [buildInfoArgs(req.url, tools), buildDownloadArgs(req, tools, '/t', true)]) {
    assert.deepEqual(a.slice(-2), ['--', req.url]);
  }
});

test('videovalg begrenser oppløsning og filformat', () => {
  const a = buildDownloadArgs(req, tools, '/t', false);
  assert.equal(a[a.indexOf('-S') + 1], 'res:1080');
  assert.equal(a[a.indexOf('--merge-output-format') + 1], 'mp4');
  assert.ok(!a.includes('--embed-thumbnail'));
  assert.ok(!buildDownloadArgs({ ...req, quality: 'best' }, tools, '/t', false).includes('-S'));
});

test('WAV får ikke innebygd miniatyrbilde', () => {
  const a = buildDownloadArgs({ ...req, mode: 'audio', audioFormat: 'wav' }, tools, '/t', true);
  assert.ok(a.includes('-x') && !a.includes('--embed-thumbnail'));
});

test('tolker fremdrift og feil fra yt-dlp', () => {
  const p = parseProgressLine('SNUTTPROG {"status":"downloading","downloaded_bytes":50,"total_bytes":200,"speed":10,"eta":15}');
  assert.deepEqual(p, { percent: 25, speedBps: 10, etaSeconds: 15, totalBytes: 200 });
  assert.equal(parseProgressLine('tilfeldig'), null);
  assert.equal(extractError('WARNING: x\nERROR: Video unavailable\n'), 'Video unavailable');
});

test('spilleliste avvises med forklaring og høyder sorteres', () => {
  assert.throws(() => parseInfoJson('{"_type":"playlist"}'), /Spillelister/);
  const i = parseInfoJson(JSON.stringify({ title: 'T', formats: [{ vcodec: 'h264', height: 720 }, { vcodec: 'none', height: 999 }, { vcodec: 'vp9', height: 1080 }, { vcodec: 'h264', height: 720 }] }));
  assert.deepEqual(i.heights, [1080, 720]);
});

test('klippekommando kopierer strømmer og overskriver aldri', () => {
  const a = buildCutArgs('in.mp4', 1.5, 3, 'ut.mp4');
  assert.ok(a.includes('-n'));
  assert.equal(a[a.indexOf('-c') + 1], 'copy');
  assert.ok(a.indexOf('-ss') < a.indexOf('-i'));
  assert.equal(a.at(-1), 'ut.mp4');
  assert.equal(parseOutTime('out_time_us=2500000'), 2.5);
  assert.throws(() => validateCut(5, 5, 10));
  assert.throws(() => validateCut(0, 20, 10));
  validateCut(0, 10, 10);
});

test('sjekksummer leses fra alle tre formatene', () => {
  const h = 'a'.repeat(64);
  assert.equal(parseChecksum(`${h}  yt-dlp.exe\n${'b'.repeat(64)}  annet`, 'yt-dlp.exe'), h);
  assert.equal(parseChecksum(`${h} *fil.zip`, 'fil.zip'), h);
  assert.equal(parseChecksum(`\nAlgorithm : SHA256\nHash      : ${h.toUpperCase()}\nPath      : C:\\x.zip`, null), h);
  assert.equal(parseChecksum(`${h}  annet`, 'yt-dlp.exe'), null);
  assert.equal(assetsFor('win32').length, 3);
});

test('ffprobe-data tolkes, og omslagsbilde regnes ikke som video', () => {
  const m = parseProbe(JSON.stringify({ format: { duration: '10.5', format_name: 'flac', bit_rate: '900000' }, streams: [
    { codec_type: 'audio', codec_name: 'flac', channels: 2, sample_rate: '44100' },
    { codec_type: 'video', codec_name: 'mjpeg', disposition: { attached_pic: 1 } },
  ] }), '/m/a.flac', 5);
  assert.equal(m.durationSeconds, 10.5);
  assert.deepEqual(m.streams.map((s) => s.type), ['audio', 'other']);
  assert.throws(() => parseProbe('{"format":{}}', 'a', 1));
});

test('ugyldige innstillinger faller tilbake til standard', () => {
  const d = { downloadDir: '/d', exportDir: '', quality: 'best', container: 'mp4', audioFormat: 'mp3', maxDownloads: 3, embedThumbnail: true, ytDlpPath: '', ffmpegPath: '', ffprobePath: '', denoPath: '' } as Settings;
  const s = sanitizeSettings({ quality: 123 as never, maxDownloads: 99, audioFormat: 'flac' }, d);
  assert.equal(s.quality, 'best'); assert.equal(s.maxDownloads, 3); assert.equal(s.audioFormat, 'flac');
});

function fakeRunner() {
  const live: { job: Job; resolve(): void; reject(e: Error): void; stopped: boolean }[] = [];
  const cleaned: string[] = [];
  return {
    live, cleaned,
    runner: {
      start(_p: unknown, job: Readonly<Job>): JobHandle {
        const entry: any = { job, stopped: false };
        const done = new Promise<{ outputPath?: string }>((res, rej) => {
          entry.resolve = () => res({ outputPath: 'x' });
          entry.reject = rej;
        });
        live.push(entry);
        return { done, stop() { entry.stopped = true; entry.reject(new Error('Stoppet')); } };
      },
      async cleanup(job: Readonly<Job>) { cleaned.push(job.id); },
    },
  };
}
const tick = () => new Promise((r) => setImmediate(r));

test('køen respekterer grensen og starter neste når en blir ferdig', async () => {
  const q = new JobQueue(() => {});
  const f = fakeRunner();
  q.register('download', f.runner);
  q.setLimit('download', 1);
  q.enqueue('download', 'a', {}); q.enqueue('download', 'b', {});
  assert.equal(f.live.length, 1);
  f.live[0].resolve(); await tick();
  assert.equal(f.live.length, 2);
  assert.equal(q.list().find((j) => j.title === 'a')!.status, 'done');
});

test('pause beholder delfiler, avbryt rydder, og fortsett starter på nytt', async () => {
  const q = new JobQueue(() => {});
  const f = fakeRunner();
  q.register('download', f.runner);
  const id = q.enqueue('download', 'a', {});
  q.pause(id); await tick();
  assert.equal(q.list()[0].status, 'paused');
  assert.equal(f.cleaned.length, 0);
  q.resume(id);
  assert.equal(q.list()[0].status, 'running');
  q.cancel(id); await tick();
  assert.equal(q.list()[0].status, 'canceled');
  assert.deepEqual(f.cleaned, [id]);
});

test('feil vises, og Prøv igjen kjører jobben på nytt', async () => {
  const q = new JobQueue(() => {});
  const f = fakeRunner();
  q.register('download', f.runner);
  const id = q.enqueue('download', 'a', {});
  f.live[0].reject(new Error('Bom')); await tick();
  assert.equal(q.list()[0].error, 'Bom');
  q.retry(id);
  assert.equal(q.list()[0].status, 'running');
  assert.equal(f.live.length, 2);
});
