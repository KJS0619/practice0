// 오늘(또는 지정한 날짜)의 뉴스 브리핑 + 블로그 발행물을 텔레그램으로 보낸다.
// 메일과 달리 텔레그램 4096자 제한 때문에, "브리핑"과 "블로그 글"을 각각 별도 메시지로 나눠 보낸다.
// 사용법: node send-daily-telegram.js [YYYY-MM-DD]

const path = require('path');
const fs = require('fs');

process.loadEnvFile(path.join(__dirname, '..', 'telegram-bridge', '.env'));

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = 8398650353;
if (!TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN이 telegram-bridge/.env에 없습니다.');
  process.exit(1);
}

const date = process.argv[2] || new Date().toLocaleDateString('sv-SE');
const briefPath = path.join('C:\\Users\\user\\Desktop\\news', `news_${date}.txt`);
const postDir = path.join('D:\\workspace\\practice0\\blog\\posts', date);
const mdPath = path.join(postDir, 'draft_final.md');

const TELEGRAM_LIMIT = 3900; // 4096자 한도에 여유를 둠

async function sendMessage(text) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`텔레그램 전송 실패: ${JSON.stringify(json)}`);
}

async function sendPhoto(photoPath, caption) {
  const form = new FormData();
  form.append('chat_id', String(CHAT_ID));
  if (caption) form.append('caption', caption);
  form.append('photo', new Blob([fs.readFileSync(photoPath)]), path.basename(photoPath));

  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendPhoto`, {
    method: 'POST',
    body: form,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`텔레그램 사진 전송 실패: ${JSON.stringify(json)}`);
}

// 문단(빈 줄) 단위로 쪼개서, 한도를 넘기지 않는 선에서 여러 메시지로 나눈다.
// (단순 글자수 절단과 달리 문장/문단 중간이 끊기지 않는다.)
async function sendLong(text) {
  const paragraphs = text.split(/\n\n+/);
  let chunk = '';
  for (const para of paragraphs) {
    const candidate = chunk ? `${chunk}\n\n${para}` : para;
    if (candidate.length > TELEGRAM_LIMIT) {
      if (chunk) await sendMessage(chunk);
      // 문단 하나 자체가 한도를 넘는 극단적인 경우만 강제 절단
      chunk = para.length > TELEGRAM_LIMIT ? para.slice(0, TELEGRAM_LIMIT) : para;
    } else {
      chunk = candidate;
    }
  }
  if (chunk) await sendMessage(chunk);
}

async function main() {
  const weatherImgPath = path.join('C:\\Users\\user\\Desktop\\news', `weather_${date}.png`);
  if (fs.existsSync(weatherImgPath)) {
    await sendPhoto(weatherImgPath, `🌤️ 오늘의 날씨 (${date})`);
    console.log('날씨 카드 전송 완료');
  } else {
    console.log(`날씨 카드 없음, 건너뜀: ${weatherImgPath}`);
  }

  if (fs.existsSync(briefPath)) {
    const brief = fs.readFileSync(briefPath, 'utf-8').trim();
    await sendLong(`📋 ${brief}`);
    console.log('브리핑 전송 완료');
  } else {
    console.log(`브리핑 파일 없음, 건너뜀: ${briefPath}`);
  }

  if (fs.existsSync(mdPath)) {
    const mdText = fs.readFileSync(mdPath, 'utf-8');
    const postText = mdText
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/^#+\s*/gm, '')
      .replace(/`/g, '')
      .trim();
    await sendLong(`📝 ${postText}`);
    console.log('블로그 글 전송 완료');
  } else {
    console.log(`블로그 글 없음, 건너뜀: ${mdPath}`);
  }
}

main().catch((err) => {
  console.error(`전송 실패: ${err.message}`);
  process.exit(1);
});
