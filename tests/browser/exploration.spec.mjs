import {test, expect} from '@playwright/test';

async function start(page) {
  await page.goto('./');
  await expect(page.locator('.map-viewport')).toBeVisible();
  if (await page.locator('.intro-start').isVisible()) await page.locator('.intro-start').click();
}

async function search(page, name) {
  const expand = page.getByRole('button', {name: '展开地图面板'});
  if (await expand.isVisible()) await expand.click();
  const input = page.getByRole('combobox', {name: '搜索苏州地点'});
  await input.fill(name);
  return input;
}

test('ranked search supports arrows, Enter, Escape and Chinese composition', async ({page}) => {
  await start(page);
  const input = await search(page, '苏州博物馆');
  const options = page.getByRole('option');
  await expect(options.first().locator('strong')).toHaveText('苏州博物馆');
  await input.dispatchEvent('keydown', {key: 'Enter', code: 'Enter', isComposing: true});
  await expect(page.locator('.place-card')).toHaveCount(0);
  await input.press('ArrowDown');
  const selectedName = await page.locator('[role="option"][aria-selected="true"] strong').innerText();
  await input.press('Enter');
  await expect(page.locator('.place-card h2')).toHaveText(selectedName);
  await page.getByRole('button', {name: '关闭所有地点详情'}).click();
  await search(page, '留园');
  await input.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(input).toHaveValue('留园');
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(page.locator('.place-card h2')).toHaveText('留园');
  await page.getByRole('button', {name: '关闭所有地点详情'}).click();
  await search(page, '没有这个地点abcdef');
  await expect(page.getByRole('listbox')).toContainText('未找到地点');
  await input.press('Enter');
  await expect(page.locator('.place-card')).toHaveCount(0);
});

test('favorites survive fresh tabs, ignore category filters and synchronize removal', async ({context, page}) => {
  await start(page);
  const input = await search(page, '苏州博物馆西馆');
  await input.press('Enter');
  await page.getByRole('button', {name: '收藏地点', exact: true}).click();
  await page.getByRole('button', {name: '关闭所有地点详情'}).click();
  const second = await context.newPage();
  await start(second);
  await second.getByRole('button', {name: /我的收藏/}).click();
  const favorites = second.getByRole('region', {name: '本机收藏'});
  await expect(favorites).toContainText('保存在本机浏览器');
  await favorites.getByRole('button', {name: /苏州博物馆西馆/}).click();
  await expect(second.locator('.place-card h2')).toHaveText('苏州博物馆西馆');
  await expect(second.locator('.place-marker[aria-label^="苏州博物馆西馆，"]')).toHaveCount(1);
  await second.getByRole('button', {name: '取消收藏', exact: true}).click();
  await expect(page.getByRole('button', {name: /我的收藏/})).toContainText('0 处');
  await second.getByRole('button', {name: '关闭所有地点详情'}).click();
  await expect(favorites).toContainText('还没有收藏');
  await second.reload();
  await expect(second.getByRole('button', {name: /我的收藏/})).toContainText('0 处');
  await second.close();
});

test('unavailable storage still permits favorites and explains the limitation', async ({context, page}) => {
  await context.addInitScript(() => {
    Object.defineProperty(Storage.prototype, 'setItem', {value() {throw new DOMException('Blocked', 'SecurityError');}});
  });
  await start(page);
  await (await search(page, '留园')).press('Enter');
  await page.getByRole('button', {name: '收藏地点', exact: true}).click();
  await page.getByRole('button', {name: '关闭所有地点详情'}).click();
  await page.getByRole('button', {name: /我的收藏/}).click();
  await expect(page.locator('.favorites-panel')).toContainText('暂不允许持久保存');
  await expect(page.locator('.favorite-place-list')).toContainText('留园');
});

test('mobile long reading keeps close accessible and map navigation restores views', async ({browser}) => {
  const context = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  const page = await context.newPage();
  try {
    await start(page);
    await page.locator('.place-marker[aria-label^="留园，"]').tap();
    await page.locator('.visit-guide').scrollIntoViewIfNeeded();
    const close = page.getByRole('button', {name: '关闭所有地点详情'});
    const box = await close.boundingBox();
    expect(box.y).toBeGreaterThan(0);
    expect(box.y + box.height).toBeLessThan(844);
    await close.tap();
    await expect(page.locator('.place-sidebar')).toHaveCount(0);
    await expect.poll(() => page.locator('.place-marker[aria-label^="留园，"]').evaluate(e => {
      const point = e.getBoundingClientRect(), map = document.querySelector('.map-viewport').getBoundingClientRect();
      return Math.hypot((point.left + point.right - map.left - map.right) / 2, (point.top + point.bottom - map.top - map.bottom) / 2);
    })).toBeLessThan(30);
    await page.getByRole('button', {name: '查看苏州全域'}).tap();
    await expect(page.locator('.map-zoom-controls span')).toHaveText('1.0×');
    await expect(page.locator('.district-layer')).toHaveAttribute('transform', 'translate(0 0) scale(1)');
    await page.getByRole('button', {name: '回到姑苏，15倍视野'}).tap();
    await expect(page.locator('.map-zoom-controls span')).toHaveText('15.0×');
    await expect(page.locator('.place-marker[aria-label^="留园，"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({path: 'outputs/iteration-mobile.png'});
  } finally { await context.close(); }
});
