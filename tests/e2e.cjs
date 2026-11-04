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
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewportSize({ width: 1240, height: 820 });
  await page.getByRole('heading', { name: 'Last ned' }).waitFor();

  // Nedlasting via GUI
  await page.getByLabel('Nettadresse').fill(url);
  await page.getByRole('button', { name: 'Hent info' }).click();
  await page.locator('button.primary', { hasText: 'Last ned' }).waitFor({ timeout: 60000 });
  await page.screenshot({ path: join(shots, '1-last-ned.png') });
  await app.evaluate(async ({ dialog }, dir) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] }); }, join(root, 'ned'));
  await page.getByRole('button', { name: 'Velg mappe' }).click();
  await page.waitForFunction((d) => document.querySelector('input[aria-label="Lagres i"]').value === d, join(root, 'ned'));
  await page.locator('button.primary', { hasText: 'Last ned' }).click();
  await page.locator('.job[data-status=done]').waitFor({ timeout: 90000 });
  await page.screenshot({ path: join(shots, '2-ko.png') });

  // Åpne nedlastet fil i klipperen og kontroller avspilling med seek
  await page.getByRole('button', { name: 'Åpne i klipperen' }).click();
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
  await page.getByRole('textbox', { name: 'Start' }).fill('00:00:04');
  await page.getByRole('textbox', { name: 'Slutt' }).fill('00:00:09.5');
  await page.getByRole('textbox', { name: 'Slutt' }).press('Enter');
  await page.locator('h1').first().click();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(shots, '3-klipp.png') });
  await page.getByRole('button', { name: 'Eksporter klipp' }).click();
  await page.locator('.job[data-status=done]', { hasText: 'Klipp av' }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(shots, '4-klipp-ferdig.png') });
  const made = readdirSync(join(root, 'ned')).filter((f) => f.includes('klipp 00.00.04-00.00.09'));
  assert.equal(made.length, 1, readdirSync(join(root, 'ned')).join());

  // Åpne en lokal fil direkte, uten nedlasting
  await app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] }); }, file);
  await page.getByRole('button', { name: 'Klipp', exact: true }).click();
  await page.getByRole('button', { name: 'Åpne en annen fil' }).click();
  await page.getByRole('heading', { name: 'Prøvefilm æøå.mp4' }).waitFor();

  await page.getByRole('button', { name: 'Innstillinger' }).click();
  await page.getByRole('heading', { name: 'Verktøy' }).waitFor();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(shots, '5-innstillinger.png') });
  await page.selectOption('select >> nth=3', '2');
  await app.close();
  const saved = JSON.parse(require('node:fs').readFileSync(join(root, 'data', 'settings.json'), 'utf8'));
  assert.equal(saved.maxDownloads, 2);
  server.close();
  assert.deepEqual(errors, []);
  console.log('E2E OK', seeked);
})().catch((e) => { console.error(e); process.exit(1); });
