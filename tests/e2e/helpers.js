const { expect } = require('@playwright/test');

/** Kiinteä aika: maanantai 16.11.2026 klo 12.00 Helsingin aikaa. */
const NOON = new Date('2026-11-16T12:00:00+02:00');

async function prepare(page, time = NOON) {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort()); // ei ulkoisia fontteja testeissä
  await page.clock.setFixedTime(time);
}

/**
 * Käyttöönottokysely: päiväannos 4 dl (160 g), aamulla kuivaa 2 dl, illalla 2 lihapullaa,
 * kuivaruokaa 5 kg, pakastimessa 20 ja jääkaapissa 2 pullaa, varastossa namit 3 pss ja märkäruoka 2 prk.
 */
async function onboard(page) {
  await page.goto('./');
  const next = page.locator('#wizNext');
  await expect(page.locator('#wiz')).toBeVisible();

  await page.fill('#wName', 'Mauno');
  await next.click();
  await expect(page.locator('#wizBody h2')).toContainText('Lisää kuva');
  await next.click();
  await page.fill('#wBreed', 'cockerspanieli');
  await next.click();

  await page.click('#wDU [data-u="dl"]');
  await page.fill('#wDaily', '4');
  await next.click();

  await expect(page.locator('#wizBody h2')).toHaveText('Miten päivän 160 g jaetaan?');
  await page.click('[data-unit="dl"][data-i="0"]');
  await page.click('[data-type="raaka"][data-i="1"]');
  await expect(page.locator('[data-amt="0"]')).toHaveValue('2');
  await expect(page.locator('[data-amt="1"]')).toHaveValue('2');
  await next.click();

  await page.fill('#wStock', '5');
  await next.click();
  await page.fill('#wFz', '20');
  await page.fill('#wFr', '2');
  await next.click();

  await page.click('#wPick2 [data-p="0"]'); // Namit
  await page.click('#wPick2 [data-p="3"]'); // Märkäruoka
  await page.fill('[data-iq="0"]', '3');
  await page.fill('[data-iq="1"]', '2');
  await next.click();

  await expect(next).toHaveText('Aloita 🐾');
  await next.click();
  await expect(page.locator('#wiz')).toBeHidden();
  await expect(page.locator('#dogName')).toContainText('Mauno');
  // Kirjaukset tapahtuvat oikeasti lähtötilan jälkeen (laskenta ohittaa tapahtumat, joiden t <= lähtötilan t)
  const now = await page.evaluate(() => Date.now());
  await page.clock.setFixedTime(new Date(now + 5 * 60e3));
}

module.exports = { NOON, prepare, onboard };
