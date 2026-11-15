const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'allow' });

test('PWA: manifest ja ikonit kunnossa', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.getAttribute('link[rel="manifest"]', 'href');
  const m = await (await request.get(href)).json();
  expect(m.name).toBe('Maunon ruokinta');
  expect(m.display).toBe('standalone');
  expect(m.theme_color).toBe('#66a446');
  for (const size of ['192x192', '512x512']) expect(m.icons.some(i => i.sizes === size)).toBeTruthy();
  expect(m.icons.some(i => i.purpose === 'maskable')).toBeTruthy();
  for (const i of m.icons) {
    const r = await request.get(i.src);
    expect(r.status(), i.src).toBe(200);
    expect(r.headers()['content-type']).toContain('image/png');
  }
});

test('PWA: Chromen asennettavuustarkistus ei löydä virheitä', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cdp = await page.context().newCDPSession(page);
  const res = await cdp.send('Page.getInstallabilityErrors');
  expect(res.installabilityErrors).toEqual([]);
});

test('PWA: sovellus aukeaa ilman verkkoa ja tiedot säilyvät', async ({ page, context }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  // Tallennetaan nimi käyttöönottokyselyssä ennen offline-tilaa
  await page.fill('#wName', 'Mauno');
  await page.evaluate(() => localStorage.setItem('koira-ruokinta-v1', JSON.stringify({ cfg: { dogName: 'Mauno', setupDone: true } })));

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#dogName')).toContainText('Mauno');
  await expect(page.locator('#meals [data-slot="0"]')).toBeVisible();
  await page.click('#meals [data-slot="0"]');
  await expect(page.locator('#toastTxt')).toContainText('kirjattu');
  await context.setOffline(false);
});
