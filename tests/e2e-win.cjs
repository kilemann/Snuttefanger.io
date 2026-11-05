// Kjører den pakkede Windows-appen i GitHub Actions med tom brukermappe og sjekker verktøyinstallasjonen fra GUI-et.
const { _electron } = require('playwright-core');
const { mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

(async () => {
  const exe = join(__dirname, '..', 'release', 'win-unpacked', 'Snuttefanger.exe');
  const app = await _electron.launch({ executablePath: exe, env: { ...process.env, SNUTT_USER_DATA: mkdtempSync(join(tmpdir(), 'snutt-win-')) } });
  const page = await app.firstWindow();
  page.on('console', (m) => console.log('konsoll:', m.type(), m.text()));
  page.on('pageerror', (e) => console.log('sidefeil:', e.message));
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('heading', { name: 'Tools' }).waitFor();
  const button = page.getByRole('button', { name: 'Install missing tools' });
  const report = async (label) => {
    const rows = await page.locator('.tool').allInnerTexts();
    console.log(`${label}: knapp ${await button.isEnabled() ? 'aktiv' : 'grå'}`);
    for (const r of rows) console.log('  ' + r.replace(/\s+/g, ' '));
    console.log('  feil:', await page.locator('.error[role=alert]').allInnerTexts());
  };
  await page.waitForTimeout(5000);
  await report('Etter 5 s');
  await page.screenshot({ path: join(__dirname, '..', 'release', 'e2e-win-1.png') });
  if (!(await button.isEnabled())) throw new Error('Installer-knappen er grå på en maskin uten verktøy');
  await button.click();
  await page.waitForFunction(() => [...document.querySelectorAll('.tool')].every((t) => !/Missing|Not working/.test(t.textContent)), null, { timeout: 600000 });
  await report('Etter installasjon');
  await page.getByText('All tools are installed.').waitFor();
  await page.screenshot({ path: join(__dirname, '..', 'release', 'e2e-win-2.png') });
  await app.close();
  console.log('E2E WINDOWS OK');
})().catch((e) => { console.error(e); process.exit(1); });
