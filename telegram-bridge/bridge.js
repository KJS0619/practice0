// 텔레그램 <-> 클로드 코드 폴링 브릿지
// 텔레그램으로 온 자연어 메시지를 `claude -p`에 그대로 넘기고, 응답을 다시 텔레그램으로 보낸다.

const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

process.loadEnvFile(path.join(__dirname, '.env'));

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN이 .env에 없습니다.');
  process.exit(1);
}

const API = `https://api.telegram.org/bot${TOKEN}`;
const WORKDIR = 'D:\\workspace\\practice0';
const STATE_DIR = path.join(__dirname, 'state');
const OFFSET_FILE = path.join(STATE_DIR, 'offset.json');
const ALLOWLIST_FILE = path.join(STATE_DIR, 'allowlist.json');
const LOG_FILE = path.join(STATE_DIR, 'bridge.log');
const CLAUDE_TIMEOUT_MS = 5 * 60 * 1000;
const CLAUDE_EXE = 'C:\\Users\\user\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe';

fs.mkdirSync(STATE_DIR, { recursive: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n', 'utf-8');
}

function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return fallback;
  }
}

function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

async function api(method, body) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram API ${method} 실패: ${JSON.stringify(json)}`);
  return json.result;
}

async function getUpdates(offset) {
  return api('getUpdates', { offset, timeout: 50 });
}

async function sendMessage(chatId, text) {
  const chunks = [];
  let remaining = text && text.length ? text : '(빈 응답)';
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, 3800));
    remaining = remaining.slice(3800);
  }
  for (const chunk of chunks) {
    await api('sendMessage', { chat_id: chatId, text: chunk });
  }
}

function runClaude(prompt) {
  return new Promise((resolve) => {
    // shell:false + 실제 claude.exe를 직접 호출 — cmd.exe를 거치지 않아
    // 개행/한글이 섞인 긴 프롬프트가 인자 파싱 과정에서 깨지는 문제를 피한다.
    execFile(
      CLAUDE_EXE,
      ['-p', prompt, '--dangerously-skip-permissions'],
      { cwd: WORKDIR, timeout: CLAUDE_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024, shell: false },
      (err, stdout, stderr) => {
        log(`claude 종료: err=${err ? err.message : 'none'} stdout길이=${(stdout || '').length} stderr길이=${(stderr || '').length}`);
        if (stderr && stderr.trim()) log(`claude stderr: ${stderr.trim().slice(0, 500)}`);
        if (err && !(stdout && stdout.trim())) {
          resolve(`(오류) ${err.message}\n${(stderr || '').slice(0, 1000)}`.slice(0, 3800));
          return;
        }
        resolve(stdout && stdout.trim() ? stdout.trim() : `(오류) ${stderr || '알 수 없는 오류'}`);
      }
    );
  });
}

function buildPrompt(userText) {
  return [
    '다음은 텔레그램으로 무인(headless) 전달된 작업 요청이다. 지금 옆에서 바로 답해줄 사람이 없다.',
    '확인 질문으로 멈추지 말고, 판단이 필요한 부분은 합리적인 기본값으로 스스로 정해서 끝까지 진행해라.',
    '설명이나 계획만 말하고 끝내지 말고, 필요하면 실제로 파일을 만들거나 수정하고, 명령을 실행하는 등 도구를 써서 작업을 완료해라.',
    '작업을 마치면 무엇을 했는지 몇 줄로 짧게 요약해서 답해라.',
    '',
    `요청: ${userText}`,
  ].join('\n');
}

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text) return;

  let allowlist = loadJson(ALLOWLIST_FILE, []);

  if (allowlist.length === 0) {
    allowlist.push(chatId);
    saveJson(ALLOWLIST_FILE, allowlist);
    log(`허용목록 초기 등록: chat_id=${chatId}`);
    await sendMessage(chatId, '페어링 완료! 이제부터 이 채팅에서 보내는 메시지만 명령으로 처리합니다.');
    return;
  }

  if (!allowlist.includes(chatId)) {
    log(`허용되지 않은 chat_id=${chatId} 메시지 무시`);
    return;
  }

  log(`명령 수신 (chat_id=${chatId}): ${text}`);
  try {
    const reply = await runClaude(buildPrompt(text));
    log(`응답 미리보기: ${reply.slice(0, 300).replace(/\n/g, ' ')}`);
    await sendMessage(chatId, reply);
    log(`응답 전송 완료 (chat_id=${chatId})`);
  } catch (err) {
    log(`처리 중 오류: ${err.message}`);
    await sendMessage(chatId, `처리 중 오류가 발생했습니다: ${err.message}`);
  }
}

async function main() {
  log('텔레그램 브릿지 시작');
  let offset = loadJson(OFFSET_FILE, { value: 0 }).value;

  while (true) {
    try {
      const updates = await getUpdates(offset);
      for (const update of updates) {
        offset = update.update_id + 1;
        saveJson(OFFSET_FILE, { value: offset });
        if (update.message) {
          await handleMessage(update.message);
        }
      }
    } catch (err) {
      log(`폴링 오류: ${err.message}`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

main();
