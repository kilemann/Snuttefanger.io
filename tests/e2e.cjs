// Kjører den ekte appen i Electron: åpne fil, spill av, klipp, last ned og se innstillinger.
const { _electron } = require('playwright');
const { execFileSync } = require('node:child_process');
const { createServer } = require('node:http');
const { createReadStream, mkdtempSync, statSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const assert = require('node:assert/strict');

(async () => {
  const [electron, binDir, shots] = process.argv.slice(2);
  const root = mkdtempSync(join(tmpdir(), 'snutt-e2e-'));
  const file = join(root, 'Prøvefilm æøå.mp4');
  execFileSync(join(binDir, 'ffmpeg'), ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=330', '-t', '20', '-c:v', 'libx264', '-g', '50', '-pix_fmt', 'yuv420p', '-c:a', 'aac', file]);
  const server = createServer((_q, r) => { r.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': statSync(file).size }); createReadStream(file).pipe(r); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/snutt.mp4`;

  const app = await _electron.launch({
    executablePath: electron, args: ['.', '--no-sandbox'],
    env: { ...process.env, SNUTT_USER_DATA: join(root, 'data'), PATH: `${binDir}:${process.env.PATH}` },
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text() + ' ' + JSON.stringify(m.location())); });
  await page.setViewportSize({ width: 1240, height: 820 });
  await page.getByRole('heading', { name: 'Download' }).waitFor();

  // Nedlasting via GUI
  await page.getByLabel('Web address').fill(url);
  await page.getByRole('button', { name: 'Get info' }).click();
  await page.locator('button.primary', { hasText: 'Download' }).waitFor({ timeout: 60000 });
  await page.screenshot({ path: join(shots, '1-last-ned.png') });
  await app.evaluate(async ({ dialog }, dir) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] }); }, join(root, 'ned'));
  await page.getByRole('button', { name: 'Choose folder' }).click();
  await page.waitForFunction((d) => document.querySelector('input[aria-label="Save to"]').value === d, join(root, 'ned'));
  await page.locator('button.primary', { hasText: 'Download' }).click();
  await page.locator('.job[data-status=done]').waitFor({ timeout: 90000 });
  await page.screenshot({ path: join(shots, '2-ko.png') });

  // Åpne nedlastet fil i klipperen og kontroller avspilling med seek
  await page.getByRole('button', { name: 'Open in cutter' }).click();
  await page.locator('video').waitFor();
  await page.waitForFunction(() => document.querySelector('video').readyState >= 2, null, { timeout: 20000 });
  const seeked = await page.evaluate(async () => {
    const v = document.querySelector('video');
    v.currentTime = 12;
    await new Promise((r) => v.addEventListener('seeked', r, { once: true }));
    v.muted = true; await v.play(); await new Promise((r) => setTimeout(r, 500)); v.pause();
    return { t: v.currentTime, w: v.videoWidth, d: v.duration };
  });
  assert.ok(seeked.t > 12 && seeked.w === 1280 && seeked.d > 19, JSON.stringify(seeked));

  // Klipp med hurtigtaster og tekstfelt
  await page.getByLabel('Number of clips').selectOption('3');
  const setClip = async (n, a, b) => {
    await page.getByRole('textbox', { name: `Start clip ${n}` }).fill(a);
    await page.getByRole('textbox', { name: `Start clip ${n}` }).press('Enter');
    await page.getByRole('textbox', { name: `End clip ${n}` }).fill(b);
    await page.getByRole('textbox', { name: `End clip ${n}` }).press('Enter');
  };
  await setClip(1, '00:00:02', '00:00:05');
  await setClip(2, '00:00:06', '00:00:09.5');
  await setClip(3, '00:00:12', '00:00:18');
  // Klipp 2 og 3 som bare lyd
  await page.getByLabel('Export clip 2').selectOption('audio');
  await page.getByLabel('Export clip 3').selectOption('audio');
  await page.locator('h1').first().click();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(shots, '3-klipp.png') });

  // Infoknappen
  await page.getByRole('button', { name: 'About and help' }).click();
  await page.getByRole('heading', { name: 'About Snuttefanger' }).waitFor();
  await page.keyboard.press('i');
  await page.screenshot({ path: join(shots, '6-info.png') });
  await page.keyboard.press('Escape');
  await page.locator('dialog').waitFor({ state: 'detached' });

  await page.getByRole('button', { name: 'Export 3 clips' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.job[data-status=done]').length === 4, null, { timeout: 40000 });
  await page.screenshot({ path: join(shots, '4-klipp-ferdig.png') });
  const files = readdirSync(join(root, 'ned'));
  const audio = files.filter((f) => f.includes('(audio clip '));
  assert.deepEqual(audio.map((f) => f.slice(-4)).sort(), ['.m4a', '.m4a'], files.join());
  const made = files.filter((f) => f.includes('(clip '));
  assert.equal(made.length, 1, files.join());
  for (const f of audio) {
    const streams = execFileSync(join(binDir, 'ffprobe'), ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', join(root, 'ned', f)]).toString().trim();
    assert.equal(streams, 'audio', f);
  }
  made.push(...audio);
  for (const f of made) {
    const out = execFileSync(join(binDir, 'ffprobe'), ['-v', 'error', '-show_entries', 'format=start_time', '-of', 'csv=p=0', join(root, 'ned', f)]).toString();
    assert.ok(Number(out) < 0.25, `${f} starter på ${out}`);
  }

  // Åpne en lokal fil direkte, uten nedlasting
  await app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] }); }, file);
  await page.getByRole('button', { name: 'Cut', exact: true }).click();
  await page.getByRole('button', { name: 'Open another file' }).click();
  await page.getByRole('heading', { name: 'Prøvefilm æøå.mp4' }).waitFor();

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('heading', { name: 'Tools' }).waitFor();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(shots, '5-innstillinger.png') });
  await page.getByLabel('Simultaneous downloads').selectOption('2');

  // Bytt til norsk: menyen, køen og hjelpen følger med, også meldinger som allerede finnes
  await page.getByLabel('Language').selectOption('nb');
  await page.getByRole('heading', { name: 'Innstillinger' }).waitFor();
  await page.getByRole('button', { name: 'Kø' }).click();
  await page.getByText('Klipp 2 av 3 fra snutt [snutt].mp4 (bare lyd)').waitFor();
  await page.screenshot({ path: join(shots, '8-norsk-ko.png') });
  await page.getByRole('button', { name: 'Klipp', exact: true }).click();
  await page.getByRole('button', { name: 'Eksporter klipp' }).waitFor();
  await page.screenshot({ path: join(shots, '9-norsk-klipp.png') });
  await page.getByRole('button', { name: 'Om appen og hjelp' }).click();
  await page.getByRole('heading', { name: 'Om Snuttefanger' }).waitFor();
  await page.keyboard.press('Escape');
  await app.close();
  const saved = JSON.parse(require('node:fs').readFileSync(join(root, 'data', 'settings.json'), 'utf8'));
  assert.equal(saved.maxDownloads, 2);
  assert.equal(saved.language, 'nb');
  server.close();
  if (errors.length) console.error('FEIL I SIDEN:', errors);
  assert.deepEqual(errors, []);
  console.log('E2E OK', seeked);
})().catch((e) => { console.error(e); process.exit(1); });
