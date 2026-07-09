// 이미지 메이커 v2 — blog/agent/image-maker.md 지침 구현
// 마커 형식: <!-- IMAGE: [설명] -->
// 사용법:
//   node generate.js run      <draft.md>                                이미지 일괄 생성(마커 스캔→썸네일→템플릿선택→캡처)
//   node generate.js redo     <draft.md> <markerId|thumbnail> [DESC="..."] [TEMPLATE=template_x] [REASON="..."]   재생성(검수 실패 시)
//   node generate.js approve  <draft.md> <markerId|thumbnail>            검수 통과 표시(뷰어로 직접 확인한 뒤에만 호출)
//   node generate.js finalize <draft.md>                                 승인된 이미지만 마커를 치환해 draft_final.md 생성 + 완료 보고 출력

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const TEMPLATE_DIR = path.join(__dirname, 'templates');
const MARKER_RE = /<!--\s*IMAGE:\s*\[(.*?)\]\s*-->/g;

const KEYWORDS = {
  template_scene: ['풍경', '장소', '분위기', '공간', '배경', '도시', '거리', '실내', '야외', '자연', '사무실', '바다', '숲', '하늘', '카페'],
  template_info: ['수치', '비교', '통계', '인포그래픽', '퍼센트', '%', '그래프', '데이터', '숫자', '차트', '지표'],
  template_step: ['단계', '순서', '프로세스', '과정', '플로우', '절차', '스텝', 'step', 'Step'],
  template_quote: ['인용', '강조', '문구', '명언', '핵심 메시지', '메시지'],
};

function manifestPath(draftPath) {
  const dir = path.dirname(draftPath);
  return path.join(dir, 'images', 'manifest.json');
}

function loadManifest(draftPath) {
  const p = manifestPath(draftPath);
  if (!fs.existsSync(p)) throw new Error(`매니페스트가 없습니다. 먼저 'run'을 실행하세요: ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function saveManifest(draftPath, manifest) {
  fs.writeFileSync(manifestPath(draftPath), JSON.stringify(manifest, null, 2), 'utf-8');
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fillTemplate(templateName, fields) {
  let html = fs.readFileSync(path.join(TEMPLATE_DIR, `${templateName}.html`), 'utf-8');
  for (const [key, value] of Object.entries(fields)) {
    html = html.split(`{{${key}}}`).join(escapeHtml(value ?? ''));
  }
  return html.replace(/\{\{[A-Z_]+\}\}/g, '');
}

function firstSentence(text, maxLen = 70) {
  if (!text) return '';
  const cut = text.split(/(?<=[.?!])\s/)[0] || text;
  return cut.length > maxLen ? cut.slice(0, maxLen) + '…' : cut;
}

// ── ① 마커 스캔 ──────────────────────────────────────────────────
function scanMarkers(draftMdText) {
  const markers = [];
  let m;
  let id = 0;
  while ((m = MARKER_RE.exec(draftMdText)) !== null) {
    id += 1;
    markers.push({ id, description: m[1].trim(), raw: m[0], index: m.index });
  }
  return markers;
}

function extractTitle(draftMdText) {
  const line = draftMdText.split(/\r?\n/).find((l) => l.startsWith('# '));
  return line ? line.replace(/^#\s*/, '').trim() : 'Untitled';
}

function extractMoodText(draftMdText) {
  const lines = draftMdText.split(/\r?\n/);
  let seenTitle = false;
  for (const l of lines) {
    if (l.startsWith('# ')) { seenTitle = true; continue; }
    const t = l.trim();
    if (seenTitle && t && !t.includes('·') && !t.startsWith('<!--')) return t;
  }
  return '';
}

// ── ③ 설명 → 템플릿 분류 ─────────────────────────────────────────
function classifyTemplate(description) {
  for (const [tpl, words] of Object.entries(KEYWORDS)) {
    if (words.some((w) => description.includes(w))) return tpl;
  }
  return 'template_default';
}

function buildFields(template, description) {
  if (template === 'template_scene') {
    return { KICKER: 'SCENE', CAPTION: firstSentence(description, 60) };
  }
  if (template === 'template_info') {
    const statMatch = description.match(/(\d+[%가지개년월단계배]?)/);
    return { KICKER: 'INFO', STAT: statMatch ? statMatch[1] : '#', LABEL: firstSentence(description, 50) };
  }
  if (template === 'template_step') {
    const numMatch = description.match(/(\d+)\s*(?:단계|번째|step|Step)/);
    return { KICKER: 'STEP', NUMBER: numMatch ? numMatch[1].padStart(2, '0') : '•', TITLE: firstSentence(description, 50) };
  }
  if (template === 'template_quote') {
    return { KICKER: 'QUOTE', QUOTE: firstSentence(description, 60) };
  }
  return { TITLE: firstSentence(description, 60) };
}

async function capture(template, fields, outFile) {
  const html = fillTemplate(template, fields);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.screenshot({ path: outFile });
  await browser.close();
}

// ── run: ①②③④ ───────────────────────────────────────────────────
async function run(draftPath) {
  const draftDir = path.dirname(draftPath);
  const imagesDir = path.join(draftDir, 'images');
  fs.mkdirSync(imagesDir, { recursive: true });

  const text = fs.readFileSync(draftPath, 'utf-8');
  const title = extractTitle(text);
  const mood = extractMoodText(text);
  const markers = scanMarkers(text);

  console.log(`마커 ${markers.length}개 발견:`);
  markers.forEach((m) => console.log(`  #${m.id}: ${m.description}`));

  const manifest = {
    draft: path.resolve(draftPath),
    generatedAt: new Date().toISOString(),
    thumbnail: null,
    markers: [],
  };

  // ② 썸네일 먼저 생성
  const thumbFields = { KICKER: 'THUMBNAIL', TITLE: title, SUBTITLE: firstSentence(mood, 70) };
  const thumbFile = path.join(imagesDir, 'thumbnail.png');
  await capture('thumbnail', thumbFields, thumbFile);
  manifest.thumbnail = {
    template: 'thumbnail', fields: thumbFields,
    file: path.relative(draftDir, thumbFile).replace(/\\/g, '/'),
    approved: false, regenCount: 0, regenReasons: [],
  };
  console.log(`[썸네일] ${manifest.thumbnail.file}`);

  // ③④ 마커별 템플릿 선택 + 캡처
  for (const marker of markers) {
    const template = classifyTemplate(marker.description);
    const fields = buildFields(template, marker.description);
    const file = path.join(imagesDir, `img_${marker.id}.png`);
    await capture(template, fields, file);
    manifest.markers.push({
      id: marker.id,
      description: marker.description,
      template,
      fields,
      file: path.relative(draftDir, file).replace(/\\/g, '/'),
      approved: false,
      regenCount: 0,
      regenReasons: [],
    });
    console.log(`[마커 #${marker.id}] "${marker.description}" -> ${template} -> ${path.relative(draftDir, file)}`);
  }

  saveManifest(draftPath, manifest);
  console.log(`\n매니페스트 저장: ${manifestPath(draftPath)}`);
  console.log('다음 단계: 이미지를 뷰어로 직접 열어 4가지 기준(텍스트 잘림 / 대비·가독성 / 설명 일치 / 해상도)으로 검수하세요.');
  console.log('  - 통과: node generate.js approve  <draft.md> <markerId|thumbnail>');
  console.log('  - 실패: node generate.js redo     <draft.md> <markerId|thumbnail> REASON="..." [DESC="..."] [TEMPLATE=template_x]');
  console.log('전체 승인 후: node generate.js finalize <draft.md>');
}

function findEntry(manifest, targetId) {
  if (targetId === 'thumbnail') return { entry: manifest.thumbnail, label: 'thumbnail' };
  const entry = manifest.markers.find((m) => String(m.id) === String(targetId));
  return { entry, label: `#${targetId}` };
}

// ── redo: ⑤ 검수 실패 시 재생성 ────────────────────────────────────
async function redo(draftPath, targetId, args) {
  const manifest = loadManifest(draftPath);
  const draftDir = path.dirname(draftPath);
  const { entry, label } = findEntry(manifest, targetId);
  if (!entry) throw new Error(`대상을 찾을 수 없습니다: ${targetId}`);

  const overrides = {};
  let reason = '검수 실패로 재생성';
  let newDescription = null;
  for (const arg of args) {
    const eq = arg.indexOf('=');
    if (eq === -1) continue;
    const key = arg.slice(0, eq);
    const value = arg.slice(eq + 1).replace(/^"|"$/g, '');
    if (key === 'REASON') reason = value;
    else if (key === 'DESC') newDescription = value;
    else if (key === 'TEMPLATE') entry.template = value;
    else overrides[key] = value;
  }

  if (targetId === 'thumbnail') {
    entry.fields = { ...entry.fields, ...overrides };
  } else {
    if (newDescription) entry.description = newDescription;
    entry.fields = { ...buildFields(entry.template, entry.description), ...overrides };
  }

  const outFile = path.join(draftDir, entry.file);
  await capture(entry.template, entry.fields, outFile);
  entry.approved = false;
  entry.regenCount += 1;
  entry.regenReasons.push(reason);

  saveManifest(draftPath, manifest);
  console.log(`재생성 완료 (${label}, ${entry.regenCount}회차): ${entry.file}`);
  console.log('다시 뷰어로 검수한 뒤 approve 하세요.');
}

// ── approve: ⑤ 검수 통과 표시 ───────────────────────────────────────
function approve(draftPath, targetId) {
  const manifest = loadManifest(draftPath);
  const { entry, label } = findEntry(manifest, targetId);
  if (!entry) throw new Error(`대상을 찾을 수 없습니다: ${targetId}`);
  entry.approved = true;
  saveManifest(draftPath, manifest);
  console.log(`승인 완료: ${label} -> ${entry.file}`);
}

// ── finalize: ⑥⑦ 승인된 이미지만 치환 + 완료 보고 ────────────────────
function finalize(draftPath) {
  const manifest = loadManifest(draftPath);
  const pending = [];
  if (!manifest.thumbnail.approved) pending.push('thumbnail');
  for (const m of manifest.markers) if (!m.approved) pending.push(`#${m.id}`);

  if (pending.length > 0) {
    throw new Error(
      `검수를 통과하지 못한 이미지가 있어 치환할 수 없습니다: ${pending.join(', ')}\n` +
      `뷰어로 확인 후 approve 하거나, 문제가 있으면 redo로 재생성하세요.`
    );
  }

  const draftDir = path.dirname(draftPath);
  let text = fs.readFileSync(draftPath, 'utf-8');
  const markers = scanMarkers(text);

  if (markers.length !== manifest.markers.length) {
    throw new Error('draft.md의 마커 수가 매니페스트와 다릅니다. run을 다시 실행하세요.');
  }

  // 뒤에서부터 치환해야 인덱스가 안 밀림
  for (let i = markers.length - 1; i >= 0; i--) {
    const marker = markers[i];
    const entry = manifest.markers[i];
    const replacement = `![${marker.description}](${entry.file})`;
    text = text.slice(0, marker.index) + replacement + text.slice(marker.index + marker.raw.length);
  }

  const finalPath = path.join(draftDir, 'draft_final.md');
  fs.writeFileSync(finalPath, text, 'utf-8');

  // 완료 보고
  const report = [];
  report.push('## 이미지 메이커 완료 보고');
  report.push('');
  report.push(`- 처리한 마커 수: ${manifest.markers.length}개`);
  report.push('- 생성된 이미지 목록:');
  report.push(`  - ${manifest.thumbnail.file}`);
  for (const m of manifest.markers) {
    report.push(`  - ${m.file} (${m.description}, ${m.template})`);
  }
  report.push('- 재생성 여부와 사유:');
  const regenLines = [];
  if (manifest.thumbnail.regenCount > 0) {
    regenLines.push(`  - thumbnail: 재생성 ${manifest.thumbnail.regenCount}회 (사유: ${manifest.thumbnail.regenReasons.join(', ')})`);
  }
  for (const m of manifest.markers) {
    if (m.regenCount > 0) regenLines.push(`  - img_${m.id}.png: 재생성 ${m.regenCount}회 (사유: ${m.regenReasons.join(', ')})`);
  }
  if (regenLines.length === 0) report.push('  - 재생성 없음');
  else report.push(...regenLines);
  report.push(`- 최종 출력 파일명: ${path.basename(finalPath)}`);

  console.log(report.join('\n'));
}

// ── CLI ───────────────────────────────────────────────────────────
(async () => {
  const [, , cmd, draftArg, ...rest] = process.argv;
  try {
    if (cmd === 'run') {
      await run(draftArg);
    } else if (cmd === 'redo') {
      await redo(draftArg, rest[0], rest.slice(1));
    } else if (cmd === 'approve') {
      approve(draftArg, rest[0]);
    } else if (cmd === 'finalize') {
      finalize(draftArg);
    } else {
      console.log('사용법:');
      console.log('  node generate.js run      <draft.md>');
      console.log('  node generate.js redo     <draft.md> <markerId|thumbnail> [DESC="..."] [TEMPLATE=template_x] [REASON="..."]');
      console.log('  node generate.js approve  <draft.md> <markerId|thumbnail>');
      console.log('  node generate.js finalize <draft.md>');
      process.exit(1);
    }
  } catch (err) {
    console.error('오류:', err.message);
    process.exit(1);
  }
})();
