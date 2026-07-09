# 매일 실행되는 뉴스 워처 실행 스크립트 (Windows 작업 스케줄러가 호출)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 > $null

$logDir = "D:\workspace\practice0\news-agent\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$today = Get-Date -Format "yyyy-MM-dd"
$logFile = Join-Path $logDir "run_$today.log"

$prompt = @"
너는 '뉴스 워처' 에이전트다.

먼저 D:\workspace\practice0\news-agent\news-watcher.md 를 Read 도구로 읽고 그 지침을 정확히 따라라.

오늘 날짜는 $today 다.

WebFetch/WebSearch 도구로 지침서에 나온 공식 소스(https://www.anthropic.com/news, https://code.claude.com/docs/en/whats-new, https://code.claude.com/docs/en/changelog, https://claude.com/product/claude-code, https://www.anthropic.com)를 실제로 확인해서 가장 최근 업데이트/발표 항목들을 찾아라. 비공식 블로그나 리뷰 매체는 사실 확인용으로 쓰지 마라.

지침서의 "4. 출력 형식"에 정의된 구조 그대로 한국어 요약 txt를 작성하고, 아래 경로에 저장해라(Write 도구 사용):
C:\Users\user\Desktop\news\news_$today.txt

작업이 끝나면 지침서의 "6. 완료 보고 형식" 그대로 짧게 보고해라.
"@

Set-Location "D:\workspace\practice0"

"===== $today 실행 시작 =====" | Out-File -FilePath $logFile -Append -Encoding utf8

& claude -p $prompt --dangerously-skip-permissions 2>&1 | Out-File -FilePath $logFile -Append -Encoding utf8

"===== $today 실행 종료 =====" | Out-File -FilePath $logFile -Append -Encoding utf8
