import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { assetsFor, parseChecksum } from '../src/main/services/BinaryManager';
import { assertHttpUrl, buildDownloadArgs, buildInfoArgs, extractError, parseInfoJson, parseProgressLine } from '../src/main/services/DownloaderService';
import { audioExtension, audioPlan, buildCoverArgs, buildCutArgs, isAudioTarget, cutOptions, outputExtension, parseOutTime, validateCut } from '../src/main/services/ExportService';
import { JobQueue, type JobHandle } from '../src/main/services/JobQueue';
import { parseProbe } from '../src/main/services/MediaProbeService';
import { sanitizeSettings } from '../src/main/services/SettingsService';
import type { DownloadRequest, Job, Settings } from '../src/shared/types';
import { compareVersions, ytDlpAgeDays } from '../src/shared/versions';
import { cutOutputPath, safeFileName } from '../src/main/services/ExportService';
import { buildJoinArgs, buildJoinGraph, concatList, hasEffects, joinPlan, outputLength, parseSilence, sanitizeEffects } from '../src/main/services/JoinService';
import { PeakCollector } from '../src/main/services/WaveformService';
import { snapToQuiet } from '../src/shared/waveform';
import { NO_EFFECTS } from '../src/shared/types';
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
  assert.equal(a[a.indexOf('before_dl:SNUTTTITLE %(title)s') - 1], '--print', 'tittelen skrives ut før nedlasting');
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
  assert.deepEqual(cutOptions(info, 'audio'), { cover: undefined, encodeFlac: false, audioOnly: true, encode: undefined });
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
  const d = { downloadDir: '/d', exportDir: '', quality: 'best', container: 'mp4', audioFormat: 'mp3', maxDownloads: 3, embedThumbnail: true, ytDlpPath: '', ffmpegPath: '', ffprobePath: '', denoPath: '', language: 'en', checkUpdates: true, dismissedVersion: '' } as Settings;
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
  const d = { downloadDir: '/d', exportDir: '', quality: 'best', container: 'mp4', audioFormat: 'mp3', maxDownloads: 3, embedThumbnail: true, ytDlpPath: '', ffmpegPath: '', ffprobePath: '', denoPath: '', language: 'nb', checkUpdates: true, dismissedVersion: '' } as Settings;
  assert.equal(sanitizeSettings({ language: 'en' }, d).language, 'en');
  assert.equal(sanitizeSettings({ language: 'de' as never }, d).language, 'nb');
});

test('lydformat: original kopierer, andre formater kodes om med mindre lyden allerede har formatet', () => {
  const opus = parseProbe(JSON.stringify({ format: { duration: '9' }, streams: [{ index: 0, codec_type: 'video', codec_name: 'av1' }, { index: 1, codec_type: 'audio', codec_name: 'opus' }] }), '/m/a.mp4', 5);
  assert.deepEqual(audioPlan(opus), { ext: '.opus', encode: undefined });
  assert.deepEqual(audioPlan(opus, 'opus'), { ext: '.opus', encode: undefined });
  assert.deepEqual(audioPlan(opus, 'mp3'), { ext: '.mp3', encode: ['-c:a', 'libmp3lame', '-q:a', '0'] });
  assert.deepEqual(audioPlan(opus, 'm4a'), { ext: '.m4a', encode: ['-c:a', 'aac', '-b:a', '256k'] });
  assert.deepEqual(audioPlan(opus, 'wav'), { ext: '.wav', encode: ['-c:a', 'pcm_s16le'] });
  const flac24 = parseProbe(JSON.stringify({ format: { duration: '9' }, streams: [{ index: 0, codec_type: 'audio', codec_name: 'flac', bits_per_raw_sample: '24' }] }), '/m/a.flac', 5);
  assert.deepEqual(audioPlan(flac24, 'wav'), { ext: '.wav', encode: ['-c:a', 'pcm_s24le'] });
  assert.deepEqual(audioPlan(flac24, 'flac').encode, ['-c:a', 'flac']);
  // Omkoding søker før -i (nøyaktig når FFmpeg dekoder). Kopiering kutter etter -i.
  const enc = buildCutArgs('in.mp4', 1, 2, 'ut.mp3', { audioOnly: true, encode: ['-c:a', 'libmp3lame', '-q:a', '0'] });
  assert.ok(enc.indexOf('-ss') < enc.indexOf('-i'));
  assert.ok(!enc.includes('copy') && enc.includes('libmp3lame'));
  assert.ok(isAudioTarget('mp3') && isAudioTarget('original') && !isAudioTarget('ogg') && !isAudioTarget('toString'));
});

const audioInfo = (path: string, codec: string, rate = 48000, channels = 2, extra: object[] = []) => parseProbe(JSON.stringify({ format: { duration: '4' }, streams: [
  { index: 0, codec_type: 'audio', codec_name: codec, sample_rate: String(rate), channels }, ...extra,
] }), path, 5);

test('skjøting: like lydfiler kopieres, ulike kodes om, og Original nektes når formatene er ulike', () => {
  const opus = [audioInfo('/a.opus', 'opus'), audioInfo('/b.opus', 'opus')];
  assert.deepEqual(joinPlan(opus, 'original'), { ext: '.opus', method: 'copy' });
  assert.deepEqual(joinPlan(opus, 'opus'), { ext: '.opus', method: 'copy' });
  assert.equal(joinPlan(opus, 'mp3').method, 'encode');
  const mixed = [audioInfo('/a.mp3', 'mp3', 44100), audioInfo('/b.opus', 'opus')];
  assert.throws(() => joinPlan(mixed, 'original'), /joinMismatch/);
  const plan = joinPlan(mixed, 'mp3');
  assert.deepEqual([plan.method, plan.ext, plan.sampleRate, plan.channels], ['encode', '.mp3', 44100, 2]);
  assert.equal(joinPlan(mixed, 'opus').sampleRate, 48000, 'Opus krever 48 kHz');
  // Omslag hindrer ikke tapsfri skjøting, men et videospor gjør det.
  const covered = [audioInfo('/a.m4a', 'aac', 44100, 2, [{ index: 1, codec_type: 'video', codec_name: 'png', disposition: { attached_pic: 1 } }]), audioInfo('/b.m4a', 'aac', 44100)];
  assert.equal(joinPlan(covered, 'original').method, 'copy');
  const video = parseProbe(JSON.stringify({ format: { duration: '4' }, streams: [{ index: 0, codec_type: 'video', codec_name: 'h264' }, { index: 1, codec_type: 'audio', codec_name: 'aac', sample_rate: '44100', channels: 2 }] }), '/v.mp4', 5);
  assert.throws(() => joinPlan([video, covered[1]], 'original'), /joinMismatch/);
  assert.throws(() => joinPlan([opus[0]], 'mp3'), /joinCount/);
  const flac = [audioInfo('/a.flac', 'flac', 44100), audioInfo('/b.flac', 'flac', 44100)];
  assert.equal(joinPlan(flac, 'original').method, 'encode');
});

test('skjøting: concat-listen tåler apostrof, og omkoding bygger én filtergraf', () => {
  assert.equal(concatList(["/m/Rock'n roll.mp3", '/m/b.mp3']), "file '/m/Rock'\\''n roll.mp3'\nfile '/m/b.mp3'\n");
  const copy = buildJoinArgs(['/a', '/b'], '/l.txt', { ext: '.opus', method: 'copy' }, '/ut.opus');
  assert.deepEqual(copy.slice(copy.indexOf('-f'), copy.indexOf('-f') + 6), ['-f', 'concat', '-safe', '0', '-i', '/l.txt']);
  const enc = buildJoinArgs(['/a', '/b', '/c'], '/l.txt', { ext: '.mp3', method: 'encode', encode: ['-c:a', 'libmp3lame'], sampleRate: 44100, channels: 1 }, '/ut.mp3');
  assert.equal(enc.filter((x) => x === '-i').length, 3);
  assert.match(enc[enc.indexOf('-filter_complex') + 1], /aresample=44100.*channel_layouts=mono.*\[a0\]\[a1\]\[a2\]concat=n=3:v=0:a=1\[j\];\[j\]anull\[out\]$/);
});

test('delt FFmpeg-bygg: DLL-ene følger med, men ikke ffplay', () => {
  const ff = assetsFor('win32').find((a) => a.provides.includes('ffmpeg'))!;
  assert.match(ff.url, /win64-gpl-shared\.zip$/);
  for (const f of ['avcodec-63.dll', 'avformat-63.dll', 'avutil-61.dll', 'swresample-7.dll', 'avfilter-12.dll', 'swscale-10.dll', 'avdevice-63.dll']) assert.ok(ff.companions!.test(f), f);
  for (const f of ['ffplay.exe', 'ffmpeg.exe', 'evil.dll', 'avcodec.dll.exe']) assert.ok(!ff.companions!.test(f), f);
  assert.equal(assetsFor('linux').find((a) => a.provides.includes('ffmpeg'))!.companions, undefined);
});

test('effekter: bare lydendringer krever omkoding, og ugyldige verdier rettes', () => {
  assert.equal(hasEffects(NO_EFFECTS), false);
  assert.equal(hasEffects({ ...NO_EFFECTS, title: 'x', cover: false }), false);
  assert.equal(hasEffects({ ...NO_EFFECTS, speeds: [1, 1] }), false);
  assert.equal(hasEffects({ ...NO_EFFECTS, speeds: [1, 1.25] }), true);
  const e = sanitizeEffects({ speeds: [3, 1.25], fadeIn: -2, fadeOut: 99, crossfade: Number.NaN, title: 'a\nb', trimSilence: 'ja' as never }, 3);
  assert.deepEqual([e.speeds, e.fadeIn, e.fadeOut, e.crossfade, e.title, e.trimSilence], [[1, 1.25, 1], 0, 30, 0, 'a b', false]);
  const opus = [audioInfo('/a.opus', 'opus'), audioInfo('/b.opus', 'opus')];
  assert.throws(() => joinPlan(opus, 'original', { ...NO_EFFECTS, normalize: true }), /joinEffectsOriginal/);
  assert.equal(joinPlan(opus, 'opus', { ...NO_EFFECTS, fadeIn: 1 }).method, 'encode', 'samme format, men effekt: må kodes om');
});

test('stillhet: start og slutt finnes, 0,1 s beholdes, og en helt stille fil beholdes', () => {
  const log = 'silence_start: 0\nsilence_end: 1.5 | silence_duration: 1.5\nsilence_start: 3.2\nsilence_end: 3.6 | silence_duration: 0.4\nsilence_start: 8.4';
  assert.deepEqual(parseSilence(log, 10), { start: 1.4, end: 8.5 });
  assert.deepEqual(parseSilence('silence_start: 0\nsilence_end: 10 | x', 10), { start: 0, end: 10 });
  assert.deepEqual(parseSilence('', 10), { start: 0, end: 10 });
  // Stillhet bare i midten røres ikke.
  assert.deepEqual(parseSilence('silence_start: 4\nsilence_end: 5 | x', 10), { start: 0, end: 10 });
  // FFmpeg kan avslutte siste stillhet nøyaktig ved filslutt.
  assert.deepEqual(parseSilence('silence_start: 9\nsilence_end: 10 | x', 10), { start: 0, end: 9.1 });
});

test('effektgrafen: krysstoning, hastighet, utjevning og fade i riktig rekkefølge', () => {
  const plan = { ext: '.mp3', method: 'encode' as const, encode: ['-c:a', 'libmp3lame'], sampleRate: 44100, channels: 2 };
  const fx = { ...NO_EFFECTS, speeds: [2, 2, 2], normalize: true, fadeIn: 1, fadeOut: 2, crossfade: 1 };
  const g = buildJoinGraph(3, plan, fx, [{ start: 0.5, end: 4 }, { start: 0, end: 4 }, { start: 0, end: 4 }], [4, 4, 4]);
  assert.match(g, /\[0:a:0\]atrim=start=0\.5:end=4,asetpts=PTS-STARTPTS,atempo=2,aresample=44100/);
  assert.match(g, /\[a0\]\[a1\]acrossfade=d=1:c1=tri:c2=tri\[x1\];\[x1\]\[a2\]acrossfade=d=1/);
  // 3,5/2 + 4/2 + 4/2 − 2 krysstoninger à 1 s = 3,75 s. Fade ut på 2 s kappes til halve lengden (1,875 s).
  assert.match(g, /\[x2\]loudnorm=I=-16:TP=-1\.5:LRA=11,aresample=44100,afade=t=in:st=0:d=1,afade=t=out:st=1\.875:d=1\.875\[out\]$/);
  assert.equal(outputLength([{ start: 0, end: 4 }, { start: 0, end: 4 }], { ...NO_EFFECTS, speeds: [0.5, 0.5] }), 16);
  // Første fil i 1x og neste i 1,25x: 4 + 3,2 s.
  assert.equal(outputLength([{ start: 0, end: 4 }, { start: 0, end: 4 }], { ...NO_EFFECTS, speeds: [1, 1.25] }), 7.2);
  const mixedGraph = buildJoinGraph(2, plan, { ...NO_EFFECTS, speeds: [1, 1.25] }, null, [4, 4]);
  assert.match(mixedGraph, /^\[0:a:0\]aresample=44100.*;\[1:a:0\]atempo=1\.25,aresample=44100/);
  const plain = buildJoinGraph(2, plan, NO_EFFECTS, null, [4, 4]);
  assert.match(plain, /concat=n=2:v=0:a=1\[j\];\[j\]anull\[out\]$/);
  const args = buildJoinArgs(['/a', '/b'], '/l', plan, '/o.mp3', { ...NO_EFFECTS, title: 'Min mix', artist: 'Meg' }, null, [4, 4], { path: '/a', index: 1 });
  assert.deepEqual(args.slice(args.indexOf('-map'), args.indexOf('-map') + 8), ['-map', '[out]', '-map', '2:1', '-c:v', 'copy', '-disposition:v:0', 'attached_pic']);
  assert.ok(args.includes('title=Min mix') && args.includes('artist=Meg'));
});

test('bølgeform: topper per 10 ms, også når sampler deles mellom bitene', () => {
  const pc = new PeakCollector();
  const buf = Buffer.alloc(80 * 2 * 3);
  buf.writeInt16LE(-32768, 10);
  buf.writeInt16LE(8192, 80 * 2 + 4);
  pc.push(buf.subarray(0, 161)); pc.push(buf.subarray(161));
  assert.deepEqual([...pc.finish()], [255, 128, 0]);
  const wave = { peaksPerSecond: 100, peaks: Uint8Array.from([90, 80, 70, 5, 60, 5, 90, 90]), maxPeak: 90 };
  assert.equal(snapToQuiet(wave, 0.04, 0.03), 0.03, 'nærmeste av to like stille punkter');
  assert.equal(snapToQuiet(wave, 0.07, 0.01), 0.07);
  assert.equal(snapToQuiet({ peaksPerSecond: 100, peaks: new Uint8Array(), maxPeak: 0 }, 1.23), 1.23);
});

test('versjoner: nyere versjon oppdages, og yt-dlp-alder leses fra versjonsnummeret', () => {
  assert.ok(compareVersions('0.7.0', '0.6.1') > 0);
  assert.ok(compareVersions('v0.10.0', '0.9.9') > 0, 'tallene sammenlignes som tall, ikke tekst');
  assert.equal(compareVersions('v0.7.0', '0.7.0'), 0);
  assert.ok(compareVersions('0.6.1', '0.7.0') < 0);
  assert.equal(ytDlpAgeDays('2026.10.26', new Date(Date.UTC(2026, 10, 7))), 12);
  assert.equal(ytDlpAgeDays('2026.10.26.232912', new Date(Date.UTC(2026, 11, 26))), 61);
  assert.equal(ytDlpAgeDays('nightly', new Date()), null);
  assert.equal(ytDlpAgeDays(null), null);
});

test('klippnavn blir trygge filnavn i Windows', () => {
  assert.equal(safeFileName('  Refreng: "Bonfire" / drop?  '), 'Refreng Bonfire drop');
  assert.equal(safeFileName('slutt...'), 'slutt');
  assert.equal(safeFileName('CON'), 'CON_');
  assert.equal(safeFileName('a\u0007b'), 'a b');
  assert.equal(safeFileName('   '), '');
  assert.equal(safeFileName('x'.repeat(300)).length, 120);
  assert.ok(cutOutputPath('/m/video.mp4', 1, 2, '/ut', '.mp3', 'clip', 'Mitt beste klipp').endsWith('Mitt beste klipp.mp3'));
  assert.ok(cutOutputPath('/m/video.mp4', 1, 2, '/ut', '.mp3', 'clip', '').endsWith('video (clip 00.00.01-00.00.02).mp3'));
  const d = { downloadDir: '/d', exportDir: '', quality: 'best', container: 'mp4', audioFormat: 'mp3', maxDownloads: 3, embedThumbnail: true, ytDlpPath: '', ffmpegPath: '', ffprobePath: '', denoPath: '', language: 'nb', checkUpdates: true, dismissedVersion: '' } as Settings;
  assert.equal(sanitizeSettings({ checkUpdates: false, dismissedVersion: '0.7.1' }, d).checkUpdates, false);
  assert.equal(sanitizeSettings({ checkUpdates: 'nei' as never }, d).checkUpdates, true);
  // Oppgradering fra 0.8: de nye mappene arver mappene som gjaldt før.
  const fresh = { ...d, quickMp3Dir: '/musikk', cutDownloadDir: '/video', cutDownloadMode: 'video', joinDir: '' } as Settings;
  const old = sanitizeSettings({ downloadDir: '/mine', exportDir: '/klipp' }, fresh);
  assert.deepEqual([old.quickMp3Dir, old.cutDownloadDir, old.joinDir, old.cutDownloadMode], ['/mine', '/mine', '/klipp', 'video']);
  const neu = sanitizeSettings({}, fresh);
  assert.deepEqual([neu.quickMp3Dir, neu.cutDownloadDir, neu.joinDir], ['/musikk', '/video', '']);
  const own = sanitizeSettings({ downloadDir: '/mine', quickMp3Dir: '/mp3', cutDownloadDir: '/til-klipp', joinDir: '', cutDownloadMode: 'audio' }, fresh);
  assert.deepEqual([own.quickMp3Dir, own.cutDownloadDir, own.joinDir, own.cutDownloadMode], ['/mp3', '/til-klipp', '', 'audio']);
  assert.equal(sanitizeSettings({ cutDownloadMode: 'gif' as never }, fresh).cutDownloadMode, 'video');
});
