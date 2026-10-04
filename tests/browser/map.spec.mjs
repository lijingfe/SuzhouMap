import {test,expect} from '@playwright/test';
async function start(page){
 await page.goto('./');
 await expect(page.locator('.map-viewport')).toBeVisible();
 const intro=page.locator('.intro-start');
 if(await intro.isVisible())await intro.click();
 await expect(page.locator('.map-detail-status')).toHaveCount(0);
}
async function openPlace(page,name){
 const expand=page.getByRole('button',{name:'展开地图面板',exact:true});
 if(await expand.isVisible())await expand.click();
 await page.getByRole('combobox',{name:'搜索苏州地点'}).fill(name);
 await page.locator('.search-results button').filter({has:page.locator('strong',{hasText:new RegExp('^'+name+'$')})}).click();
 await expect(page.locator('.place-card h2').filter({hasText:new RegExp('^'+name+'$')})).toBeVisible();
}
for(const width of [320,390,768,1024,1440]){
 test('responsive controls and complete detail flow at '+width,async({browser})=>{
  const mobile=width<1024;
  const context=await browser.newContext({viewport:{width,height:844},isMobile:mobile,hasTouch:mobile});
  const page=await context.newPage(), errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await start(page);
  expect(await page.locator('.explorer-controls').evaluate(e=>e.classList.contains('is-collapsed'))).toBe(mobile);
  expect(requests.some(u=>/\/data\/basemap\.json/.test(u))).toBe(false);
  expect(requests.some(u=>u.includes('/data/map/overview-'))).toBe(true);
  if(mobile)await page.getByRole('button',{name:'展开地图面板'}).click();
  await expect(page.locator('.transit-filter')).toContainText('已选 0/9');
  await page.locator('.transit-filter').getByRole('button',{name:'全选',exact:true}).click();
  await expect(page.locator('.transit-filter')).toContainText('已选 9/9');
  await page.locator('.transit-filter').getByRole('button',{name:'隐藏全部',exact:true}).click();
  await page.getByRole('button',{name:'显示精简地点',exact:true}).click();
  await expect(page.getByRole('button',{name:'显示更多地点',exact:true})).toBeVisible();
  await openPlace(page,'留园');
  const first=page.locator('.place-card').filter({has:page.getByRole('heading',{name:'留园',exact:true})});
  await first.getByRole('button',{name:'收藏地点',exact:true}).click();
  await expect(first.getByRole('button',{name:'取消收藏',exact:true})).toBeVisible();
  await expect.poll(()=>first.locator('img').evaluate(e=>e.complete && e.naturalWidth>0)).toBe(true);
  if(mobile){
   await page.getByRole('button',{name:'全屏阅读',exact:true}).click();
   expect((await page.locator('.place-sidebar').boundingBox()).height).toBeGreaterThan(650);
   await first.locator('.visit-guide').scrollIntoViewIfNeeded();
   await expect(first.locator('.visit-guide')).toContainText('冠云峰');
   await page.screenshot({path:'outputs/detail-'+width+'.png'});
   await page.getByRole('button',{name:'半屏',exact:true}).click();
   await page.getByRole('button',{name:'收起详情',exact:true}).click();
   await expect(page.locator('.sidebar-cards')).toBeHidden();
   await page.getByRole('button',{name:'显示详情',exact:true}).click();
  }
  await openPlace(page,'拙政园');
  await page.getByRole('button',{name:'交通比较',exact:true}).click();
  await page.locator('.traffic-place-list button').filter({hasText:'留园'}).click();
  await page.locator('.traffic-place-list button').filter({hasText:'拙政园'}).click();
  await page.getByRole('button',{name:'生成离线方案',exact:true}).click();
  await expect(page.locator('.traffic-results')).toContainText('驾车参考');
  await page.getByRole('button',{name:'← 返回地点',exact:true}).click();
  await page.getByRole('button',{name:'关闭地点卡片',exact:true}).last().click();
  await page.getByRole('button',{name:'关闭地点卡片',exact:true}).click();
  await expect(page.locator('.place-sidebar')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'outputs/complete-'+width+'.png'});
  expect(errors).toEqual([]);
  await context.close();
 });
}
test('touch drag, pinch, close-center, cache reuse and 100x zoom',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await context.newPage();await start(page);
 const client=await context.newCDPSession(page);
 const touch=async(type,pts)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(([x,y],id)=>({x,y,id}))});
 const before=await page.locator('.district-layer').getAttribute('transform');
 await touch('touchStart',[[180,350]]);await touch('touchMove',[[240,400]]);await touch('touchEnd',[]);
 await expect.poll(()=>page.locator('.district-layer').getAttribute('transform')).not.toBe(before);
 await touch('touchStart',[[160,320],[220,420]]);
 await touch('touchMove',[[120,270],[260,470]]);await touch('touchEnd',[]);
 await expect.poll(async()=>parseFloat(await page.locator('.map-zoom-controls span').innerText())).toBeGreaterThan(15);
 await expect(page.locator('.place-sidebar')).toHaveCount(0);
 await page.waitForTimeout(500);
 await openPlace(page,'留园');await page.waitForTimeout(300);
 await page.getByRole('button',{name:'关闭地点卡片',exact:true}).click();
 await page.waitForTimeout(300);
 const center=await page.locator('.place-marker[aria-label*="留园"]').evaluate(e=>{
  const r=e.getBoundingClientRect(),m=document.querySelector('.map-viewport').getBoundingClientRect();
  return [Math.abs((r.left+r.right)/2-(m.left+m.right)/2),Math.abs((r.top+r.bottom)/2-(m.top+m.bottom)/2)];
 });
 expect(center[0]).toBeLessThan(30);expect(center[1]).toBeLessThan(30);
 for(let i=0;i<20;i++)await page.getByRole('button',{name:'放大地图',exact:true}).click();
 await expect(page.locator('.map-zoom-controls')).toContainText('100.0');
 const beforeReload=[];page.on('request',r=>beforeReload.push(r.url()));
 await page.reload();await expect(page.locator('.map-viewport')).toBeVisible();await expect(page.locator('.map-detail-status')).toHaveCount(0);
 expect(beforeReload.filter(u=>u.includes('/tile-')).length).toBe(0);
 await context.close();
});
test('startup failure offers working retry, including no-Worker fallback',async({browser})=>{
 const context=await browser.newContext();await context.addInitScript(()=>{window.Worker=undefined;});
 let fail=true;await context.route('**/data/map/manifest.json.gz',r=>fail?r.abort():r.continue());
 const page=await context.newPage();await page.goto('./');
 await expect(page.getByRole('button',{name:'重新加载',exact:true})).toBeVisible();
 fail=false;await page.getByRole('button',{name:'重新加载',exact:true}).click();
 await expect(page.locator('.map-viewport')).toBeVisible();
 await context.close();
});
test('real touch tap selects places and regions, cross-category search and landscape stay usable',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await context.newPage();await start(page);
 await page.locator('.place-marker[aria-label*="留园"]').tap();
 await expect(page.locator('.place-card h2')).toHaveText('留园');
 await page.getByRole('button',{name:'关闭地点卡片',exact:true}).tap();
 await page.waitForTimeout(300);
 await page.locator('.map-interaction-layer').tap({position:{x:120,y:450}});
 await expect(page.locator('.region-popup')).toBeVisible();
 await page.getByRole('button',{name:'关闭行政区介绍'}).tap();
 await openPlace(page,'苏州博物馆');await page.waitForTimeout(300);
 await expect(page.locator('.place-marker[aria-label^="苏州博物馆，"]')).toHaveCount(1);
 await page.setViewportSize({width:740,height:360});
 await page.getByRole('button',{name:'全屏阅读'}).tap();
 const box=await page.locator('.place-sidebar').boundingBox();expect(box.y+box.height).toBeLessThanOrEqual(361);
 await page.getByRole('button',{name:'半屏',exact:true}).tap();
 await page.getByRole('button',{name:'关闭地点卡片',exact:true}).tap();
 for(let i=0;i<16;i++)await page.getByRole('button',{name:'缩小地图',exact:true}).click();
 await expect(page.locator('.map-zoom-controls')).toContainText('1.0');
 await expect(page.locator('.map-detail-status')).toHaveCount(0);
 await context.close();
});
