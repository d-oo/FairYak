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

# Supabase CLI (devDependency, npx로 실행. 원격 프로젝트에 link되어 있음)
npx supabase migration new <name>   # supabase/migrations/에 빈 migration 생성
npx supabase db push --dry-run      # 원격에 적용될 migration 확인 (DB 변경 없음)
npx supabase db push                # 원격 DB에 migration 적용
npx supabase db dump --linked --schema public -f <file>   # 원격 스키마 덤프 (Docker 필요)
```

이 저장소에는 별도로 구성된 테스트 스위트가 없다.

`db dump`/`db pull`/`db diff`/`start`는 내부적으로 Docker 컨테이너를 쓰므로 Docker Desktop이 실행 중이어야 한다. `migration new`, `db push`, `gen types --linked`는 Docker 없이 동작한다. 원격 인증은 `supabase login` 액세스 토큰으로 하며, link 정보는 `supabase/.temp/`(gitignore됨)에 저장된다.

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

클라이언트 컴포넌트는 `@supabase/supabase-js`를 통해 Postgres에 직접 접근하며, 인가는 전적으로 Row Level Security 정책에 의존한다 (아래 "DB 스키마와 RLS" 참고). DB를 감싸는 REST/GraphQL 레이어는 없다. `src/app/api/**`의 백엔드 라우트는 오직 서버 전용 시크릿인 `KAKAO_REST_API_KEY`를 브라우저로부터 숨기기 위해서만 존재한다:
- `api/address/search` — Kakao 키워드 장소 검색 (출발지 주소 자동완성용).
- `api/address/reverse` — Kakao 좌표→주소 역지오코딩.
- `api/location/candidates` — Kakao 카테고리 검색 (지하철역 `SW8`, 결과 없으면 관광명소 `AT4`로 폴백). 모임 장소 후보를 계산할 때 중심점 주변에서 사용됨.

클라이언트에서 참조하는 테이블: `profiles`, `meetings`, `members`, `invitations`, `meeting_logs`, `user_schedules`, `member_schedules`, `recommended_locations`, `user_locations`. 그리고 PostGIS 좌표를 `lat`/`lng` 컬럼으로 풀어주는 view `member_coordinates`(← `members`), `recommended_location_coordinates`(← `recommended_locations`). 클라이언트에서 호출하는 Postgres RPC:
- `create_meeting(p_name)` — 모임 생성 + 호출자를 멤버로 등록. 생성된 `meetings` 로우 반환.
- `leave_meeting(p_meeting_id)` — 호출자를 멤버에서 제거하고, 마지막 인원이었으면 모임 삭제 (CASCADE로 연관 데이터 정리).
- `find_profile_by_email(p_email)` — 초대용. 이메일이 정확히 일치하는 프로필 1명(`id, name, email`) 반환.
- `copy_location_to_member(p_user_id, p_meeting_id, p_location_name)` — 내가 저장한 위치(`user_locations`)를 모임 출발지로 적용. `p_user_id`는 호출자 본인이어야 한다.

위치 컬럼은 PostGIS `geography(Point, 4326)` 타입이며, 값은 템플릿 문자열로 만든 WKT `POINT(lng lat)` 리터럴로 넣는다 (예: `` `POINT(${lng} ${lat})` ``) — 새로운 insert/update를 작성할 때 lng/lat 순서를 일관되게 유지할 것.

실시간 갱신은 폴링이 아니라 Supabase Realtime `postgres_changes` 구독을 사용한다 (`MeetingScheduleResult.tsx`, `MeetingLocationResult.tsx`, `NotificationBell.tsx` 참고). 새로운 realtime 기반 컴포넌트를 추가할 때 따를 패턴: 한 번 fetch → 세션을 가져온 뒤 `supabase.realtime.setAuth(session.access_token)` 호출 → `supabase.channel(...).on("postgres_changes", {...}, refetch).subscribe()` → effect의 cleanup에서 `supabase.removeChannel`로 정리. Realtime 이벤트도 RLS를 따르므로, 구독자가 select 정책상 볼 수 있는 로우의 변경만 전달된다.

### DB 스키마와 RLS

스키마는 `supabase/` 아래에서 관리한다:
- `supabase/schema.sql` — RLS 도입 **직전** 원격 `public` 스키마를 덤프한 스냅샷(기준선). migration이 아니며 `supabase/migrations/`에 넣으면 안 된다 (이미 존재하는 객체를 다시 만들려다 push가 실패한다).
- `supabase/migrations/` — 그 이후의 모든 스키마 변경. 원격 migration 이력은 `20261007162843_enable_rls.sql`부터 시작한다. 현재 스키마 = `schema.sql` + migrations 순서대로 적용한 결과.

스키마를 바꿀 때는 대시보드 SQL Editor에서 직접 수정하지 말고 `migration new` → SQL 작성 → `db push --dry-run` → `db push` 순서를 따른다. 로컬 Supabase 스택은 쓰지 않고 원격에 바로 적용한다 (Supabase 프로젝트가 하나뿐이고 개발과 Vercel 배포가 같은 DB를 쓴다).

DB 트리거 (클라이언트 코드에 없는 동작이므로 주의):
- `handle_new_user` — `auth.users` 가입 시 `profiles` 로우 생성 (회원가입 페이지는 `profiles`에 insert하지 않는다).
- `log_member_joined` / `log_member_left` — `members` insert/delete 시 `meeting_logs`에 `member_joined`/`member_left` 기록. 클라이언트는 `updated` 타입만 직접 기록한다.
- `clear_recommended_locations_for_meeting` — `members`(insert/delete/`departure_location` 변경)나 `member_schedules`(insert/delete)가 바뀌면 해당 모임의 `recommended_locations`를 삭제한다.

RLS 규칙 — 정책이나 함수를 추가·수정할 때 따를 것:
- 모든 테이블에 RLS가 켜져 있고 정책은 전부 `TO authenticated`다. `anon`은 어떤 로우도 볼 수 없다.
- 접근 범위: 개인 데이터(`user_schedules`, `user_locations`)는 본인만, 모임 데이터(`meetings`, `members`, `member_schedules`, `meeting_logs`, `recommended_locations`)는 해당 모임 멤버만, `invitations`는 보낸 사람·받은 사람·모임 멤버만. `profiles`는 본인 + 같은 모임 멤버 + 초대를 주고받은 사용자만 조회 가능하며, 전체 공개가 아니므로 이메일로 사용자를 찾을 때는 `find_profile_by_email` RPC를 쓴다. 초대받은 사람은 수락 전에도 알림에 표시할 모임 이름을 보기 위해 해당 `meetings` 로우를 조회할 수 있다.
- 멤버십 판별은 security definer 헬퍼 `is_meeting_member(meeting_id)`, `shares_meeting_with(user_id)`를 쓴다. `members` 정책 안에서 `members`를 직접 조회하면 무한 재귀가 나므로 서브쿼리 대신 이 헬퍼를 쓸 것. 정책 안의 `auth.uid()`는 `(select auth.uid())`로 감싼다.
- security definer 함수는 `SET search_path = ''`로 만들고 테이블을 `public.`으로 전부 명시한다. 사용자 식별은 항상 함수 안의 `auth.uid()`로 하며 클라이언트가 넘긴 user id를 신뢰하지 않는다. 새 함수는 `public`, `anon`에서 `EXECUTE`를 revoke하고 `authenticated`에만 grant한다 (이 프로젝트는 default privileges로 새 함수가 `anon`에게도 열린다). 기존 트리거 함수들은 스키마를 명시하지 않은 테이블명을 쓰므로 `search_path = public`으로 고정되어 있다.
- view는 기본적으로 소유자(`postgres`) 권한으로 실행되어 RLS를 우회한다. 새 view는 반드시 `security_invoker = true`로 만든다.
- RLS로 표현하기 어려운 다단계 흐름은 security definer RPC로 묶는다. 모임 생성(insert 직후엔 아직 멤버가 아니라 조회 불가)과 모임 나가기(본인 로우를 지운 뒤엔 남은 인원을 셀 수 없음)가 그래서 RPC다. `meetings`에는 insert/update/delete 정책이 없으므로 이 흐름들을 테이블 직접 조작으로 되돌리지 말 것.
- `members` insert는 본인에 대한 `invitations` 로우가 있을 때만 허용된다 (초대 수락 흐름: `members` insert → `invitations` delete 순서를 지켜야 함). `invitations` insert는 해당 모임 멤버만 가능하다.
- RLS에 막힌 select는 에러가 아니라 빈 배열을 반환한다. 쿼리 결과가 이유 없이 비어 있으면 정책부터 의심할 것.

### 모임 추천 파이프라인

핵심 도메인 로직은 `src/app/dashboard/meetings/_components/` 아래 형제 컴포넌트 2개에 있다:
- `MeetingScheduleResult.tsx` — 모든 멤버가 출발지와 미래의 `member_schedules` 로우를 최소 1개씩 갖게 되면, 전원의 한가한 날짜를 교집합한다. 전원이 겹치는 날짜가 없으면 겹치는 인원이 가장 많은 날짜(들)로 폴백한다("partial" 결과).
- `MeetingLocationResult.tsx` — 모든 멤버가 "업데이트 완료"(위치 있음 AND 미래 일정 있음) 상태가 되면, 멤버 좌표의 중심점을 계산하고 `/api/location/candidates`로 그 주변을 조회한다 (지하철역 우선, 없으면 관광명소로 폴백, 반경을 10km→20km→30km로 넓혀가며 결과가 1개 이상 나올 때까지 시도). Kakao 장소명의 첫 토큰이 같은 후보들(대개 호선이 다른 동일 역명)을 중복 제거한 뒤, 브라우저에서 직접 ODsay `searchPubTransPathT`를 (멤버, 후보) 쌍마다 호출해서 최대 이동시간 다음 평균 이동시간 기준으로 채점하고 상위 5개를 남긴다. 결과는 `recommended_locations`/`recommended_location_coordinates`에 저장되어 방문할 때마다 재계산하지 않는다. 멤버의 출발지나 일정이 바뀌면 DB 트리거(`clear_recommended_locations_for_meeting`)가 해당 모임의 추천 결과를 지우고, 컴포넌트는 저장된 결과가 비어 있으면 다시 계산해서 `.delete()` + `.insert()`로 저장한다. `recommended_locations`의 변경은 Realtime으로 다른 멤버 화면에도 반영된다.

두 컴포넌트 모두 "전원 준비 완료" 체크를 **미래** 일정 날짜(`free_date >= today`)만 기준으로 하며, 단순히 일정이 존재하는지만 보지 않는다 — 관련 로직을 수정할 때 이 방식을 그대로 따를 것. 과거 일정만 남아 있는 상태가 "완료"로 잘못 집계되지 않도록 하기 위함이다.

`_components` 디렉터리(라우트 세그먼트 아님)는 부모 라우트 전용 컴포넌트를 담는다. 이 저장소는 `dashboard/_components`와 `dashboard/meetings/_components` 전반에서 이 Next.js 컨벤션을 사용한다.

### 스타일링

Tailwind CSS v4 (`src/app/globals.css`의 `@theme inline`을 통한 CSS-first 설정, `tailwind.config.js` 없음). 컴포넌트는 유틸리티 클래스를 인라인으로 작성한다.

**디자인을 새 시안으로 전면 교체하는 중이다.** 시안 zip은 `docs/design/`에 두고 `apply-design` 스킬(`.claude/skills/apply-design/SKILL.md`)로 적용한다.
- 지금 코드 곳곳에 하드코딩된 헥스 컬러(`#0d1f2d` 네이비, `#4ecdc4` 틸 액센트, `#6b7280`/`#9ca3af` 그레이, `#f0f2f5` 배경 등)는 기존 디자인의 색이며 시안 교체와 함께 통째로 폐기된다. 새 코드에서 재사용하지 말고, 새 시안의 색을 이 값들에 맞춰 바꾸지도 말 것.
- 새 시안의 색은 시안 값 그대로 쓰되 컴포넌트에 헥스를 직접 박지 않는다. `globals.css`의 `:root`에 원본 토큰(CSS 변수)으로 정의하고, `@theme inline`에는 `--color-*`로 그 변수를 참조만 추가해서 `bg-primary` 같은 유틸리티 클래스로 쓴다 (`@theme` 안에 값을 직접 정의하지 말 것).
- 한 화면을 새 시안으로 옮길 때 그 화면의 기존 헥스는 새 토큰으로 바꾸고, 아직 옮기지 않은 화면은 그대로 둔다 — 전환이 끝날 때까지는 두 색 체계가 공존한다.

### Kakao Maps 연동

Kakao Maps JS SDK는 `src/app/dashboard/layout.tsx`의 `<Script>`를 통해 `autoload=false`로 전역에서 한 번만 로드되고, 이후 `KakaoMap.tsx`(`window.kakao`를 다루기 때문에 `next/dynamic({ ssr: false })`로 import됨)가 지도를 생성하기 전에 직접 `kakao.maps.load(...)`를 호출한다. 전역 `window.kakao` 타입은 `src/kakao.d.ts`에 직접 선언되어 있다 — 추가 Kakao Maps JS API를 사용할 때는 (`@types/kakao*`가 아니라) 이 파일을 확장할 것.
