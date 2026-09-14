# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 응답 언어

이 저장소에서 작업할 때는 항상 한국어로 응답할 것. 기술 용어와 코드 식별자(변수명, 함수명, 테이블명 등)는 원문 그대로 유지한다. 이 저장소의 UI 문구와 코드 주석도 모두 한국어이므로, 기존 파일을 수정할 때 이 톤을 맞춘다.

## 프로젝트 개요

페어약(FairYak)은 여러 명이 모임 **날짜**와 **장소**를 정하는 걸 도와주는 Next.js(App Router) 앱이다. 각 멤버가 한가한 날짜와 출발지를 등록하면, 앱이 모두가 겹치는 날짜를 찾고 Kakao Local API(장소 검색/지오코딩)와 ODsay(이동시간 추정)를 이용해 모두의 이동 시간을 최소화하는 모임 장소를 추천한다. 백엔드는 전부 Supabase(Postgres + Auth + Realtime + RLS)이며, 별도의 애플리케이션 서버는 없다.

## 명령어

```bash
npm run dev      # 개발 서버 실행 (localhost:3000)
npm run build    # 프로덕션 빌드
npm run start    # 프로덕션 빌드 실행
npm run lint     # eslint (flat config: eslint-config-next core-web-vitals + typescript)
```

이 저장소에는 별도로 구성된 테스트 스위트가 없다.

## 환경 변수

`.env.local`에 다음 값들이 필요하다 (실제 값은 기존 파일 참고, 실제 키는 절대 커밋하지 않는다):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — Supabase 프로젝트 URL/anon 키.
- `KAKAO_REST_API_KEY` — 서버 전용 Kakao REST 키. `src/app/api/**` 라우트 핸들러 내부에서만 사용 (키워드/카테고리 검색, 좌표→주소 역지오코딩).
- `NEXT_PUBLIC_KAKAO_MAP_KEY` — Kakao Maps JS SDK 키. `src/app/dashboard/layout.tsx`에서 `<Script>`로 클라이언트 측에 로드됨.
- `NEXT_PUBLIC_ODSAY_API_KEY` — ODsay 대중교통 API 키. 후보 모임 장소를 이동시간으로 채점하기 위해 브라우저(`MeetingLocationResult.tsx`)에서 직접 호출됨.

## 아키텍처

### 인증 및 라우팅 보호

라우트 보호 로직이 중복되어 두 곳에 있다:
- `src/utils/supabase/middleware.ts`에 Next.js `middleware` 함수가 정의되어 있다 (비로그인 사용자를 보호 경로에서 리다이렉트, 로그인 사용자를 `/`나 `/auth/*`에서 리다이렉트) — **하지만 이를 import/export하는 루트 레벨 `middleware.ts`가 현재 존재하지 않아, 이 미들웨어는 실제 요청 파이프라인에 연결되어 있지 않다.** 라우트 보호가 엣지에서 실행된다고 가정하지 말고 확인부터 할 것.
- 대신 각 보호된 레이아웃/페이지(예: `src/app/dashboard/layout.tsx`)가 서버 측에서 `createClient(cookieStore).auth.getUser()`로 세션을 개별적으로 재검사하고, 비로그인 시 `redirect("/")`를 호출한다. 오늘날 실제로 동작하는 인증 검사는 이쪽이다.

Supabase 클라이언트 팩토리는 실행 컨텍스트별로 3개가 존재한다. 코드가 실행되는 위치에 맞는 것을 사용할 것:
- `src/utils/supabase/client.ts` — `createBrowserClient`, `"use client"` 컴포넌트용.
- `src/utils/supabase/server.ts` — `createServerClient(cookieStore)`, 서버 컴포넌트/서버 액션용. awaited `cookies()` 스토어를 인자로 받는다.
- `src/utils/supabase/middleware.ts` — `NextRequest`/`NextResponse` 쿠키 저장소에 바인딩된 `createServerClient` (위 미들웨어 미연결 관련 주의사항 참고).

### 데이터 흐름: Supabase 위에 앱 레벨 API 레이어가 없음

클라이언트 컴포넌트는 `@supabase/supabase-js`를 통해 Postgres에 직접 접근하며, 인가는 (이 저장소가 아닌 Supabase 프로젝트에 정의된) Row Level Security 정책에 의존한다. DB를 감싸는 REST/GraphQL 레이어는 없다. `src/app/api/**`의 백엔드 라우트는 오직 서버 전용 시크릿인 `KAKAO_REST_API_KEY`를 브라우저로부터 숨기기 위해서만 존재한다:
- `api/address/search` — Kakao 키워드 장소 검색 (출발지 주소 자동완성용).
- `api/address/reverse` — Kakao 좌표→주소 역지오코딩.
- `api/location/candidates` — Kakao 카테고리 검색 (지하철역 `SW8`, 결과 없으면 관광명소 `AT4`로 폴백). 모임 장소 후보를 계산할 때 중심점 주변에서 사용됨.

클라이언트에서 참조하는 주요 테이블(스키마 자체는 이 저장소가 아닌 Supabase에 있음): `profiles`, `meetings`, `members`, `invitations`, `meeting_logs`, `user_schedules`, `member_schedules`, `member_coordinates`, `recommended_locations`, `recommended_location_coordinates`, `user_locations`. 클라이언트에서 호출하는 Postgres RPC는 `copy_location_to_member` 하나뿐이다 (멤버가 이전에 저장한 위치를 모임에 적용). 위치 컬럼은 템플릿 문자열로 만든 PostGIS `POINT(lng lat)` 리터럴로 저장된다 (예: `` `POINT(${lng} ${lat})` ``) — 새로운 insert/update를 작성할 때 lng/lat 순서를 일관되게 유지할 것.

실시간 갱신은 폴링이 아니라 Supabase Realtime `postgres_changes` 구독을 사용한다 (`MeetingScheduleResult.tsx`, `MeetingLocationResult.tsx`, `NotificationBell.tsx` 참고). 새로운 realtime 기반 컴포넌트를 추가할 때 따를 패턴: 한 번 fetch → 세션을 가져온 뒤 `supabase.realtime.setAuth(session.access_token)` 호출 → `supabase.channel(...).on("postgres_changes", {...}, refetch).subscribe()` → effect의 cleanup에서 `supabase.removeChannel`로 정리.

### 모임 추천 파이프라인

핵심 도메인 로직은 `src/app/dashboard/meetings/_components/` 아래 형제 컴포넌트 2개에 있다:
- `MeetingScheduleResult.tsx` — 모든 멤버가 출발지와 미래의 `member_schedules` 로우를 최소 1개씩 갖게 되면, 전원의 한가한 날짜를 교집합한다. 전원이 겹치는 날짜가 없으면 겹치는 인원이 가장 많은 날짜(들)로 폴백한다("partial" 결과).
- `MeetingLocationResult.tsx` — 모든 멤버가 "업데이트 완료"(위치 있음 AND 미래 일정 있음) 상태가 되면, 멤버 좌표의 중심점을 계산하고 `/api/location/candidates`로 그 주변을 조회한다 (지하철역 우선, 없으면 관광명소로 폴백, 반경을 10km→20km→30km로 넓혀가며 결과가 1개 이상 나올 때까지 시도). Kakao 장소명의 첫 토큰이 같은 후보들(대개 호선이 다른 동일 역명)을 중복 제거한 뒤, 브라우저에서 직접 ODsay `searchPubTransPathT`를 (멤버, 후보) 쌍마다 호출해서 최대 이동시간 다음 평균 이동시간 기준으로 채점하고 상위 5개를 남긴다. 결과는 `recommended_locations`/`recommended_location_coordinates`에 저장되어 방문할 때마다 재계산하지 않는다. `recommended_locations`에 대한 `.delete()` + 재 `.insert()`가 재계산을 트리거하는 방식이다.

두 컴포넌트 모두 "전원 준비 완료" 체크를 **미래** 일정 날짜(`free_date >= today`)만 기준으로 하며, 단순히 일정이 존재하는지만 보지 않는다 — 관련 로직을 수정할 때 이 방식을 그대로 따를 것. 과거 일정만 남아 있는 상태가 "완료"로 잘못 집계되지 않도록 하기 위함이다.

`_components` 디렉터리(라우트 세그먼트 아님)는 부모 라우트 전용 컴포넌트를 담는다. 이 저장소는 `dashboard/_components`와 `dashboard/meetings/_components` 전반에서 이 Next.js 컨벤션을 사용한다.

### 스타일링

Tailwind CSS v4 (`src/app/globals.css`의 `@theme inline`을 통한 CSS-first 설정, `tailwind.config.js` 없음). 유틸리티 클래스는 인라인으로 작성되며 반복적으로 쓰이는 하드코딩된 헥스 컬러 소수 세트가 있다 (`#0d1f2d` 네이비, `#4ecdc4` 틸 액센트, `#6b7280`/`#9ca3af` 그레이, `#f0f2f5` 배경) — 새 컬러를 임의로 추가하기보다 이것들을 재사용할 것.

### Kakao Maps 연동

Kakao Maps JS SDK는 `src/app/dashboard/layout.tsx`의 `<Script>`를 통해 `autoload=false`로 전역에서 한 번만 로드되고, 이후 `KakaoMap.tsx`(`window.kakao`를 다루기 때문에 `next/dynamic({ ssr: false })`로 import됨)가 지도를 생성하기 전에 직접 `kakao.maps.load(...)`를 호출한다. 전역 `window.kakao` 타입은 `src/kakao.d.ts`에 직접 선언되어 있다 — 추가 Kakao Maps JS API를 사용할 때는 (`@types/kakao*`가 아니라) 이 파일을 확장할 것.
