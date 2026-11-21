import { test, expect } from '@playwright/test';
import { mkdirSync } from 'fs';
import { resolve } from 'path';

const QA_DIR = resolve(process.cwd(), '../docs/qa');
mkdirSync(QA_DIR, { recursive: true });

const SITES = [
  'apollo11',
  'chandrayaan3',
  'malapert',
  'mons_mouton',
  'south_pole',
  'tsiolkovskiy',
];

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
];

for (const vp of VIEWPORTS) {
  test.describe(`Smoke QA at ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test(`all 6 sites, sky views, Explorer, Compare, Calendar, and data assertions (${vp.width}px)`, async ({ page }) => {
      const consoleErrors = [];
      const failedRequests = [];

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          const txt = msg.text();
          // Ignore browser's automatic 404 console message for optional missing site PNGs
          if (txt.includes('404') && txt.includes('.png')) return;
          consoleErrors.push(txt);
        }
      });
      page.on('requestfailed', (req) => {
        failedRequests.push(`${req.method()} ${req.url()} (${req.failure()?.errorText})`);
      });
      page.on('response', (res) => {
        if (res.status() >= 400) {
          // Optional site preview PNGs may be absent (fallback placeholder is tested separately)
          if (res.status() === 404 && res.url().endsWith('.png')) return;
          failedRequests.push(`${res.status()} ${res.url()}`);
        }
      });

      const tNav0 = Date.now();
      await page.goto('/');
      // Wait for data.json to load and render the site selector
      const siteSelect = page.locator('select').first();
      await expect(siteSelect).toBeVisible();
      const firstPaintMs = Date.now() - tNav0;
      console.log(`[QA ${vp.width}px] First interactive render: ${firstPaintMs} ms`);

      // Verify data.json assertions directly from loaded data
      const dataCheck = await page.evaluate(async () => {
        const res = await fetch('data.json');
        const json = await res.json();
        const byId = Object.fromEntries(json.sites.map((s) => [s.id, s]));
        const apolloEarthPct =
          (byId.apollo11.earth_elev.filter((e) => e > 0).length / byId.apollo11.earth_elev.length) * 100;
        const tsiolEarthPct =
          (byId.tsiolkovskiy.earth_elev.filter((e) => e > 0).length / byId.tsiolkovskiy.earth_elev.length) * 100;
        const spSunMin = Math.min(...byId.south_pole.sun_elev);
        const spSunMax = Math.max(...byId.south_pole.sun_elev);
        return { apolloEarthPct, tsiolEarthPct, spSunMin, spSunMax };
      });
      expect(dataCheck.apolloEarthPct).toBeCloseTo(100, 1);
      expect(dataCheck.tsiolEarthPct).toBeCloseTo(0, 1);
      expect(dataCheck.spSunMin).toBeGreaterThanOrEqual(-1.7);
      expect(dataCheck.spSunMax).toBeLessThanOrEqual(1.7);

      // Iterate through all 6 sites
      for (const siteId of SITES) {
        await siteSelect.selectOption(siteId);
        await page.waitForTimeout(150);

        // Check core dashboard sections are visible
        await expect(page.getByText('Earth visible', { exact: true }).first()).toBeVisible();
        await expect(page.getByText('Timeline over the window')).toBeVisible();
        await expect(page.getByText('Longest Darkness', { exact: true })).toBeVisible();
        await expect(page.getByText(/^(Green: promising|Yellow: marginal|Red: poor)$/)).toBeVisible();
        await expect(page.locator('.js-plotly-plot').first()).toBeVisible();
        await expect(page.getByText('Launch-slip calendar')).toBeVisible();
        await expect(page.getByText('Coordinate source')).toBeVisible();

        // Site card: must show either a loaded image (naturalWidth > 0) or the fallback placeholder, never broken
        const siteImg = page.locator(`img[src$="${siteId}.png"]`);
        if ((await siteImg.count()) > 0) {
          const ok = await siteImg.evaluate((img) => img.complete && img.naturalWidth > 0);
          expect(ok).toBe(true);
        } else {
          await expect(page.getByText(`No image (${siteId}.png)`)).toBeVisible();
        }

        // No horizontal overflow
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);

        // Screenshot 2D dashboard
        await page.screenshot({ path: resolve(QA_DIR, `${siteId}-${vp.name}-2d.png`), fullPage: false });

        // Switch through sky views: 2D -> Lander 3D -> Moon 3D, play for 2s on apollo11 & south_pole (and quick switch on all)
        await page.getByRole('button', { name: 'Lander 3D' }).click();
        await page.waitForTimeout(250);
        await page.screenshot({ path: resolve(QA_DIR, `${siteId}-${vp.name}-lander3d.png`), fullPage: false });

        if (siteId === 'apollo11' || siteId === 'south_pole') {
          const playBtn = page.getByRole('button', { name: 'Play' });
          await playBtn.click();
          await page.waitForTimeout(2000);
          await page.getByRole('button', { name: 'Pause' }).click();
        }

        await page.getByRole('button', { name: 'Moon 3D' }).click();
        await page.waitForTimeout(250);
        await page.screenshot({ path: resolve(QA_DIR, `${siteId}-${vp.name}-moon3d.png`), fullPage: false });

        // Return to 2D
        await page.getByRole('button', { name: '2D sky chart' }).click();
      }

      // Explorer mode: check all 3 CSA facts and their links
      await page.getByRole('button', { name: /Explorer mode/i }).click();
      await expect(page.getByText('Source: Canadian Space Agency')).toBeVisible();
      await expect(page.getByText(/first lunar rover/i)).toBeVisible();
      await expect(page.getByText(/Canadarm3/i).first()).toBeVisible();
      await expect(page.getByText(/Jeremy Hansen/i)).toBeVisible();
      const csaLinks = page.locator('a[href*="asc-csa.gc.ca"]');
      expect(await csaLinks.count()).toBe(3);
      await page.getByRole('button', { name: /Explorer mode/i }).click();

      // Click a calendar day and verify the start date input changes
      const dateInput = page.locator('input[type="date"]').first();
      const beforeDate = await dateInput.inputValue();
      const calRects = page.locator('svg rect[role="button"], svg rect.cursor-pointer');
      if ((await calRects.count()) > 15) {
        await calRects.nth(15).click();
        const afterDate = await dateInput.inputValue();
        expect(afterDate).not.toBe(beforeDate);
      }

      // Compare mode: two sites, then two dates
      await page.getByRole('button', { name: /^Compare$/i }).click();
      await expect(page.getByText(/Compare two sites/i).or(page.getByRole('button', { name: /Two sites/i }))).toBeVisible();
      const twoDatesBtn = page.getByRole('button', { name: /Two dates/i });
      if ((await twoDatesBtn.count()) > 0) {
        await twoDatesBtn.click();
        await page.waitForTimeout(150);
      }
      await page.getByRole('button', { name: /Exit compare/i }).click();

      expect(consoleErrors, `Console errors: ${consoleErrors.join('; ')}`).toEqual([]);
      expect(failedRequests, `Failed requests: ${failedRequests.join('; ')}`).toEqual([]);
    });
  });
}

