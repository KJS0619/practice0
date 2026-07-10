# 매주 실행되는 블로그 주간 다이제스트 스크립트 (Windows 작업 스케줄러 "BlogWeeklyDigest"가 호출)
# 최근 7일간 blog/posts/에 쌓인 글들을 모아 blog/digests/weekly/<오늘날짜>/ 에 다이제스트를 만든다.

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 > $null

$today = Get-Date -Format "yyyy-MM-dd"
$startDate = (Get-Date).AddDays(-6).ToString("yyyy-MM-dd")
$logDir = "D:\workspace\practice0\blog\digests\_logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "weekly_$today.log"
$digestDir = "D:\workspace\practice0\blog\digests\weekly\$today"
New-Item -ItemType Directory -Force -Path $digestDir | Out-Null

$prompt = @"
너는 blog 폴더의 메인 오케스트레이터다. D:\workspace\practice0\blog\CLAUDE.md 를 Read로 읽고 그 규칙을 따라라 (직접 글을 쓰지 말고 서브에이전트(Task/Agent 도구)를 호출·분배할 것).

오늘 날짜는 $today 다. 이번 주간 다이제스트 대상 기간은 $startDate ~ $today 다. 출력 폴더는 $digestDir 이고, 이미 만들어져 있다.

1. 다이제스트 라이터 서브에이전트를 호출해라. D:\workspace\practice0\blog\agent\digest.md 지침을 따르되, D:\workspace\practice0\blog\posts\ 아래에서 $startDate 부터 $today 사이 날짜 폴더들을 찾아 그 안의 draft_final.md 를 전부 자료로 사용하게 해라(폴더가 없는 날짜는 건너뛴다). guide/style-guide.md, guide/seo-guide.md 도 반드시 읽게 해라. 결과를 $digestDir\draft.md 로 저장하게 해라(이미지는 <!-- IMAGE: [설명] --> 마커로 2~4곳).

2. 이미지 메이커 서브에이전트를 호출해라. D:\workspace\practice0\blog\agent\image-maker.md 지침대로 D:\workspace\practice0\blog\tools\image-maker\generate.js 를 사용해서 $digestDir\draft.md 의 마커를 처리하고(run -> 뷰어로 검수 -> approve/redo -> finalize), $digestDir\draft_final.md 를 만들게 해라.

3. 어셈블러 서브에이전트를 호출해라. D:\workspace\practice0\blog\agent\assemble.md 지침대로 $digestDir\draft_final.md 와 $digestDir\images 를 합쳐 $digestDir\draft_final.pdf 를 만들고 직접 열어 검수하게 해라.

만약 대상 기간에 발행물이 하나도 없으면, 억지로 만들지 말고 그 사실을 그대로 보고하고 끝내라.

각 단계는 반드시 서브에이전트에게 위임해라. 마지막으로 digest.md의 완료 보고 형식대로 결과를 요약해서 출력해라.
"@

Set-Location "D:\workspace\practice0"
"===== $today 주간 다이제스트 실행 시작 (대상: $startDate ~ $today) =====" | Out-File -FilePath $logFile -Append -Encoding utf8

& "C:\Users\user\AppData\Roaming\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe" -p $prompt --dangerously-skip-permissions 2>&1 |
  Out-File -FilePath $logFile -Append -Encoding utf8

"===== 다이제스트 파이프라인 종료, 발송 시도 =====" | Out-File -FilePath $logFile -Append -Encoding utf8

if (Test-Path (Join-Path $digestDir "draft_final.pdf")) {
  Push-Location "D:\workspace\practice0\mailer"
  try {
    node send-digest-mail.js $digestDir "주간" 2>&1 | Out-File -FilePath $logFile -Append -Encoding utf8
  } catch {
    "메일 발송 오류: $($_.Exception.Message)" | Out-File -FilePath $logFile -Append -Encoding utf8
  }
  try {
    node send-digest-telegram.js $digestDir "주간" 2>&1 | Out-File -FilePath $logFile -Append -Encoding utf8
  } catch {
    "텔레그램 발송 오류: $($_.Exception.Message)" | Out-File -FilePath $logFile -Append -Encoding utf8
  }
  Pop-Location

  "===== 사이트 재생성/배포 시도 =====" | Out-File -FilePath $logFile -Append -Encoding utf8
  try {
    Push-Location "D:\workspace\practice0\blog\site-builder"
    node generate-site.js 2>&1 | Out-File -FilePath $logFile -Append -Encoding utf8
    Pop-Location
    Push-Location "D:\workspace\practice0\blog\site"
    npx vercel --prod --yes 2>&1 | Out-File -FilePath $logFile -Append -Encoding utf8
    Pop-Location
  } catch {
    "사이트 배포 오류: $($_.Exception.Message)" | Out-File -FilePath $logFile -Append -Encoding utf8
  }
} else {
  "draft_final.pdf 가 없어 발송을 건너뜀 (대상 기간에 발행물이 없었을 수 있음)" | Out-File -FilePath $logFile -Append -Encoding utf8
}

"===== $today 주간 다이제스트 실행 종료 =====" | Out-File -FilePath $logFile -Append -Encoding utf8
