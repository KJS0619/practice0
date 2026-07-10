// 주간/월간 다이제스트를 텔레그램으로 보낸다 (문단 단위 분할, 4096자 한도 대응).
// 사용법: node send-digest-telegram.js <다이제스트 폴더 경로> <라벨(예: 주간/월간)>

const path = require('path');
const fs = require('fs');

process.loadEnvFile(path.join(__dirname, '..', 'telegram-bridge', '.env'));

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = 8398650353;
const digestDir = process.argv[2];
const label = process.argv[3] || '다이제스트';

if (!TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN이 telegram-bridge/.env에 없습니다.');
  process.exit(1);
}
if (!digestDir) {
  console.error('사용법: node send-digest-telegram.js <다이제스트 폴더 경로> <라벨>');
  process.exit(1);
}

const mdPath = path.join(digestDir, 'draft_final.md');
const TELEGRAM_LIMIT = 3900;

async function sendMessage(text) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`텔레그램 전송 실패: ${JSON.stringify(json)}`);
}

async function sendLong(text) {
  const paragraphs = text.split(/\n\n+/);
  let chunk = '';
  for (const para of paragraphs) {
    const candidate = chunk ? `${chunk}\n\n${para}` : para;
    if (candidate.length > TELEGRAM_LIMIT) {
      if (chunk) await sendMessage(chunk);
      chunk = para.length > TELEGRAM_LIMIT ? para.slice(0, TELEGRAM_LIMIT) : para;
    } else {
      chunk = candidate;
    }
  }
  if (chunk) await sendMessage(chunk);
}

async function main() {
  if (!fs.existsSync(mdPath)) {
    console.log(`다이제스트 글 없음, 건너뜀: ${mdPath}`);
    return;
  }
  const mdText = fs.readFileSync(mdPath, 'utf-8');
  const postText = mdText
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/`/g, '')
    .trim();
  await sendLong(`🗞️ [${label} 다이제스트]\n\n${postText}`);
  console.log(`${label} 다이제스트 텔레그램 전송 완료`);
}

main().catch((err) => {
  console.error(`전송 실패: ${err.message}`);
  process.exit(1);
});
