// Ekte verktøy: laster ned yt-dlp, FFmpeg og Deno, lager testfiler og kjører hele kjeden lokalt.
// Kjører på Linux her og på Windows i GitHub Actions. Mappenavnet har æøå med vilje.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BinaryManager } from '../src/main/services/BinaryManager';
import { DownloadRunner, fetchUrlInfo, type DownloaderDeps } from '../src/main/services/DownloaderService';
import { CutRunner } from '../src/main/services/ExportService';
import { JobQueue } from '../src/main/services/JobQueue';
import { probeMedia } from '../src/main/services/MediaProbeService';
import { runProcess } from '../src/main/services/ProcessManager';
import type { AudioTarget, DownloadRequest, Job, Settings } from '../src/shared/types';

const root = mkdtempSync(join(tmpdir(), 'snutt-test-'));
const work = join(root, 'Blåbærsyltetøy med mellomrom');
mkdirSync(work);
const bigFile = join(work, 'stor.mp4');
const settings = { ytDlpPath: '', ffmpegPath: '', ffprobePath: '', denoPath: '' } as Settings;
const bin = new BinaryManager(process.env.SNUTT_TEST_BIN ?? join(root, 'bin'), () => settings);
let server: Server;
let base = '';
let throttle = false;
let resumedRanges = 0;

async function ffmpeg(...args: string[]) {
  const r = await runProcess(bin.require('ffmpeg'), ['-hide_banner', '-loglevel', 'error', '-y', ...args]).result;
  assert.equal(r.code, 0, r.stderr);
}

before(async () => {
  await bin.install(['ytDlp', 'ffmpeg', 'ffprobe', 'deno']);
  // 30 s video med keyframe hvert 5. sekund og tilfeldig innhold, så filen blir stor nok til å pause.
  await ffmpeg('-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '30',
    '-c:v', 'libx264', '-g', '125', '-keyint_min', '125', '-pix_fmt', 'yuv420p', '-c:a', 'aac', bigFile);
  server = createServer((req, res) => {
    const size = statSync(bigFile).size;
    const m = req.headers.range?.match(/bytes=(\d+)-/);
    const start = m ? Number(m[1]) : 0;
    if (start > 0) resumedRanges++;
    res.writeHead(m ? 206 : 200, {
      'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': size - start,
      ...(m ? { 'Content-Range': `bytes ${start}-${size - 1}/${size}` } : {}),
    });
    res.on('error', () => {});
    void (async () => {
      for await (const chunk of createReadStream(bigFile, { start, highWaterMark: 16 * 1024 })) {
        if (res.destroyed) return;
        res.write(chunk);
        if (throttle) await new Promise((r) => setTimeout(r, 40));
      }
      if (!res.destroyed) res.end();
    })().catch(() => {});
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/klipp.mp4`;
}, { timeout: 600_000 });

after(() => { server?.close(); server?.closeAllConnections(); rmSync(root, { recursive: true, force: true }); });

test('alle verktøy er installert og virker', async () => {
  const status = await bin.status();
  for (const t of status) assert.ok(t.version, `${t.name} mangler versjon`);
});

test('tapsfri klipping lander på keyframe, bevarer kodek og lar originalen være', async () => {
  const before = statSync(bigFile).size;
  const queue = new JobQueue(() => {});
  queue.register('export', new CutRunner({ ffmpeg: () => bin.require('ffmpeg'), ffprobe: () => bin.require('ffprobe'), exportDir: () => '' }));
  queue.enqueue('export', 'k', { input: bigFile, startSeconds: 7, endSeconds: 15, mode: 'av' });
  const job = await waitFor(queue, (j) => ['done', 'failed'].includes(j.status));
  assert.equal(job.status, 'done', job.error ?? '');
  assert.ok(existsSync(job.outputPath!));
  assert.ok(job.outputPath!.includes('(clip 00.00.07-00.00.15)'));
  const out = await probeMedia(bin.require('ffprobe'), job.outputPath!);
  // Start 7 s faller tilbake til keyframen ved 5 s, så klippet blir omtrent 10 s.
  assert.ok(Math.abs(out.durationSeconds - 10) < 0.5, `varighet ${out.durationSeconds}`);
  assert.match(job.note ?? '', /keyframe/);
  assert.deepEqual(out.streams.map((s) => s.codec).sort(), ['aac', 'h264']);
  assert.equal(statSync(bigFile).size, before);
});

test('klipp starter på 0 i alle formater, også med omslagsbilde', async () => {
  const dir = join(work, 'formater');
  mkdirSync(dir);
  const cover = join(dir, 'omslag.png');
  await ffmpeg('-f', 'lavfi', '-i', 'testsrc2=size=64x64:rate=1', '-frames:v', '1', cover);
  const a = join(dir, 'a');
  const coverArgs = (out: string, audio: string) => [...['-i', bigFile, '-i', cover, '-map', '0:a', '-map', '1', '-c:a', audio, '-c:v', 'copy', '-disposition:v', 'attached_pic'], out];
  await ffmpeg('-i', bigFile, '-i', cover, '-map', '0', '-map', '1', '-c', 'copy', '-disposition:v:1', 'attached_pic', `${a}-omslag.mp4`);
  await ffmpeg('-i', bigFile, '-i', cover, '-map', '0:v', '-map', '0:a', '-map', '1', '-c', 'copy', `-attach`, cover, '-metadata:s:t', 'mimetype=image/png', '-map', '-1:v', `${a}.mkv`);
  await ffmpeg(...coverArgs(`${a}.mp3`, 'libmp3lame'));
  await ffmpeg(...coverArgs(`${a}.flac`, 'flac'));
  await ffmpeg(...coverArgs(`${a}.m4a`, 'aac'));
  await ffmpeg('-i', bigFile, '-map', '0:a', '-c:a', 'pcm_s16le', `${a}.wav`);
  await ffmpeg('-i', bigFile, '-map', '0:a', '-c:a', 'libopus', `${a}.opus`);
  await ffmpeg('-i', bigFile, '-c:v', 'libvpx-vp9', '-b:v', '200k', '-cpu-used', '8', '-deadline', 'realtime', '-g', '125', '-c:a', 'libopus', `${a}.webm`);
  for (const name of ['a-omslag.mp4', 'a.mkv', 'a.mp3', 'a.flac', 'a.m4a', 'a.wav', 'a.opus', 'a.webm']) {
    const input = join(dir, name);
    const queue = new JobQueue(() => {});
    queue.register('export', new CutRunner({ ffmpeg: () => bin.require('ffmpeg'), ffprobe: () => bin.require('ffprobe'), exportDir: () => join(dir) }));
    queue.enqueue('export', 'k', { input, startSeconds: 7, endSeconds: 15, mode: 'av' });
    const job = await waitFor(queue, (j) => ['done', 'failed'].includes(j.status));
    assert.equal(job.status, 'done', `${name}: ${job.error}`);
    const out = await probeMedia(bin.require('ffprobe'), job.outputPath!);
    assert.ok(out.startSeconds < 0.25, `${name} starter på ${out.startSeconds}`);
    assert.ok(out.durationSeconds >= 7.5 && out.durationSeconds < 11, `${name} varer ${out.durationSeconds}`);
    const src = await probeMedia(bin.require('ffprobe'), input);
    assert.equal(out.streams.some((s) => s.attachedPic), !name.endsWith('.mkv') && src.streams.some((s) => s.attachedPic), `${name} omslag`);
    assert.equal(out.streams.filter((s) => s.type === 'video').length, src.streams.filter((s) => s.type === 'video').length, `${name} videospor`);
  }
});

test('bare lyd: første lydspor kopieres uendret, starter på 0 og beholder omslag der beholderen tåler det', async () => {
  const dir = join(work, 'formater');
  const cases: [string, string, string, boolean][] = [
    ['a-omslag.mp4', '.m4a', 'aac', true], ['a.webm', '.opus', 'opus', false], ['a.mkv', '.m4a', 'aac', true],
  ];
  for (const [name, ext, codec, cover] of cases) {
    const queue = new JobQueue(() => {});
    queue.register('export', new CutRunner({ ffmpeg: () => bin.require('ffmpeg'), ffprobe: () => bin.require('ffprobe'), exportDir: () => join(dir, 'lyd') }));
    queue.enqueue('export', 'k', { input: join(dir, name), startSeconds: 7, endSeconds: 15, mode: 'audio' });
    const job = await waitFor(queue, (j) => ['done', 'failed'].includes(j.status));
    assert.equal(job.status, 'done', `${name}: ${job.error}`);
    assert.ok(job.outputPath!.endsWith(`(audio clip 00.00.07-00.00.15)${ext}`), job.outputPath ?? "");
    const out = await probeMedia(bin.require('ffprobe'), job.outputPath!);
    assert.deepEqual(out.streams.filter((s) => !s.attachedPic).map((s) => s.codec), [codec], name);
    assert.equal(out.streams.some((s) => s.attachedPic), cover, `${name} omslag`);
    assert.ok(out.startSeconds < 0.05, `${name} starter på ${out.startSeconds}`);
    assert.ok(Math.abs(out.durationSeconds - 8) < 0.1, `${name} varer ${out.durationSeconds}`);
    assert.equal(job.note, undefined);
  }
});

test('lydformat: omkoding gir riktig format, nøyaktig lengde, start på 0 og omslag der det passer', async () => {
  const dir = join(work, 'formater');
  const cases: [string, AudioTarget, string, string, boolean][] = [
    ['a.webm', 'mp3', '.mp3', 'mp3', false], ['a-omslag.mp4', 'mp3', '.mp3', 'mp3', true], ['a.flac', 'wav', '.wav', 'pcm_s24le', false],
    // Testfilen er 24-bit FLAC, så WAV blir 24-bit.
    ['a.mp3', 'm4a', '.m4a', 'aac', true], ['a-omslag.mp4', 'opus', '.opus', 'opus', false], ['a.wav', 'flac', '.flac', 'flac', false],
  ];
  for (const [name, target, ext, codec, cover] of cases) {
    const queue = new JobQueue(() => {});
    queue.register('export', new CutRunner({ ffmpeg: () => bin.require('ffmpeg'), ffprobe: () => bin.require('ffprobe'), exportDir: () => join(dir, 'format') }));
    queue.enqueue('export', 'k', { input: join(dir, name), startSeconds: 7, endSeconds: 15, mode: 'audio', audioFormat: target });
    const job = await waitFor(queue, (j) => ['done', 'failed'].includes(j.status));
    assert.equal(job.status, 'done', `${name} til ${target}: ${job.error}`);
    assert.ok(job.outputPath!.endsWith(ext), job.outputPath ?? '');
    const out = await probeMedia(bin.require('ffprobe'), job.outputPath!);
    assert.deepEqual(out.streams.filter((s) => !s.attachedPic).map((s) => s.codec), [codec], `${name} til ${target}`);
    assert.equal(out.streams.some((s) => s.attachedPic), cover, `${name} til ${target} omslag`);
    assert.ok(out.startSeconds < 0.05, `${name} til ${target} starter på ${out.startSeconds}`);
    assert.ok(Math.abs(out.durationSeconds - 8) < 0.1, `${name} til ${target} varer ${out.durationSeconds}`);
  }
});

function deps(tempRoot: string): DownloaderDeps {
  return {
    ytDlp: () => bin.require('ytDlp'),
    tools: () => ({ ffmpeg: bin.require('ffmpeg'), deno: bin.locate('deno').path }),
    tempRoot, embedThumbnail: () => false,
  };
}

async function waitFor(queue: JobQueue, pred: (j: Job) => boolean, ms = 120_000): Promise<Job> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const j = queue.list()[0];
    if (j && pred(j)) return j;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Tidsavbrudd: ${JSON.stringify(queue.list()[0])}`);
}

test('yt-dlp henter info og laster ned til mappe med æøå', async () => {
  throttle = false;
  const dest = join(work, 'ned 1');
  const d = deps(join(root, 'tmp1'));
  const info = await fetchUrlInfo(d, base);
  assert.ok(info.title.length > 0);
  const queue = new JobQueue(() => {});
  queue.register('download', new DownloadRunner(d));
  const req: DownloadRequest = { url: base, title: 'x', mode: 'video', quality: 'best', container: 'mp4', audioFormat: 'mp3', destination: dest };
  queue.enqueue('download', 'x', req);
  const job = await waitFor(queue, (j) => ['done', 'failed'].includes(j.status));
  assert.equal(job.status, 'done', job.error ?? '');
  assert.ok(job.outputPath!.startsWith(dest), job.outputPath ?? '');
  assert.equal(statSync(job.outputPath!).size > 0, true);
});

test('lydnedlasting omkoder til MP3', async () => {
  throttle = false;
  const dest = join(work, 'ned lyd');
  const queue = new JobQueue(() => {});
  queue.register('download', new DownloadRunner(deps(join(root, 'tmp3'))));
  queue.enqueue('download', 'x', { url: base, title: 'x', mode: 'audio', quality: 'best', container: 'mp4', audioFormat: 'mp3', destination: dest } satisfies DownloadRequest);
  const job = await waitFor(queue, (j) => ['done', 'failed'].includes(j.status));
  assert.equal(job.status, 'done', job.error ?? '');
  assert.ok(job.outputPath!.endsWith('.mp3'), job.outputPath ?? '');
  const out = await probeMedia(bin.require('ffprobe'), job.outputPath!);
  assert.ok(out.streams.some((s) => s.codec === 'mp3'));
});

test('pause stopper prosessen, fortsett fullfører, avbryt fjerner delfiler', async () => {
  throttle = true;
  const dest = join(work, 'ned 2');
  const tempRoot = join(root, 'tmp2');
  const queue = new JobQueue(() => {});
  queue.register('download', new DownloadRunner(deps(tempRoot)));
  const req: DownloadRequest = { url: base, title: 'x', mode: 'video', quality: 'best', container: 'mp4', audioFormat: 'mp3', destination: dest };
  const id = queue.enqueue('download', 'x', req);
  await waitFor(queue, (j) => (j.progress.percent ?? 0) > 30);
  queue.pause(id);
  const paused = await waitFor(queue, (j) => j.status === 'paused');
  const pausedAt = paused.progress.percent!;
  assert.ok(readdirSync(tempRoot).length > 0, 'delfil skal ligge igjen');
  throttle = false;
  queue.resume(id);
  const done = await waitFor(queue, (j) => ['done', 'failed'].includes(j.status));
  assert.equal(done.status, 'done', done.error ?? '');
  assert.ok(resumedRanges > 0, 'fortsett skal hente resten, ikke starte fra null');
  const resumed = await probeMedia(bin.require('ffprobe'), done.outputPath!);
  assert.ok(Math.abs(resumed.durationSeconds - 30) < 0.5, `varighet ${resumed.durationSeconds}`);
  assert.ok(pausedAt < 100);

  throttle = true;
  const q2 = new JobQueue(() => {});
  q2.register('download', new DownloadRunner(deps(join(root, 'tmp4'))));
  const id2 = q2.enqueue('download', 'y', { ...req, destination: join(work, 'ned 3') });
  await waitFor(q2, (j) => (j.progress.percent ?? 0) > 1);
  q2.cancel(id2);
  await waitFor(q2, (j) => j.status === 'canceled');
  await new Promise((r) => setTimeout(r, 500));
  assert.deepEqual(readdirSync(join(root, 'tmp4')), []);
  assert.equal(existsSync(join(work, 'ned 3')) && readdirSync(join(work, 'ned 3')).length > 0, false);
  throttle = false;
});
