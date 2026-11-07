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
import { JoinRunner } from '../src/main/services/JoinService';
import { ProjectStore } from '../src/main/services/ProjectStore';
import { getWaveform } from '../src/main/services/WaveformService';
import { checkForUpdate } from '../src/main/services/UpdateService';
import { NO_EFFECTS } from '../src/shared/types';
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

test('skjøting av lyd: tapsfritt når formatene er like, ellers omkoding, med riktig samlet lengde', async () => {
  const dir = join(work, 'skjøt');
  mkdirSync(dir);
  const make = async (name: string, freq: number, codec: string[]) => {
    const p = join(dir, name);
    await ffmpeg('-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=4`, '-ar', '48000', '-ac', '2', ...codec, p);
    return p;
  };
  const o1 = await make("a1 Rock'n roll.opus", 300, ['-c:a', 'libopus']);
  const o2 = await make('a2.opus', 400, ['-c:a', 'libopus']);
  const o3 = await make('a3.opus', 500, ['-c:a', 'libopus']);
  const m = await make('b.mp3', 600, ['-c:a', 'libmp3lame']);
  const cases: [string[], AudioTarget, string, string, number][] = [
    [[o1, o2, o3], 'original', '.opus', 'opus', 12],
    [[o1, m, join(work, 'formater', 'a-omslag.mp4')], 'mp3', '.mp3', 'mp3', 38],
    [[m, o2], 'flac', '.flac', 'flac', 8],
  ];
  for (const [inputs, format, ext, codec, length] of cases) {
    const queue = new JobQueue(() => {});
    queue.register('join', new JoinRunner({ ffmpeg: () => bin.require('ffmpeg'), ffprobe: () => bin.require('ffprobe'), exportDir: () => join(dir, 'ut') }));
    queue.enqueue('join', 'j', { inputs, format });
    const job = await waitFor(queue, (j) => ['done', 'failed'].includes(j.status));
    assert.equal(job.status, 'done', `${format}: ${job.error}`);
    assert.ok(job.outputPath!.endsWith(`(joined)${ext}`), job.outputPath ?? '');
    const out = await probeMedia(bin.require('ffprobe'), job.outputPath!);
    assert.deepEqual(out.streams.filter((s) => !s.attachedPic).map((s) => s.codec), [codec], format);
    assert.ok(Math.abs(out.durationSeconds - length) < 0.2, `${format} varer ${out.durationSeconds}, ventet ${length}`);
    assert.match(job.note ?? '', format === 'original' ? /joinCopy/ : /joinEncode/);
  }
  assert.deepEqual(readdirSync(join(dir, 'ut')).filter((f) => f.startsWith('.snutt')), [], 'midlertidige lister er ryddet');
});

test('skjøt med effekter: stillhet fjernes, hastighet og krysstoning gir riktig lengde, tagger og omslag kommer med', async () => {
  const dir = join(work, 'effekter');
  mkdirSync(dir);
  // 1 s stillhet, 2 s tone, 1 s stillhet
  const padded = async (name: string, freq: number) => {
    const p = join(dir, name);
    await ffmpeg('-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=2`, '-af', 'adelay=1000:all=1,apad=pad_dur=1', '-ar', '44100', '-ac', '2', '-c:a', 'libmp3lame', p);
    return p;
  };
  const a = await padded('a.mp3', 440);
  const b = await padded('b.mp3', 660);
  const cover = join(work, 'formater', 'a-omslag.mp4');
  const run = async (inputs: string[], effects: typeof NO_EFFECTS, format: AudioTarget = 'mp3') => {
    const queue = new JobQueue(() => {});
    queue.register('join', new JoinRunner({ ffmpeg: () => bin.require('ffmpeg'), ffprobe: () => bin.require('ffprobe'), exportDir: () => join(dir, 'ut') }));
    queue.enqueue('join', 'j', { inputs, format, effects });
    const job = await waitFor(queue, (j) => ['done', 'failed'].includes(j.status));
    assert.equal(job.status, 'done', job.error ?? '');
    return { job, out: await probeMedia(bin.require('ffprobe'), job.outputPath!) };
  };
  const near = (v: number, want: number, tol: number, what: string) => assert.ok(Math.abs(v - want) < tol, `${what}: ${v}, ventet ${want}`);

  near((await run([a, b], { ...NO_EFFECTS, trimSilence: true })).out.durationSeconds, 4.4, 0.15, 'stillhet fjernet');
  near((await run([a, b], { ...NO_EFFECTS, speeds: [2, 2] })).out.durationSeconds, 4, 0.15, 'dobbel hastighet');
  near((await run([a, b], { ...NO_EFFECTS, speeds: [1, 1.25] })).out.durationSeconds, 7.2, 0.15, '1x og 1,25x');
  near((await run([a, b], { ...NO_EFFECTS, crossfade: 1, fadeIn: 1, fadeOut: 1, normalize: true })).out.durationSeconds, 7, 0.15, 'krysstoning');
  const tagged = await run([cover, a], { ...NO_EFFECTS, title: 'Min mix æøå', artist: 'Kilemann' });
  near(tagged.out.durationSeconds, 34, 0.2, 'med omslag');
  assert.ok(tagged.out.streams.some((s) => s.attachedPic), 'omslaget er med');
  const tags = await runProcess(bin.require('ffprobe'), ['-v', 'error', '-show_entries', 'format_tags=title,artist', '-of', 'json', tagged.job.outputPath!], { keepOutput: true }).result;
  assert.deepEqual(JSON.parse(tags.stdout).format.tags, { title: 'Min mix æøå', artist: 'Kilemann' });
  // Etter at stillheten er fjernet er filene 2,2 s, så 3 s krysstoning er for lang.
  await assert.rejects(run([a, b], { ...NO_EFFECTS, trimSilence: true, crossfade: 3 }), /crossfadeTooLong/);
});

test('bølgeform og lagrede klipp', async () => {
  const wave = await getWaveform(bin.require('ffmpeg'), bigFile);
  assert.ok(Math.abs(wave.peaks.length - 3000) <= 2, `topper: ${wave.peaks.length}`);
  // lavfi sine har amplitude 1/8. Kvadratrot-skalaen gir da cirka 90 av 255.
  assert.ok(Math.abs(wave.maxPeak - 90) < 5, `topp ${wave.maxPeak}`);
  const store = new ProjectStore(join(root, 'prosjekt'));
  await store.save(bigFile, { count: 2, active: 1, clips: [{ start: 1, end: 2, mode: 'audio', fmt: 'mp3' }, { start: 3, end: 4, mode: 'av', fmt: 'original' }] });
  const again = new ProjectStore(join(root, 'prosjekt'));
  assert.deepEqual((await again.load(bigFile))?.clips[0], { start: 1, end: 2, mode: 'audio', fmt: 'mp3' });
  assert.equal(await again.load(join(root, 'finnes-ikke.mp4')), null);
});

test('oppdateringssjekk mot en lokal server, og stille feil uten svar', async () => {
  const srv = createServer((_q, r) => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify({ tag_name: 'v9.1.0', html_url: 'x' })); });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(srv.address() as { port: number }).port}/latest`;
  assert.deepEqual(await checkForUpdate('0.7.0', url), { latest: '9.1.0', newer: true });
  assert.deepEqual(await checkForUpdate('9.1.0', url), { latest: '9.1.0', newer: false });
  srv.close(); srv.closeAllConnections();
  assert.equal(await checkForUpdate('0.7.0', 'http://127.0.0.1:9/finnes-ikke'), null);
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
