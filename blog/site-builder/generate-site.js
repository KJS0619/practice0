// blog/posts, blog/digests 의 발행물들을 정적 웹사이트(blog/site/)로 만든다.
// 사용법: node generate-site.js

const fs = require('fs');
const path = require('path');

const BLOG_ROOT = path.join(__dirname, '..');
const SITE_DIR = path.join(BLOG_ROOT, 'site');
const POSTS_DIR = path.join(BLOG_ROOT, 'posts');
const DIGESTS_WEEKLY_DIR = path.join(BLOG_ROOT, 'digests', 'weekly');
const DIGESTS_MONTHLY_DIR = path.join(BLOG_ROOT, 'digests', 'monthly');

// ── 아주 작은 마크다운 -> HTML 변환기 (우리 파이프라인이 실제로 쓰는 문법만 지원) ──
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inline(text) {
  let t = escapeHtml(text);
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return t;
}

function mdToHtml(md) {
  const lines = md.split(/\r?\n/);
  let html = '';
  let para = [];
  let list = [];

  function flushPara() {
    if (para.length) {
      html += `<p>${para.join(' ')}</p>\n`;
      para = [];
    }
  }
  function flushList() {
    if (list.length) {
      html += `<ul>${list.map((li) => `<li>${li}</li>`).join('')}</ul>\n`;
      list = [];
    }
  }

  for (const raw of lines) {
    const line = raw.trim();

    if (line === '') { flushPara(); flushList(); continue; }
    if (line === '---') { flushPara(); flushList(); html += '<hr>\n'; continue; }

    if (/^#\S/.test(line)) { // "#태그1 #태그2" 형태의 해시태그 줄 (헤딩은 항상 "# " 처럼 공백 포함)
      flushPara(); flushList();
      html += `<div class="tags">${escapeHtml(line)}</div>\n`;
      continue;
    }
    if (line.startsWith('## ')) { flushPara(); flushList(); html += `<h2>${inline(line.slice(3))}</h2>\n`; continue; }
    if (line.startsWith('# ')) { flushPara(); flushList(); html += `<h1>${inline(line.slice(2))}</h1>\n`; continue; }

    const img = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (img) { flushPara(); flushList(); html += `<img src="${img[2]}" alt="${escapeHtml(img[1])}">\n`; continue; }

    if (line.startsWith('> ')) { flushPara(); flushList(); html += `<blockquote>${inline(line.slice(2))}</blockquote>\n`; continue; }
    if (line.startsWith('- ')) { flushPara(); list.push(inline(line.slice(2))); continue; }

    para.push(inline(line));
  }
  flushPara();
  flushList();
  return html;
}

// ── 공통 페이지 셸 ──
function pageShell(title, bodyHtml, backLink) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${SITE_CSS}
</style>
</head>
<body>
<div class="page">
${backLink ? `<a class="back" href="${backLink}">← 목록으로</a>` : ''}
${bodyHtml}
</div>
</body>
</html>
`;
}

const SITE_CSS = `
:root {
  --bg: #f6f4ee; --surface: #ffffff; --border: #e3ddcf;
  --text: #23242b; --muted: #6f7686; --accent: #a9720f; --accent-soft: #f1e2c2;
  --font-display: Georgia, "Iowan Old Style", serif;
  --font-body: -apple-system, "Segoe UI", "Malgun Gothic", sans-serif;
  --font-mono: ui-monospace, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root { --bg:#14161c; --surface:#1c1f27; --border:#2b2f3a; --text:#eef0f4; --muted:#8d94a6; --accent:#d9a441; --accent-soft:#3a301b; }
}
:root[data-theme="dark"] { --bg:#14161c; --surface:#1c1f27; --border:#2b2f3a; --text:#eef0f4; --muted:#8d94a6; --accent:#d9a441; --accent-soft:#3a301b; }
:root[data-theme="light"] { --bg:#f6f4ee; --surface:#ffffff; --border:#e3ddcf; --text:#23242b; --muted:#6f7686; --accent:#a9720f; --accent-soft:#f1e2c2; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--text); font-family:var(--font-body); line-height:1.7; }
.page { max-width: 760px; margin: 0 auto; padding: 48px 22px 80px; }
h1 { font-family: var(--font-display); font-size: 30px; margin: 0 0 10px; text-wrap: balance; }
h2 { font-family: var(--font-display); font-size: 20px; margin: 28px 0 10px; border-left: 4px solid var(--accent); padding-left: 10px; }
p { margin: 0 0 14px; }
img { max-width: 100%; border-radius: 8px; margin: 14px 0; display: block; }
code { font-family: var(--font-mono); background: var(--accent-soft); padding: 1px 6px; border-radius: 4px; font-size: 0.9em; }
blockquote { background: var(--surface); border-left: 4px solid var(--accent); padding: 12px 16px; margin: 18px 0; font-weight: 600; }
hr { border: none; border-top: 1px solid var(--border); margin: 24px 0; }
.tags { margin-top: 20px; color: var(--accent); font-size: 13px; line-height: 1.9; }
.back { display:inline-block; margin-bottom: 24px; color: var(--muted); text-decoration:none; font-size: 14px; }
.back:hover { color: var(--accent); }
a { color: var(--accent); }
.site-header { margin-bottom: 36px; }
.site-header .eyebrow { font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); margin-bottom: 8px; }
.site-header h1 { margin: 0; }
.site-header p { color: var(--muted); margin-top: 8px; }
.list-group { margin-bottom: 36px; }
.list-group h2 { margin-top: 0; }
.entry { display: block; padding: 16px 0; border-top: 1px solid var(--border); text-decoration: none; color: inherit; }
.entry:first-child { border-top: none; }
.entry .date { font-family: var(--font-mono); font-size: 12px; color: var(--accent); margin-bottom: 4px; }
.entry .title { font-weight: 700; font-size: 16px; }
.entry .excerpt { color: var(--muted); font-size: 13.5px; margin-top: 4px; }
.entry:hover .title { color: var(--accent); }
.site-footer { margin-top: 48px; padding-top: 20px; border-top: 1px solid var(--border); color: var(--muted); font-size: 13px; }
`;

function extractTitle(md) {
  const line = md.split(/\r?\n/).find((l) => l.startsWith('# '));
  return line ? line.replace(/^#\s*/, '').trim() : '(제목 없음)';
}

function extractExcerpt(md) {
  const lines = md.split(/\r?\n/);
  let seenTitle = false;
  for (const l of lines) {
    if (l.startsWith('# ')) { seenTitle = true; continue; }
    const t = l.trim();
    if (seenTitle && t && !t.includes('·') && !t.startsWith('![') && !t.startsWith('#')) {
      return t.length > 90 ? t.slice(0, 90) + '…' : t;
    }
  }
  return '';
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function buildEntry(sourceDir, outDir, urlPath) {
  const mdPath = path.join(sourceDir, 'draft_final.md');
  if (!fs.existsSync(mdPath)) return null;
  const md = fs.readFileSync(mdPath, 'utf-8');
  const title = extractTitle(md);
  const excerpt = extractExcerpt(md);

  fs.mkdirSync(outDir, { recursive: true });
  copyDir(path.join(sourceDir, 'images'), path.join(outDir, 'images'));
  fs.writeFileSync(
    path.join(outDir, 'index.html'),
    pageShell(title, mdToHtml(md), '/'),
    'utf-8'
  );

  return { title, excerpt, url: urlPath };
}

function main() {
  // .vercel/ (프로젝트 연결 정보)만 남기고 나머지를 깨끗이 비운다 —
  // 통째로 지우면 매번 새 Vercel 프로젝트로 배포되어 버린다.
  fs.mkdirSync(SITE_DIR, { recursive: true });
  for (const name of fs.readdirSync(SITE_DIR)) {
    if (name === '.vercel') continue;
    fs.rmSync(path.join(SITE_DIR, name), { recursive: true, force: true });
  }

  // 일일 발행물
  const dailyEntries = [];
  if (fs.existsSync(POSTS_DIR)) {
    for (const name of fs.readdirSync(POSTS_DIR).sort().reverse()) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(name)) continue;
      const entry = buildEntry(
        path.join(POSTS_DIR, name),
        path.join(SITE_DIR, 'posts', name),
        `/posts/${name}/`
      );
      if (entry) dailyEntries.push({ ...entry, date: name });
    }
  }

  // 주간 다이제스트
  const weeklyEntries = [];
  if (fs.existsSync(DIGESTS_WEEKLY_DIR)) {
    for (const name of fs.readdirSync(DIGESTS_WEEKLY_DIR).sort().reverse()) {
      const entry = buildEntry(
        path.join(DIGESTS_WEEKLY_DIR, name),
        path.join(SITE_DIR, 'digests', 'weekly', name),
        `/digests/weekly/${name}/`
      );
      if (entry) weeklyEntries.push({ ...entry, date: name });
    }
  }

  // 월간 다이제스트
  const monthlyEntries = [];
  if (fs.existsSync(DIGESTS_MONTHLY_DIR)) {
    for (const name of fs.readdirSync(DIGESTS_MONTHLY_DIR).sort().reverse()) {
      const entry = buildEntry(
        path.join(DIGESTS_MONTHLY_DIR, name),
        path.join(SITE_DIR, 'digests', 'monthly', name),
        `/digests/monthly/${name}/`
      );
      if (entry) monthlyEntries.push({ ...entry, date: name });
    }
  }

  function renderGroup(title, entries) {
    if (!entries.length) return '';
    const items = entries
      .map(
        (e) => `<a class="entry" href="${e.url}">
          <div class="date">${e.date}</div>
          <div class="title">${escapeHtml(e.title)}</div>
          ${e.excerpt ? `<div class="excerpt">${escapeHtml(e.excerpt)}</div>` : ''}
        </a>`
      )
      .join('\n');
    return `<div class="list-group"><h2>${title}</h2>${items}</div>`;
  }

  const indexBody = `
    <header class="site-header">
      <div class="eyebrow">practice0</div>
      <h1>자동으로 쌓이는 블로그</h1>
      <p>매일 아침 뉴스와 소식을 재료로 자동 발행되는 글 모음입니다.</p>
    </header>
    ${renderGroup('최근 발행', dailyEntries)}
    ${renderGroup('주간 다이제스트', weeklyEntries)}
    ${renderGroup('월간 다이제스트', monthlyEntries)}
    <footer class="site-footer">practice0 · 매일 자동 생성</footer>
  `;

  fs.writeFileSync(path.join(SITE_DIR, 'index.html'), pageShell('practice0 블로그', indexBody, null), 'utf-8');

  console.log(`사이트 생성 완료: ${SITE_DIR}`);
  console.log(`- 일일 발행: ${dailyEntries.length}개`);
  console.log(`- 주간 다이제스트: ${weeklyEntries.length}개`);
  console.log(`- 월간 다이제스트: ${monthlyEntries.length}개`);
}

main();
