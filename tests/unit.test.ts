import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { assetsFor, parseChecksum } from '../src/main/services/BinaryManager';
import { assertHttpUrl, buildDownloadArgs, buildInfoArgs, extractError, parseInfoJson, parseProgressLine } from '../src/main/services/DownloaderService';
import { audioExtension, buildCoverArgs, buildCutArgs, cutOptions, outputExtension, parseOutTime, validateCut } from '../src/main/services/ExportService';
import { JobQueue, type JobHandle } from '../src/main/services/JobQueue';
import { parseProbe } from '../src/main/services/MediaProbeService';
import { sanitizeSettings } from '../src/main/services/SettingsService';
import type { DownloadRequest, Job, Settings } from '../src/shared/types';
import { languageFromLocale, msg, translate, translateMessage } from '../src/shared/i18n';

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
  assert.throws(() => parseInfoJson('{"_type":"playlist"}'), /playlist/);
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

test('omslagsbilde hentes fra egen inngang, og FLAC kodes tapsfritt på nytt', () => {
  const a = buildCutArgs('in.mp4', 1, 2, 'ut.mp4', { cover: { index: 2, outputVideoIndex: 1 } });
  assert.equal(a.filter((x) => x === '-i').length, 2);
  assert.ok(a.includes('1:2') && a.includes('0:V?') && !a.includes('0'.concat(':v?')));
  assert.equal(a[a.indexOf('-disposition:v:1') + 1], 'attached_pic');
  const plain = buildCutArgs('in.mp4', 1, 2, 'ut.mp4');
  assert.equal(plain.filter((x) => x === '-i').length, 1);
  const flac = buildCutArgs('in.flac', 1, 2, 'ut.flac', { encodeFlac: true });
  assert.equal(flac[flac.indexOf('-c:a') + 1], 'flac');
  const info = parseProbe(JSON.stringify({ format: { duration: '9' }, streams: [
    { index: 0, codec_type: 'video', codec_name: 'av1' }, { index: 1, codec_type: 'audio', codec_name: 'opus' },
    { index: 2, codec_type: 'video', codec_name: 'png', disposition: { attached_pic: 1 } },
  ] }), '/m/a.mp4', 5);
  assert.deepEqual(cutOptions(info), { cover: { index: 2, outputVideoIndex: 1 }, encodeFlac: false, audioOnly: false });
  // Bare lyd: Opus havner i .opus, som ikke kan ha omslag, og bare første lydspor tas med.
  assert.equal(outputExtension(info, 'audio'), '.opus');
  assert.deepEqual(cutOptions(info, 'audio'), { cover: undefined, encodeFlac: false, audioOnly: true });
  const withCover = buildCutArgs('in.mp4', 1, 2, 'ut.m4a', { audioOnly: true, cover: { index: 2, outputVideoIndex: 0 } });
  assert.equal(withCover.filter((x) => x === '-i').length, 1, 'omslaget legges på i eget steg');
  const step2 = buildCoverArgs('lyd.m4a', 'in.mp4', 2, 'ut.m4a');
  assert.deepEqual(step2.slice(step2.indexOf('-map')), ['-map', '0:a', '-map', '1:2', '-c', 'copy', '-disposition:v:0', 'attached_pic', '-map_metadata', '0', 'ut.m4a']);
  const audio = buildCutArgs('in.mp4', 1, 2, 'ut.opus', { audioOnly: true });
  assert.deepEqual(audio.filter((x, i) => audio[i - 1] === '-map'), ['0:a:0']);
  assert.ok(audio.indexOf('-ss') > audio.indexOf('-i'), 'bare lyd kuttes nøyaktig etter -i');
  assert.equal(audio[audio.indexOf('-t') + 1], '1.000');
});

test('lydspor får en beholder som tar kodeken uendret', () => {
  assert.equal(audioExtension('aac'), '.m4a');
  assert.equal(audioExtension('mp3'), '.mp3');
  assert.equal(audioExtension('pcm_s16le'), '.wav');
  assert.equal(audioExtension('vorbis'), '.ogg');
  assert.equal(audioExtension('dts'), '.mka');
  const noAudio = parseProbe(JSON.stringify({ format: { duration: '9' }, streams: [{ index: 0, codec_type: 'video', codec_name: 'h264' }] }), '/m/a.mp4', 5);
  assert.throws(() => outputExtension(noAudio, 'audio'), /noAudio/);
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
  const d = { downloadDir: '/d', exportDir: '', quality: 'best', container: 'mp4', audioFormat: 'mp3', maxDownloads: 3, embedThumbnail: true, ytDlpPath: '', ffmpegPath: '', ffprobePath: '', denoPath: '', language: 'en' } as Settings;
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

test('versjonsnummeret er likt i package.json, nettsiden, infovinduet og endringsloggen', () => {
  const v = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const page = readFileSync('index.html', 'utf8');
  assert.ok(page.includes(`<span class="ver" id="ver">v${v}</span>`), 'nettsiden');
  assert.ok(page.includes(`<b>v${v}</b>`), 'versjonslisten på nettsiden');
  assert.ok(readFileSync('src/renderer/views/InfoDialog.tsx', 'utf8').includes(`['v${v}',`), 'infovinduet');
  assert.ok(readFileSync('CHANGELOG.md', 'utf8').includes(`## ${v} (`), 'endringsloggen');
});

test('meldinger fra hovedprosessen oversettes når de vises, også nestede', () => {
  const m = msg('err.clipN', { n: 2, inner: msg('err.noAudio') });
  assert.equal(translateMessage('en', m), 'Clip 2: This file has no audio.');
  assert.equal(translateMessage('nb', m), 'Klipp 2: Filen har ingen lyd.');
  assert.equal(translateMessage('nb', 'ERROR fra yt-dlp'), 'ERROR fra yt-dlp');
  assert.equal(translate('nb', 'note.keyframe', { s: 2.25 }).startsWith('Klippet ble 2,3 s'), true);
  assert.equal(translate('en', 'note.keyframe', { s: 2.25 }).startsWith('The clip is 2.3 s'), true);
  assert.equal(languageFromLocale('nb-NO'), 'nb');
  assert.equal(languageFromLocale('nn'), 'nb');
  assert.equal(languageFromLocale('en-US'), 'en');
  assert.equal(languageFromLocale('sv-SE'), 'en');
});

test('språkinnstillingen godtar bare norsk og engelsk', () => {
  const d = { downloadDir: '/d', exportDir: '', quality: 'best', container: 'mp4', audioFormat: 'mp3', maxDownloads: 3, embedThumbnail: true, ytDlpPath: '', ffmpegPath: '', ffprobePath: '', denoPath: '', language: 'nb' } as Settings;
  assert.equal(sanitizeSettings({ language: 'en' }, d).language, 'en');
  assert.equal(sanitizeSettings({ language: 'de' as never }, d).language, 'nb');
});
