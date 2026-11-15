const { test, expect } = require('@playwright/test');
const { prepare, onboard } = require('./helpers');

test.beforeEach(async ({ page }) => { await prepare(page); });

const meal = (page, i) => page.locator(`#meals [data-slot="${i}"]`);
const toast = page => page.locator('#toastTxt');

test('1. käyttöönottokysely tallentaa asetukset ja varastot', async ({ page }) => {
  await onboard(page);
  await expect(page.locator('#dogName .breed')).toHaveText('cockerspanieli');
  await expect(meal(page, 0)).toContainText('Aamuruoka');
  await expect(meal(page, 0)).toContainText('2 dl');
  await expect(meal(page, 1)).toContainText('2 kpl');
  await expect(page.locator('#todayTxt')).toContainText('päivässä 160 g');
  await expect(page.locator('#stock')).toContainText('5 kg');
  await expect(page.locator('#raw')).toContainText('20');
  await expect(page.locator('#foot')).toContainText('vain tähän selaimeen');

  // Tiedot säilyvät uudelleenlatauksessa (localStorage)
  await page.reload();
  await expect(page.locator('#dogName')).toContainText('Mauno');
  await expect(page.locator('#wiz')).toBeHidden();
});

test('2. aterian kirjaus ja tuplaruokinnan varoitus', async ({ page }) => {
  await onboard(page);
  await meal(page, 0).click();
  await expect(toast(page)).toContainText('Aamuruoka kirjattu');
  await expect(meal(page, 0)).toHaveClass(/done/);
  await expect(page.locator('#todayTxt')).toContainText('Syönyt 80 g');
  await expect(page.locator('#stock')).toContainText('4,9 kg');
  await expect(page.locator('#list')).toContainText('Aamuruoka');

  await meal(page, 0).click();
  await expect(page.locator('#modal')).toBeVisible();
  await expect(page.locator('#modalTitle')).toHaveText('Aamuruoka on jo annettu');
  await page.click('#mCancel');
  await expect(page.locator('#todayTxt')).toContainText('Syönyt 80 g');

  // "Kirjaa silti" kirjaa toisen kerran
  await meal(page, 0).click();
  await page.click('#modalForm button.primary');
  await expect(page.locator('#todayTxt')).toContainText('Syönyt 160 g');
});

test('3. kumoa-toiminto peruu kirjauksen', async ({ page }) => {
  await onboard(page);
  await meal(page, 0).click();
  await expect(meal(page, 0)).toHaveClass(/done/);
  await page.click('#toastUndo');
  await expect(toast(page)).toHaveText('Peruttu.');
  await expect(meal(page, 0)).not.toHaveClass(/done/);
  await expect(page.locator('#todayTxt')).toContainText('Syönyt 0 g');
  await expect(page.locator('#stock')).toContainText('5 kg');
});

test('4. sulatus ja rawNeed()', async ({ page }) => {
  await onboard(page);
  // illan 2 + huomisen 2 − jääkaapin 2 = 2
  await expect(page.locator('.thawcall')).toContainText('pitää ottaa sulamaan 2 kpl');
  expect(await page.evaluate(() => rawNeed())).toBe(2);

  await page.click('.thawcall [data-act="thawNeed"]');
  await expect(toast(page)).toContainText('2 lihapullaa sulamaan');
  await expect(page.locator('.thawcall')).toContainText('Huomisen lihapullat ovat jo jääkaapissa');
  await expect(page.locator('.rawbox').first()).toContainText('18');
  await expect(page.locator('.rawbox').nth(1)).toContainText('2 sulaa');
  expect(await page.evaluate(() => rawNeed())).toBe(0);

  // Illan raaka-ateria vähentää jääkaapista
  await meal(page, 1).click();
  await expect(toast(page)).toContainText('Iltaruoka kirjattu');
  expect(await page.evaluate(() => rawState().fr)).toBe(2);

  // Sulatuksen voi kumota
  await page.locator('#list li', { hasText: 'Sulamaan' }).locator('[data-del]').click();
  await expect(toast(page)).toContainText('Merkintä poistettu');
  expect(await page.evaluate(() => rawState().fz)).toBe(20);
});

test('5. varaston +/− ja märkäruokapurkin automaattinen vähennys', async ({ page }) => {
  await onboard(page);
  await page.click('#btnInv');
  const namit = page.locator('.inv-row', { hasText: 'Namit' });
  const wet = page.locator('.inv-row', { hasText: 'Märkäruoka' });
  await expect(namit.locator('.q')).toHaveText('3');
  await expect(wet).toContainText('vähenee aterioista');
  await namit.locator('[data-inv="+"]').click();
  await expect(namit.locator('.q')).toHaveText('4');
  await namit.locator('[data-inv="-"]').click();
  await namit.locator('[data-inv="-"]').click();
  await expect(namit.locator('.q')).toHaveText('2');
  await page.click('#invClose');

  await page.click('#btnOther');
  await page.fill('#modalForm input[name="amt"]', '1');
  await page.selectOption('#modalForm select[name="type"]', 'prk');
  await page.click('#modalForm button.primary');
  await expect(toast(page)).toContainText('kirjattu');

  await page.click('#btnInv');
  await expect(wet.locator('.q')).toHaveText('1');
  await expect(wet).toHaveClass(/low/);
  await page.click('#invClose');
  await expect(page.locator('#alerts')).toContainText('Märkäruoka vähissä');

  // Tuotteen poisto (vahvistuksella)
  await page.click('#btnInv');
  await namit.locator('[data-inv="del"]').click();
  await page.click('#modalForm button.primary');
  await expect(namit).toHaveCount(0);
  await page.click('#invClose');

  // Uusi tuote lomakkeella
  await page.click('#btnInv');
  await page.fill('#invForm input[name="name"]', 'Kanankaulat');
  await page.fill('#invForm input[name="qty"]', '6');
  await page.click('#invForm button.primary');
  await expect(page.locator('.inv-row', { hasText: 'Kanankaulat' }).locator('.q')).toHaveText('6');
});

test('6. muistiinpano ja "viimeksi"-rivi', async ({ page }) => {
  await onboard(page);
  await expect(page.locator('#lastSeen')).toBeHidden();
  await page.click('#noteChips [data-chip="0"]');
  await expect(toast(page)).toContainText('Muistiinpano lisätty');
  await expect(page.locator('#lastSeen')).toContainText('Maitohappobakteeri viimeksi 16.11. (tänään)');

  await page.fill('#noteIn', 'Kävi eläinlääkärillä');
  await page.click('#noteForm button');
  await expect(page.locator('#notes')).toContainText('Kävi eläinlääkärillä');
  await expect(page.locator('#list')).toContainText('Kävi eläinlääkärillä');

  await page.locator('#notes li', { hasText: 'Kävi eläinlääkärillä' }).locator('[data-del]').click();
  await expect(page.locator('#notes')).not.toContainText('Kävi eläinlääkärillä');
});

test('7. mobiilinäkymä 390 px ilman vaakavieritystä', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const noHScroll = async () => {
    const w = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
    expect(w).toBeLessThanOrEqual(390);
  };
  await page.goto('./');
  await noHScroll();
  await onboard(page);
  await noHScroll();
  await page.click('#btnInv');
  await noHScroll();
  await page.click('#invClose');
  await page.click('#btnSettings');
  for (let i = 0; i < 4; i++) await page.click('#wizNext'); // aterianjako-vaihe, leveimpiä
  await expect(page.locator('#wizBody h2')).toContainText('jaetaan');
  await noHScroll();
});

test('Firebasea ei ole konfiguroitu → localStorage-tila, ei kirjautumisnäkymää', async ({ page }) => {
  await page.goto('./');
  expect(await page.evaluate(() => typeof window.claude)).toBe('undefined');
  await expect(page.locator('#fbGate')).toHaveCount(0);
  await expect(page.locator('#acct')).toBeHidden();
});
