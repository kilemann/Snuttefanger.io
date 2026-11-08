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
  execFileSync(join(binDir, 'ffmpeg'), ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25', '-f', 'lavfi', '-i', "sine=frequency=330,volume='if(lt(mod(t,4),2.5),1,0.01)':eval=frame", '-t', '20', '-c:v', 'libx264', '-g', '50', '-pix_fmt', 'yuv420p', '-c:a', 'aac', file]);
  // Samme server svarer på oppdateringssjekken med en nyere versjon, og leverer ellers testvideoen.
  const server = createServer((q, r) => {
    if (q.url === '/latest') { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end('{"tag_name":"v9.9.9"}'); return; }
    r.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': statSync(file).size }); createReadStream(file).pipe(r);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/snutt.mp4`;

  const app = await _electron.launch({
    executablePath: electron, args: ['.', '--no-sandbox'],
    env: { ...process.env, SNUTT_USER_DATA: join(root, 'data'), PATH: `${binDir}:${process.env.PATH}`, SNUTT_UPDATE_URL: `http://127.0.0.1:${server.address().port}/latest` },
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text() + ' ' + JSON.stringify(m.location())); });
  await page.setViewportSize({ width: 1240, height: 820 });
  await page.getByRole('heading', { name: 'Download' }).waitFor();
  // Varsel om ny versjon, og Ikke nå huskes
  await page.getByText('Snuttefanger v9.9.9 is available.').waitFor({ timeout: 15000 });
  await page.screenshot({ path: join(shots, '0-oppdatering.png') });
  await page.getByRole('button', { name: 'Not now' }).click();
  await page.getByText('Snuttefanger v9.9.9 is available.').waitFor({ state: 'detached' });

  // Nedlasting via GUI
  await page.getByLabel('Web address').fill(url);
  await page.getByRole('button', { name: 'Get info' }).click();
  await page.locator('button.primary', { hasText: 'Download' }).waitFor({ timeout: 60000 });
  await page.screenshot({ path: join(shots, '1-last-ned.png') });
  await app.evaluate(async ({ dialog }, dir) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] }); }, join(root, 'ned'));
  // Nederste Velg mappe hører til vanlig nedlasting. Den øverste hører til Hurtig MP3.
  await page.getByRole('button', { name: 'Choose folder' }).last().click();
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
  // Bølgeform, zoom og fest til stillhet
  await page.locator('canvas.strip-wave').waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Show all' }).waitFor();
  assert.ok(await page.getByRole('button', { name: 'Show all' }).isEnabled(), 'zoomet inn');
  await page.screenshot({ path: join(shots, '11-zoom.png') });
  await page.getByRole('button', { name: 'Show all' }).click();
  await page.getByLabel('Snap to silence').check();
  await page.getByLabel('Snap to silence').uncheck();
  await page.getByLabel('Number of clips').selectOption('3');
  const setClip = async (n, a, b) => {
    await page.getByRole('textbox', { name: `Start clip ${n}` }).fill(a);
    await page.getByRole('textbox', { name: `Start clip ${n}` }).press('Enter');
    await page.getByRole('textbox', { name: `End clip ${n}` }).fill(b);
    await page.getByRole('textbox', { name: `End clip ${n}` }).press('Enter');
  };
  // Angre og gjør om
  await setClip(1, '00:00:02', '00:00:05');
  await setClip(1, '00:00:03', '00:00:05');
  // Feltet oppdateres etter neste tegning, så vi venter på verdien i stedet for å lese den med en gang.
  const start1Is = (v) => page.waitForFunction((want) => document.querySelector('input[aria-label="Start clip 1"]').value === want, v, { timeout: 5000 });
  await page.getByRole('button', { name: /Undo/ }).click();
  await start1Is('00:00:02.000');
  await page.getByRole('button', { name: /Redo/ }).click();
  await start1Is('00:00:03.000');
  await page.locator('h1').first().click();
  await page.keyboard.press('Control+z');
  await start1Is('00:00:02.000');
  await setClip(2, '00:00:06', '00:00:09.5');
  await setClip(3, '00:00:12', '00:00:18');
  // Klipp 2 og 3 som bare lyd
  await page.getByLabel('Export clip 2').selectOption('audio');
  await page.getByLabel('Export clip 3').selectOption('audio');
  await page.getByLabel('Audio format clip 3').selectOption('mp3');
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
  assert.deepEqual(audio.map((f) => f.slice(-4)).sort(), ['.m4a', '.mp3'], files.join());
  const made = files.filter((f) => f.includes('(clip '));
  assert.equal(made.length, 1, files.join());
  for (const f of audio) {
    const streams = execFileSync(join(binDir, 'ffprobe'), ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', join(root, 'ned', f)]).toString().trim();
    assert.equal(streams, 'audio', f);
  }
  made.push(...audio);

  // Skjøt de to lydklippene: ulike formater (M4A og MP3), så standard er omkoding til MP3
  for (let n = 0; n < 2; n++) await page.getByRole('button', { name: 'Add to Join' }).first().click();
  await page.getByText('Added to Join').first().waitFor();
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.getByText('The files have different formats').waitFor({ timeout: 15000 });
  assert.equal(await page.getByLabel('Audio format').inputValue(), 'mp3');
  assert.equal(await page.locator('select[aria-label="Audio format"] option[value="original"]').count(), 0);
  // Køen viser nyeste først, så klipp 3 ble lagt til først. Flytt klipp 2 opp.
  await page.getByRole('button', { name: 'Move up 2' }).click();
  await page.screenshot({ path: join(shots, '10-skjot.png') });
  // Hastighet per fil: klipp 2 (3,5 s) i 1x og klipp 3 (6 s) i 1,5x gir 3,5 + 4 = 7,5 s
  await page.getByLabel('Speed for all files').selectOption('1.5');
  await page.getByLabel('Speed for file 1').selectOption('1');
  assert.equal(await page.getByLabel('Speed for file 2').inputValue(), '1.5');
  assert.equal(await page.locator('select[aria-label="Audio format"] option[value="original"]').count(), 0);
  await page.getByLabel('Title').fill('Min mix');
  await page.getByRole('button', { name: 'Listen to the result' }).click();
  await page.locator('audio.preview').waitFor({ timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('audio.preview').readyState >= 1, null, { timeout: 15000 });
  const previewLength = await page.evaluate(() => document.querySelector('audio.preview').duration);
  assert.ok(Math.abs(previewLength - 7.5) < 0.2, `forhåndsvisning ${previewLength}`);
  await page.screenshot({ path: join(shots, '12-skjot-effekter.png') });
  await page.getByRole('button', { name: 'Join 2 files' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.job[data-status=done]').length === 5, null, { timeout: 40000 });
  const joined = readdirSync(join(root, 'ned')).filter((f) => f.includes('(joined)'));
  assert.equal(joined.length, 1, readdirSync(join(root, 'ned')).join());
  assert.ok(joined[0].endsWith('.mp3') && joined[0].includes('(audio clip 00.00.06-00.00.09) (joined)'), joined[0]);
  const joinedLength = Number(execFileSync(join(binDir, 'ffprobe'), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(root, 'ned', joined[0])]).toString());
  assert.ok(Math.abs(joinedLength - 7.5) < 0.2, `skjøtet lengde ${joinedLength}`);
  const title = execFileSync(join(binDir, 'ffprobe'), ['-v', 'error', '-show_entries', 'format_tags=title', '-of', 'csv=p=0', join(root, 'ned', joined[0])]).toString().trim();
  assert.equal(title, 'Min mix');
  for (const f of made) {
    const out = execFileSync(join(binDir, 'ffprobe'), ['-v', 'error', '-show_entries', 'format=start_time', '-of', 'csv=p=0', join(root, 'ned', f)]).toString();
    assert.ok(Number(out) < 0.25, `${f} starter på ${out}`);
  }

  // Åpne en lokal fil direkte, uten nedlasting
  await app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] }); }, file);
  await page.getByRole('button', { name: 'Cut', exact: true }).click();
  await page.getByRole('button', { name: 'Open another file' }).click();
  await page.getByRole('heading', { name: 'Prøvefilm æøå.mp4' }).waitFor();
  // Navngitte lydklipp rett til Skjøt, i rekkefølge
  await page.getByLabel('Number of clips').selectOption('2');
  await setClip(1, '00:00:01', '00:00:03');
  await setClip(2, '00:00:05', '00:00:08');
  await page.getByLabel('Export clip 1').selectOption('audio');
  await page.getByLabel('Export clip 2').selectOption('audio');
  await page.getByRole('textbox', { name: 'Name of clip 1' }).fill('Del A: «intro»');
  await page.getByRole('textbox', { name: 'Name of clip 2' }).fill('Del B');
  await page.screenshot({ path: join(shots, '13-navn.png') });
  await page.getByRole('button', { name: 'Export and add to Join' }).click();
  await page.getByRole('heading', { name: 'Join audio' }).waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.join-name')].some((n) => n.textContent.includes('Del B.m4a')), null, { timeout: 30000 });
  const names = await page.locator('.join-name > div:first-child').allInnerTexts();
  assert.deepEqual(names.slice(-2), ['Del A «intro».m4a', 'Del B.m4a'], names.join(' | '));
  await page.screenshot({ path: join(shots, '14-til-skjot.png') });
  await page.getByRole('button', { name: 'Cut', exact: true }).click();
  // Tilbake til den første filen: de tre klippene er husket
  await page.getByRole('button', { name: 'Queue' }).click();
  await page.getByRole('button', { name: 'Open in cutter' }).last().click();
  await page.getByText('The clips from last time were restored.').waitFor({ timeout: 15000 });
  assert.equal(await page.getByLabel('Number of clips').inputValue(), '3');
  assert.equal(await page.getByRole('textbox', { name: 'Start clip 3' }).inputValue(), '00:00:12.000');

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('heading', { name: 'Tools' }).waitFor();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(shots, '5-innstillinger.png') });
  await page.getByLabel('Simultaneous downloads').selectOption('2');

  // Hurtig MP3: lim inn lenken, og lyden lastes ned som MP3 til valgt mappe uten flere klikk
  const quickDir = join(root, 'hurtig');
  await app.evaluate(({ dialog }, d) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [d] }); }, quickDir);
  await page.getByRole('button', { name: 'Download', exact: true }).first().click();
  await page.locator('.quick').getByRole('button', { name: 'Choose folder' }).click();
  await page.locator('.quick-folder', { hasText: quickDir }).waitFor();
  await page.getByLabel('Link for quick MP3').evaluate((el, link) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', link);
    el.focus();
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, url);
  await page.getByText(`Started: ${url}`).waitFor();
  assert.equal(await page.getByLabel('Link for quick MP3').inputValue(), '', 'boksen tømmes for neste lenke');
  await page.screenshot({ path: join(shots, '15-hurtig-mp3.png') });
  const waitFile = async (dir, re) => { for (let i = 0; i < 300; i++) { try { const f = readdirSync(dir).find((x) => re.test(x)); if (f) return f; } catch {} await page.waitForTimeout(100); } throw new Error(`ingen fil i ${dir}`); };
  const quickFile = await waitFile(quickDir, /\.mp3$/);
  const quickCodec = execFileSync(join(binDir, 'ffprobe'), ['-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', join(quickDir, quickFile)]).toString().trim();
  assert.equal(quickCodec, 'mp3');
  await page.getByRole('button', { name: 'Settings' }).click();

  // Bytt til norsk: menyen, køen og hjelpen følger med, også meldinger som allerede finnes
  await page.getByLabel('Language').selectOption('nb');
  await page.getByRole('heading', { name: 'Innstillinger' }).waitFor();
  await page.getByRole('button', { name: 'Kø' }).click();
  await page.getByText('Klipp 3 av 3 fra snutt [snutt].mp4 (lyd, MP3)').waitFor();
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
  assert.equal(saved.dismissedVersion, '9.9.9');
  server.close();
  if (errors.length) console.error('FEIL I SIDEN:', errors);
  assert.deepEqual(errors, []);
  console.log('E2E OK', seeked);
})().catch((e) => { console.error(e); process.exit(1); });
