# 블로그 글 자동작성 프로젝트

이 폴더는 블로그 글을 자동으로 만드는 파이프라인이다. 메인 에이전트는 **직접 글을 쓰지 않고**, 아래 순서로 서브에이전트를 호출·분배하는 오케스트레이터 역할만 한다.

## 파이프라인 순서

**리서처 → 라이터 → (이미지 메이커) → 어셈블러**

- 각 단계는 반드시 해당 서브에이전트에게 위임한다.
- 각 단계가 끝나면 결과를 확인하고 다음 단계로 넘긴다.
- 매 단계 완료 시 진행상황을 한두 줄로 짧게 보고한다. (예: "리서치 완료 → research-result.md 저장, 라이터 호출합니다")

## 폴더 구조

- `agent/` — 서브에이전트 지침서 (`researcher.md`, `write.md`, `image-maker.md`, `assemble.md`)
- `guide/` — 라이터가 참고하는 가이드 (`style-guide.md`, `seo-guide.md`, `researcher.md`)
- `styleguide/` — 말투 분석 원본 샘플
- `images/` — 이미지 메이커가 생성한 이미지 + `manifest.json`
- `tools/image-maker/` — 이미지 생성 스크립트(Playwright 기반)
- `research-result.md`, `draft.md`, `draft_final.md`, `assembler.md`/`assembler.html` — 단계별 산출물
- `posts/YYYY-MM-DD/` — **날짜별로 쌓이는 정식 발행분.** 매일 자동 실행되는 글은 여기에 그날 폴더를 만들어 `research-result.md`/`draft.md`/`draft_final.md`/`draft_final.pdf`/`images/`를 전부 그 안에 저장한다. (블로그 루트에 흩어져 있는 파일들은 수동 실행/실험용)
- `run-daily-post.ps1` — Windows 작업 스케줄러 "BlogDailyPost"(매일 09:30)가 호출하는 실행 스크립트. 그날 뉴스 워처 결과(`Desktop\news\news_*.txt`)를 리서처의 1차 자료로 넘겨 "이번 주 소식" 주제로 파이프라인 전체를 무인 실행하고, `posts/오늘날짜/`에 저장한 뒤 텔레그램으로 완료를 알리고, `mailer/`로 그날 발행물을 메일 발송한다.
- `../mailer/` (상위 폴더) — `posts/오늘날짜/draft_final.pdf`를 kjs0619@gmail.com으로 메일 발송하는 Node 스크립트(`send-daily-mail.js`, nodemailer + Gmail 앱 비밀번호). `run-daily-post.ps1`이 파이프라인 완료 후 자동으로 호출한다.

## 에이전트 역할

| 단계 | 지침서 | 역할 |
|---|---|---|
| 리서처 | `agent/researcher.md` | 주제 → 웹 검색 → 출처 있는 사실만 정리 → `research-result.md` |
| 라이터 | `agent/write.md` | `research-result.md` + `guide/` 3종 반영 → `draft.md` (이미지는 마커로만 표시) |
| 이미지 메이커 | `agent/image-maker.md` | `draft.md`의 이미지 마커 → 이미지 생성·검수 → `draft_final.md` |
| 어셈블러 | `agent/assemble.md` | `draft_final.md` + `images/` → 최종 파일(`assembler.md`/`assembler.html`) |

## 메인 에이전트 규칙

- 글 작성, 이미지 생성, 조립을 메인이 직접 하지 않는다 — 항상 해당 서브에이전트를 호출한다.
- 각 서브에이전트의 지침서(`agent/*.md`)를 벗어난 임의 판단을 하지 않는다.
- 단계별 산출물 파일명이 이미 정해져 있으므로 그대로 따른다.
