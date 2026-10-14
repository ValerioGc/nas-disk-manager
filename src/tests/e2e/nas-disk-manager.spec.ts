import { expect, test, type Page } from '@playwright/test';

const localDisk = {
  id: 'system-disk',
  name: 'Disco di sistema',
  device: '/dev/sda1',
  kind: 'local',
  disk_type: 'partition',
  size_bytes: 128 * 1024 ** 3,
  mount: '/volume1',
  filesystem: 'ext4',
  model: 'Test SSD',
  transport: 'sata',
  removable: false,
  read_only: false,
  initializable: false,
  parent: '/dev/sda',
  source: null,
};

const externalDisk = {
  ...localDisk,
  id: 'backup-disk',
  name: 'Disco USB di backup',
  device: '/dev/sdb1',
  kind: 'external',
  disk_type: 'removable',
  size_bytes: 64 * 1024 ** 3,
  mount: '/media/backup',
  filesystem: 'exfat',
  model: 'Backup Drive',
  transport: 'usb',
  removable: true,
  parent: '/dev/sdb',
};

async function serveDiskInventory(page: Page, hasExternal = true) {
  const requestedKinds: string[] = [];

  await page.route('**/api/disks*', async (route) => {
    const kind = new URL(route.request().url()).searchParams.get('kind') ?? 'local';
    requestedKinds.push(kind);
    const disks =
      kind === 'local' ? [localDisk] : kind === 'external' && hasExternal ? [externalDisk] : [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(disks),
    });
  });

  return requestedKinds;
}

async function openDiskShell(page: Page) {
  await page.route('**/disk-shell', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<iframe src="/?lang=it&theme=dark" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>
      <script>
        window.smartRequest = null;
        window.notices = [];
        window.addEventListener('message', (event) => {
          const message = event.data;
          if (message.type === 'smart-disk') window.smartRequest = message;
          if (message.type === 'notify') window.notices.push(message);
          if (message.type === 'disk-locks' || message.type === 'eject-disk') {
            event.source.postMessage({ nas: 1, type: message.type + '-result', requestId: message.requestId, success: true, data: [] }, event.origin);
          }
        });
      </script>`,
    }),
  );
  await page.goto('/disk-shell');
  return page.frameLocator('iframe');
}

test('switching disk categories loads the matching inventory and updates its summary', async ({
  page,
}) => {
  const requestedKinds = await serveDiskInventory(page);
  const summary = page.locator('.summary .surface_card');
  const nvmeCount = summary.filter({ hasText: 'Dischi NVMe' }).locator('strong');
  const sataCount = summary.filter({ hasText: 'Dischi SATA' }).locator('strong');
  const totalCount = summary.filter({ hasText: 'Dischi attivi' }).locator('strong');

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Dischi locali' })).toBeVisible();
  await expect(page.getByRole('row', { name: /Disco di sistema/ })).toBeVisible();
  await expect(nvmeCount).toHaveText('0');
  await expect(sataCount).toHaveText('1');
  await expect(totalCount).toHaveText('1');
  await expect(page.getByTestId('disk_total')).toHaveText('Totale dischi 1');

  await page.getByRole('button', { name: 'Dischi esterni' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Dischi esterni' })).toBeVisible();
  await expect(page.getByRole('row', { name: /Disco USB di backup/ })).toBeVisible();
  await expect(summary).toHaveCount(0);
  await expect(page.getByTestId('external_devices_menu')).toHaveCount(0);
  await expect(page.getByTestId('external_total')).toHaveText('Totale dispositivi esterni 1');
  await expect(page.getByRole('button', { name: 'Aggiorna' })).toBeVisible();
  expect(requestedKinds).toEqual(['local', 'external']);
});

test('hides refresh when no external disks are connected', async ({ page }) => {
  await serveDiskInventory(page, false);
  await page.goto('/');
  await page.getByRole('button', { name: 'Dischi esterni' }).click();
  await expect(page.getByText('Nessun dispositivo rilevato in questa categoria.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aggiorna' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Dischi locali' }).click();
  await expect(page.getByRole('button', { name: 'Aggiorna' })).toBeVisible();
});

test('centers the inventory spinner while disks are being detected', async ({ page }) => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => (finish = resolve));
  await page.route('**/api/disks*', async (route) => {
    await pending;
    await route.fulfill({ json: [] });
  });
  await page.goto('/');
  const status = page.getByRole('status');
  await expect(status).toHaveText('Rilevamento dei dischi in corso');
  expect(
    await status
      .locator('[aria-hidden="true"]')
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toMatch(/^loading_spin/);
  expect(await status.evaluate((element) => getComputedStyle(element).justifyContent)).toBe(
    'center',
  );
  finish();
  await expect(status).toHaveCount(0);
});

test('network disks stay hidden until a provider is configured', async ({ page }) => {
  await serveDiskInventory(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'Dischi di rete' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Dischi di rete' })).toBeVisible();
  await expect(page.locator('.summary')).toHaveCount(0);
  await expect(page.locator('.table_card')).toHaveCount(0);
  const intro = page.getByTestId('network_intro');
  await expect(intro).toContainText('Explorer');
  await expect(intro).toContainText('Backup');
  await expect(intro.getByRole('button', { name: 'Aggiungi' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aggiorna' })).toHaveCount(0);
});

test('disk details show device metadata and can be closed', async ({ page }) => {
  await serveDiskInventory(page);
  await page.goto('/');

  await page
    .getByRole('row', { name: /Disco di sistema/ })
    .getByRole('button', { name: /Dettagli/ })
    .click();

  const details = page.getByRole('dialog', { name: 'Dettagli' });
  await expect(details).toBeVisible();
  await expect(details).toContainText('Disco di sistema');
  await expect(details).toContainText('/dev/sda1');
  await expect(details).toContainText('/volume1');
  await expect(details).toContainText('ext4');
  await expect(details).toContainText('Test SSD');

  await details.getByRole('button', { name: 'Chiudi' }).click();
  await expect(details).toHaveCount(0);
});

test('SVG icons keep their masks in the browser', async ({ page }) => {
  await serveDiskInventory(page);
  await page.goto('/');

  const icons = page.locator('.app_icon');
  await expect(icons.first()).toBeVisible();
  const masks = await icons.evaluateAll((elements) =>
    elements.map((element) => getComputedStyle(element).maskImage),
  );
  expect(masks.length).toBeGreaterThan(0);
  expect(masks.every((mask) => mask !== 'none')).toBe(true);
});

test('native disk dialogs contain focus and restore it after Escape', async ({ page }) => {
  await page.route('**/api/disks*', (route) =>
    route.fulfill({
      json: [{ ...localDisk, id: 'sdb', initializable: true, filesystem: null }],
    }),
  );
  await page.goto('/');
  const trigger = page.getByTitle('Dettagli', { exact: true });
  await trigger.click();
  const details = page.locator('dialog.details_backdrop');
  await expect(details).toBeVisible();
  expect(await details.evaluate((dialog) => dialog.matches(':modal'))).toBe(true);
  await expect(details.getByRole('button', { name: 'Chiudi' })).toBeFocused();
  await trigger.evaluate((button) => button.focus());
  await expect(details.getByRole('button', { name: 'Chiudi' })).toBeFocused();
  // Tab may reach browser chrome (activeElement becomes body), but not the inert inventory.
  for (let index = 0; index < 6; index++) {
    await page.keyboard.press('Tab');
    expect(
      await details.evaluate(
        (dialog) =>
          document.activeElement === document.body || dialog.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await details.getByRole('tab').nth(2).click();
  const initialize = details.locator('.danger_button');
  await initialize.click();
  const confirmation = page.locator('dialog.confirmation_backdrop');
  await expect(confirmation).toBeVisible();
  expect(await confirmation.evaluate((dialog) => dialog.matches(':modal'))).toBe(true);
  expect(await confirmation.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(
    true,
  );
  await page.keyboard.press('Escape');
  await expect(confirmation).toHaveCount(0);
  await expect(details).toBeVisible();
  await expect(initialize).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(details).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('external disks offer row icons and ask before ejecting', async ({ page }) => {
  await serveDiskInventory(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Dischi esterni' }).click();
  const row = page.getByRole('row', { name: /Disco USB di backup/ });
  await expect(row.getByRole('button', { name: /Dettagli/ })).toHaveAttribute('title', 'Dettagli');
  await row.getByRole('button', { name: /Espelli/ }).click();
  await expect(page.getByTestId('eject_confirmation')).toBeVisible();
  await page.getByRole('button', { name: 'Annulla' }).click();
  await expect(page.getByTestId('eject_confirmation')).toHaveCount(0);
});

test('the disk sidebar stays visible while only the inventory content scrolls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 300 });
  await serveDiskInventory(page);
  await page.goto('/');
  await expect(page.getByRole('row', { name: /Disco di sistema/ })).toBeVisible();
  const sidebar = page.getByTestId('app_sidebar');
  const before = await sidebar.boundingBox();
  const scrollTop = await page.getByTestId('app_content').evaluate((element) => {
    element.scrollTop = 200;
    return element.scrollTop;
  });
  expect(scrollTop).toBeGreaterThan(0);
  expect((await sidebar.boundingBox())?.y).toBe(before?.y);
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight),
  ).toBe(true);
  expect(
    await page.getByTestId('app_content').evaluate((element) => ({
      // Chromium uses the shared WebKit scrollbar; a standard width overrides it.
      scrollbarWidth: getComputedStyle(element).scrollbarWidth,
      width: getComputedStyle(element, '::-webkit-scrollbar').width,
      height: getComputedStyle(element, '::-webkit-scrollbar').height,
      buttonDisplay: getComputedStyle(element, '::-webkit-scrollbar-button').display,
    })),
  ).toEqual({ scrollbarWidth: 'auto', width: '8px', height: '8px', buttonDisplay: 'none' });
});

test('SMART failures have a titled alert and USB removal uses the common switch', async ({
  page,
}) => {
  await page.route('**/api/disks*', (route) =>
    route.fulfill({ json: [{ ...externalDisk, uuid: 'usb-volume' }] }),
  );
  const app = await openDiskShell(page);
  await app.getByRole('button', { name: 'Dischi esterni' }).click();
  await app.getByTitle('Dettagli', { exact: true }).click();
  const details = app.getByRole('dialog', { name: 'Dettagli' });
  await details.getByRole('tab', { name: 'S.M.A.R.T.' }).click();
  const status = details.getByRole('status');
  await expect(status).toHaveText('Lettura dei dati S.M.A.R.T. in corso');
  expect(
    await status
      .locator('[aria-hidden="true"]')
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toMatch(/^loading_spin/);
  await expect
    .poll(() =>
      page.evaluate(() => (window as typeof window & { smartRequest: unknown }).smartRequest),
    )
    .not.toBeNull();
  await page.evaluate(() => {
    const host = window as typeof window & { smartRequest: { requestId: string } };
    const request = host.smartRequest;
    document.querySelector('iframe')!.contentWindow!.postMessage(
      {
        nas: 1,
        type: 'smart-disk-result',
        requestId: request.requestId,
        success: false,
        error:
          'Job for nas-os-storage-smart.service failed because the control process exited with error code.',
      },
      location.origin,
    );
  });
  const error = details.getByRole('alert');
  await expect(
    error.getByRole('heading', { name: 'Dati S.M.A.R.T. non disponibili' }),
  ).toBeVisible();
  expect(await error.evaluate((element) => getComputedStyle(element).borderTopStyle)).toBe('solid');
  expect(await error.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(
    'rgba(0, 0, 0, 0)',
  );
  await expect(error.getByText(/Job for nas-os-storage-smart/)).toBeVisible();
  await details.getByRole('tab', { name: 'Azioni disco' }).click();
  await expect(
    details.getByRole('switch', { name: 'Non removibile', exact: true }),
  ).not.toBeChecked();
  expect(
    await details
      .getByTestId('non_removable_switch')
      .locator('span')
      .first()
      .evaluate((element) => getComputedStyle(element).borderRadius),
  ).toBe('999px');
});

test('ejection notifications include the visible USB name and a safe removal message', async ({
  page,
}) => {
  await serveDiskInventory(page);
  const app = await openDiskShell(page);
  await app.getByRole('button', { name: 'Dischi esterni' }).click();
  await app.getByTestId(`eject_${externalDisk.id}`).click();
  await app.getByTestId('eject_confirm').click();
  await expect
    .poll(() => page.evaluate(() => (window as typeof window & { notices: unknown[] }).notices))
    .toEqual([
      expect.objectContaining({
        title: 'Espulsione completata',
        message:
          'Il dispositivo Disco USB di backup è stato espulso e può essere scollegato in sicurezza.',
        tone: 'success',
      }),
    ]);
});
