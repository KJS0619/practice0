// 뉴스 워처가 저장한 weather-data.json을 읽어 날씨 카드 이미지를 만든다.
// 사용법: node render-weather-card.js [YYYY-MM-DD]

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const date = process.argv[2] || new Date().toLocaleDateString('sv-SE');
const dataPath = path.join('C:\\Users\\user\\Desktop\\news', `weather-data_${date}.json`);
const outPath = path.join('C:\\Users\\user\\Desktop\\news', `weather_${date}.png`);
const templatePath = path.join(__dirname, 'templates', 'weather-card.html');

if (!fs.existsSync(dataPath)) {
  console.error(`오류: ${dataPath} 가 없습니다. 뉴스 워처가 날씨 데이터를 먼저 저장해야 합니다.`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fill(html, fields) {
  for (const [key, value] of Object.entries(fields)) {
    html = html.split(`{{${key}}}`).join(escapeHtml(value));
  }
  return html.replace(/\{\{[A-Z_]+\}\}/g, '');
}

async function main() {
  let html = fs.readFileSync(templatePath, 'utf-8');
  html = fill(html, {
    REGION: data.region,
    TEMP: data.temp,
    TEMP_MIN: data.tempMin,
    TEMP_MAX: data.tempMax,
    RAIN: data.rain,
    DUST: data.dust,
    DATE: data.date || date,
  });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 560 }, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.screenshot({ path: outPath });
  await browser.close();

  console.log(`날씨 카드 저장 완료: ${outPath}`);
}

main().catch((err) => {
  console.error(`날씨 카드 생성 실패: ${err.message}`);
  process.exit(1);
});
