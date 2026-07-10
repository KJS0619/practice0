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

먼저 D:\workspace\practice0\news-agent\news-watcher.md 를 Read 도구로 읽고 그 지침을 정확히 따라라. D:\workspace\practice0\news-agent\config.json 도 반드시 읽어서 날씨 지역·관심 종목·추천 포함 여부를 확인해라.

오늘 날짜는 $today 다.

WebFetch/WebSearch 도구로 지침서에 나온 항목을 전부 확인해라:
1. Anthropic 공식 소스(https://www.anthropic.com/news, https://code.claude.com/docs/en/whats-new, https://code.claude.com/docs/en/changelog, https://claude.com/product/claude-code, https://www.anthropic.com)에서 가장 최근 업데이트/발표
2. config.json의 weatherRegion 지역 오늘 날씨(기온·강수·미세먼지)
3. 코스피/코스닥 지수 현황(등락률, 장중인지 종가 기준인지)
4. config.json의 watchedStocks 각 종목의 현재가·등락률
5. includeStockRecommendations가 true면, 공개 시황 기반 "오늘의 관심 종목"(참고용, 투자조언 아님 명시)

비공식 블로그나 확인되지 않은 매체는 사실 확인용으로 쓰지 마라.

지침서의 "5. 출력 형식"대로 한국어 요약 txt를 작성해서 저장하고(Write 도구):
C:\Users\user\Desktop\news\news_$today.txt

그리고 지침서의 "6. 날씨 데이터 JSON" 형식대로 날씨 데이터도 저장해라:
C:\Users\user\Desktop\news\weather-data_$today.json

작업이 끝나면 지침서의 "8. 완료 보고 형식" 그대로 짧게 보고해라.
"@

Set-Location "D:\workspace\practice0"

"===== $today 실행 시작 =====" | Out-File -FilePath $logFile -Append -Encoding utf8

& claude -p $prompt --dangerously-skip-permissions 2>&1 | Out-File -FilePath $logFile -Append -Encoding utf8

"===== 날씨 카드 이미지 생성 시도 =====" | Out-File -FilePath $logFile -Append -Encoding utf8
Push-Location "D:\workspace\practice0\news-agent"
try {
  node render-weather-card.js $today 2>&1 | Out-File -FilePath $logFile -Append -Encoding utf8
} catch {
  "날씨 카드 생성 오류: $($_.Exception.Message)" | Out-File -FilePath $logFile -Append -Encoding utf8
}
Pop-Location

"===== $today 실행 종료 =====" | Out-File -FilePath $logFile -Append -Encoding utf8
