import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });

  await page.goto('http://127.0.0.1:8000', { waitUntil: 'networkidle0' });

  // Handle all dialogs automatically
  page.on('dialog', async dialog => {
    console.log("Dialog message:", dialog.message());
    await dialog.accept();
  });

  // Switch to Setup tab
  await page.evaluate(() => {
    document.querySelector('[data-view="setup-view"]').click();
  });
  
  // Enter password
  await page.type('#auth-password-input', 'staff123');
  await page.click('#btn-auth-submit');
  await page.waitForTimeout(500);

  // Uncheck shuffle
  await page.evaluate(() => {
    document.getElementById('setup-random-shuffle').checked = false;
  });

  // Enter players
  const playersStr = `盧彥勳,0912000001,男子單打 (Open),網球經典排汗衫
曾俊欣,0912000002,男子單打 (Open),精美運動毛巾
許育修,0912000003,男子單打 (Open),網球經典排汗衫
莊吉生,0912000004,男子單打 (Open),精美運動毛巾
吳東霖,0912000005,男子單打 (Open),網球經典排汗衫
楊宗樺,0912000006,男子單打 (Open),精美運動毛巾
王宇佐,0912000007,男子單打 (Open),網球經典排汗衫
李冠毅,0912000008,男子單打 (Open),精美運動毛巾
費德勒 (Federer),0912000009,男子單打 (Open),網球經典排汗衫
納達爾 (Nadal),0912000010,男子單打 (Open),精美運動毛巾
喬科維奇 (Djokovic),0912000011,男子單打 (Open),網球經典排汗衫
莫瑞 (Murray),0912000012,男子單打 (Open),精美運動毛巾
阿卡拉茲 (Alcaraz),0912000013,男子單打 (Open),網球經典排汗衫
辛納 (Sinner),0912000014,男子單打 (Open),精美運動毛巾
梅德維傑夫 (Medvedev),0912000015,男子單打 (Open),網球經典排汗衫
茲維列夫 (Zverev),0912000016,男子單打 (Open),精美運動毛巾`;
  await page.type('#setup-player-import', playersStr);

  // Click import
  await page.click('#btn-import-players');
  await page.waitForTimeout(1000);

  // Switch to Player Hub -> Brackets tab
  await page.evaluate(() => {
    document.querySelector('[data-view="player-view"]').click();
  });
  await page.waitForTimeout(500);
  
  await page.evaluate(() => {
    document.getElementById('tab-brackets').click();
  });
  await page.waitForTimeout(1000);

  // Select "男子單打 (Open)" if needed
  await page.select('#player-bracket-event-select', '男子單打 (Open)');
  await page.waitForTimeout(500);

  // Take screenshot
  await page.screenshot({ path: 'bracket-screenshot.png', fullPage: true });
  console.log("Screenshot taken.");
  
  await browser.close();
})();
