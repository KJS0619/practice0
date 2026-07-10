# 매일 실행되는 블로그 자동작성 스크립트 (Windows 작업 스케줄러가 호출)
# 그날의 뉴스 워처 결과를 재료로 4단계 파이프라인(리서처->라이터->이미지메이커->어셈블러)을 실행해
# blog/posts/<날짜>/ 에 결과물을 쌓는다.

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 > $null

$today = Get-Date -Format "yyyy-MM-dd"
$logDir = "D:\workspace\practice0\blog\posts\_logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "run_$today.log"
$postDir = "D:\workspace\practice0\blog\posts\$today"
New-Item -ItemType Directory -Force -Path $postDir | Out-Null

$prompt = @"
너는 blog 폴더의 메인 오케스트레이터다. D:\workspace\practice0\blog\CLAUDE.md 를 Read로 읽고 그 규칙을 따라라 (직접 글을 쓰지 말고, 리서처->라이터->이미지 메이커->어셈블러 순서로 서브에이전트(Task/Agent 도구)를 호출·분배할 것).

오늘 날짜는 $today 다. 오늘의 출력 폴더는 $postDir 이고, 이미 만들어져 있다.

주제: "이번 주 Anthropic/Claude 소식 정리"

1. 리서처 서브에이전트를 호출해라. D:\workspace\practice0\blog\agent\researcher.md 지침을 따르되, 웹 검색 대신 아래 뉴스 워처 결과 파일들을 1차 자료로 우선 사용하게 해라(이미 출처가 검증된 자료다). 없는 파일은 건너뛰어라:
   - C:\Users\user\Desktop\news\news_$today.txt
   - 최근 6일 이내의 다른 news_*.txt 파일들 (있다면)
   필요하면 공식 출처 URL을 WebFetch로 재확인해서 보강해도 되지만, 확인 안 된 내용은 쓰지 말 것.
   결과를 $postDir\research-result.md 로 저장하게 해라.

2. 라이터 서브에이전트를 호출해라. D:\workspace\practice0\blog\agent\write.md, guide/style-guide.md, guide/seo-guide.md, guide/researcher.md 를 반드시 읽게 하고, research-result.md를 반영해서 $postDir\draft.md 로 저장하게 해라. 이미지 자리에는 <!-- IMAGE: [설명] --> 마커를 2~4곳 넣게 해라.

3. 이미지 메이커 서브에이전트를 호출해라. D:\workspace\practice0\blog\agent\image-maker.md 지침대로, D:\workspace\practice0\blog\tools\image-maker\generate.js 를 사용해서 $postDir\draft.md 의 마커를 처리하고(run -> 뷰어로 검수 -> approve/redo -> finalize), $postDir\draft_final.md 를 만들게 해라.

4. 어셈블러 서브에이전트를 호출해라. D:\workspace\practice0\blog\agent\assemble.md 지침대로, $postDir\draft_final.md 와 $postDir\images 를 합쳐 $postDir\draft_final.pdf 를 만들고 직접 열어 검수하게 해라.

각 단계가 끝나면 다음 단계로 넘어가되, 네가 직접 글을 쓰거나 이미지를 만들지 말고 반드시 서브에이전트에게 위임해라.

모든 단계가 끝나면, 아래 텔레그램 봇 API로 완료 알림을 보내라 (토큰은 D:\workspace\practice0\telegram-bridge\.env 의 TELEGRAM_BOT_TOKEN, chat_id는 8398650353):
https://api.telegram.org/bot<TOKEN>/sendMessage 에 POST, body: {"chat_id": 8398650353, "text": "<오늘 날짜 블로그 글 제목과 완료 요약>"}

마지막으로 처리 결과(제목, 각 단계 산출물 경로, 재생성 여부)를 짧게 요약해서 출력해라.
"@

Set-Location "D:\workspace\practice0"
"===== $today 실행 시작 =====" | Out-File -FilePath $logFile -Append -Encoding utf8

& "C:\Users\user\AppData\Roaming\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe" -p $prompt --dangerously-skip-permissions 2>&1 |
  Out-File -FilePath $logFile -Append -Encoding utf8

"===== $today 실행 종료 =====" | Out-File -FilePath $logFile -Append -Encoding utf8
