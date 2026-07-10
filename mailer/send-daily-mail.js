// 오늘(또는 지정한 날짜)의 블로그 발행물을 이메일로 보낸다.
// 사용법: node send-daily-mail.js [YYYY-MM-DD]

const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

process.loadEnvFile(path.join(__dirname, '.env'));

const date = process.argv[2] || new Date().toLocaleDateString('sv-SE'); // sv-SE => YYYY-MM-DD
const postDir = path.join('D:\\workspace\\practice0\\blog\\posts', date);
const pdfPath = path.join(postDir, 'draft_final.pdf');
const mdPath = path.join(postDir, 'draft_final.md');

if (!fs.existsSync(pdfPath) || !fs.existsSync(mdPath)) {
  console.error(`오류: ${postDir} 에 draft_final.pdf 또는 draft_final.md 가 없습니다.`);
  process.exit(1);
}

const mdText = fs.readFileSync(mdPath, 'utf-8');
const titleLine = mdText.split(/\r?\n/).find((l) => l.startsWith('# '));
const title = titleLine ? titleLine.replace(/^#\s*/, '').trim() : `블로그 발행물 ${date}`;

// 메일 본문용으로 마크다운 기호를 가볍게 정리 (이미지 마크다운, 강조기호 등)
const postBodyText = mdText
  .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  .replace(/^#+\s*/gm, '')
  .replace(/`/g, '')
  .trim();

// 뉴스 워처가 만든 그날의 브리핑(날씨·증시·Anthropic 소식)을 메일 맨 위에 함께 넣는다
const newsBriefPath = path.join('C:\\Users\\user\\Desktop\\news', `news_${date}.txt`);
let briefText = '';
if (fs.existsSync(newsBriefPath)) {
  briefText = fs.readFileSync(newsBriefPath, 'utf-8').trim();
} else {
  briefText = '(오늘의 날씨·증시 브리핑 파일을 찾지 못했습니다)';
}

const bodyText = `${briefText}\n\n${'='.repeat(40)}\n\n${postBodyText}`;

// 날씨 카드 이미지가 있으면 메일 본문 맨 위에 인라인으로 넣는다
const weatherImgPath = path.join('C:\\Users\\user\\Desktop\\news', `weather_${date}.png`);
const hasWeatherImg = fs.existsSync(weatherImgPath);

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const htmlBody = `
${hasWeatherImg ? '<img src="cid:weathercard" alt="오늘의 날씨" style="max-width:100%;border-radius:8px;margin-bottom:16px;"><br>' : ''}
<pre style="font-family:inherit;white-space:pre-wrap;">${escapeHtml(bodyText)}</pre>
`;

async function main() {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
  });

  const attachments = [
    {
      filename: `${date}-${path.basename(postDir)}.pdf`,
      path: pdfPath,
    },
  ];
  if (hasWeatherImg) {
    attachments.push({
      filename: `weather_${date}.png`,
      path: weatherImgPath,
      cid: 'weathercard',
    });
  }

  await transporter.sendMail({
    from: `"블로그 자동발행" <${process.env.EMAIL_USER}>`,
    to: process.env.EMAIL_TO,
    subject: `[오늘의 브리핑+블로그] ${title} (${date})`,
    text: bodyText,
    html: htmlBody,
    attachments,
  });

  console.log(`메일 전송 완료: ${process.env.EMAIL_TO} (${date})${hasWeatherImg ? ' (날씨 카드 포함)' : ''}`);
}

main().catch((err) => {
  console.error(`메일 전송 실패: ${err.message}`);
  process.exit(1);
});
