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
const SESSIONS_FILE = path.join(STATE_DIR, 'sessions.json');
const LOG_FILE = path.join(STATE_DIR, 'bridge.log');
const RESET_WORDS = ['새 대화', '새대화', '/new', '리셋', '초기화'];
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

// resume용 session_id가 있으면 이어서, 없으면 새로 시작한다.
// --output-format json으로 받아서 session_id를 파싱해 다음 턴에 이어 쓴다.
function runClaudeOnce(prompt, sessionId) {
  return new Promise((resolve) => {
    const args = ['-p', prompt, '--output-format', 'json', '--dangerously-skip-permissions'];
    if (sessionId) args.push('--resume', sessionId);

    execFile(
      CLAUDE_EXE,
      args,
      { cwd: WORKDIR, timeout: CLAUDE_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024, shell: false },
      (err, stdout, stderr) => {
        log(`claude 종료: err=${err ? err.message : 'none'} resume=${sessionId || '(새 세션)'} stdout길이=${(stdout || '').length} stderr길이=${(stderr || '').length}`);
        if (stderr && stderr.trim()) log(`claude stderr: ${stderr.trim().slice(0, 500)}`);

        let parsed = null;
        try {
          parsed = JSON.parse((stdout || '').trim());
        } catch {
          // JSON이 아니면 (예: 존재하지 않는 세션 ID로 resume 실패) 실패로 처리
        }

        if (parsed && typeof parsed.result === 'string') {
          resolve({ ok: !parsed.is_error, text: parsed.result, sessionId: parsed.session_id || sessionId });
          return;
        }

        resolve({
          ok: false,
          text: `(오류) ${err ? err.message : ''} ${(stderr || stdout || '').slice(0, 500)}`.trim(),
          sessionId: null,
        });
      }
    );
  });
}

async function runClaude(prompt, sessionId) {
  let result = await runClaudeOnce(prompt, sessionId);
  if (!result.ok && sessionId) {
    // 이전 세션을 이어받지 못했을 수 있음(만료 등) → 새 세션으로 한 번 재시도
    log(`세션 재개 실패, 새 세션으로 재시도: ${result.text.slice(0, 200)}`);
    result = await runClaudeOnce(prompt, null);
  }
  return result;
}

function buildPrompt(userText) {
  return [
    '다음은 텔레그램으로 전달된 작업 요청이다. 이 대화는 이어지는 대화이니, 이전에 나눈 내용을 참고해서 답해도 된다.',
    '옆에서 바로 답해줄 사람이 없는 무인 환경이니, 판단이 필요한 부분은 합리적인 기본값으로 스스로 정해서 가능한 한 끝까지 진행해라.',
    '설명이나 계획만 말하고 끝내지 말고, 필요하면 실제로 파일을 만들거나 수정하고, 명령을 실행하는 등 도구를 써서 작업을 완료해라.',
    '정말 판단이 안 서는 부분만 짧게 되물어라. 되물을 땐 사용자가 다음 메시지로 답하면 이어진다.',
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

  const sessions = loadJson(SESSIONS_FILE, {});

  if (RESET_WORDS.includes(text.trim())) {
    delete sessions[chatId];
    saveJson(SESSIONS_FILE, sessions);
    log(`대화 리셋 (chat_id=${chatId})`);
    await sendMessage(chatId, '새 대화를 시작합니다. 이전 내용은 더 이상 참고하지 않습니다.');
    return;
  }

  const prevSessionId = sessions[chatId];
  log(`명령 수신 (chat_id=${chatId}, session=${prevSessionId || '(새 세션)'}): ${text}`);
  try {
    const result = await runClaude(buildPrompt(text), prevSessionId);
    log(`응답 미리보기: ${result.text.slice(0, 300).replace(/\n/g, ' ')}`);

    if (result.sessionId) {
      sessions[chatId] = result.sessionId;
      saveJson(SESSIONS_FILE, sessions);
    }

    await sendMessage(chatId, result.text);
    log(`응답 전송 완료 (chat_id=${chatId}, session=${result.sessionId || '(없음)'})`);
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
