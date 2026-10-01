// A page left open across a deploy keeps its old build (moving between screens never
// reloads it). When it comes back into view it compares its build with the deployed
// index.html and offers to reload if a newer one is out (app/pwa.ts watchForNewBuild).
const { test, expect, openSignedIn } = require('../support/v2');

test.use({ viewport: { width: 390, height: 844 } });

/** What the browser does when the person returns to the tab. */
const comeBack = (page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

test('the same build deployed: nothing to offer', async ({ page, account }) => {
  await openSignedIn(page, account, '#/today');
  const checked = page.waitForResponse((r) => r.url().includes('build-check='));
  await comeBack(page);
  await checked;
  await page.waitForTimeout(300);
  await expect(page.getByText('Jest nowa wersja aplikacji.')).toHaveCount(0);
});

test('a newer build deployed: the page offers to reload into it', async ({ page, account }) => {
  await openSignedIn(page, account, '#/money');
  await page.route('**/index.html?build-check=*', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><script type="module" crossorigin src="./assets/index-NEWBUILD.js"></script>',
    }),
  );
  await comeBack(page);
  const toast = page.locator('.ui-toast');
  await expect(toast).toContainText('Jest nowa wersja aplikacji.');
  await page.unroute('**/index.html?build-check=*');
  const reloaded = page.waitForEvent('load');
  await toast.getByRole('button', { name: 'Odśwież' }).click();
  await reloaded;
  await expect(page).toHaveURL(/#\/money$/);
});
