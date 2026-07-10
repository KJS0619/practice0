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
const bodyText = mdText
  .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  .replace(/^#+\s*/gm, '')
  .replace(/`/g, '')
  .trim();

async function main() {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: `"블로그 자동발행" <${process.env.EMAIL_USER}>`,
    to: process.env.EMAIL_TO,
    subject: `[블로그] ${title} (${date})`,
    text: bodyText,
    attachments: [
      {
        filename: `${date}-${path.basename(postDir)}.pdf`,
        path: pdfPath,
      },
    ],
  });

  console.log(`메일 전송 완료: ${process.env.EMAIL_TO} (${date})`);
}

main().catch((err) => {
  console.error(`메일 전송 실패: ${err.message}`);
  process.exit(1);
});
