// 주간/월간 다이제스트를 이메일로 보낸다.
// 사용법: node send-digest-mail.js <다이제스트 폴더 경로> <라벨(예: 주간/월간)>

const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

process.loadEnvFile(path.join(__dirname, '.env'));

const digestDir = process.argv[2];
const label = process.argv[3] || '다이제스트';

if (!digestDir) {
  console.error('사용법: node send-digest-mail.js <다이제스트 폴더 경로> <라벨>');
  process.exit(1);
}

const pdfPath = path.join(digestDir, 'draft_final.pdf');
const mdPath = path.join(digestDir, 'draft_final.md');

if (!fs.existsSync(pdfPath) || !fs.existsSync(mdPath)) {
  console.error(`오류: ${digestDir} 에 draft_final.pdf 또는 draft_final.md 가 없습니다.`);
  process.exit(1);
}

const mdText = fs.readFileSync(mdPath, 'utf-8');
const titleLine = mdText.split(/\r?\n/).find((l) => l.startsWith('# '));
const title = titleLine ? titleLine.replace(/^#\s*/, '').trim() : `${label} 다이제스트`;

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
    subject: `[${label} 다이제스트] ${title}`,
    text: bodyText,
    attachments: [
      {
        filename: `${path.basename(digestDir)}-${label}다이제스트.pdf`,
        path: pdfPath,
      },
    ],
  });

  console.log(`${label} 다이제스트 메일 전송 완료: ${process.env.EMAIL_TO}`);
}

main().catch((err) => {
  console.error(`메일 전송 실패: ${err.message}`);
  process.exit(1);
});
