# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 응답 언어

이 저장소에서 작업할 때는 항상 한국어로 응답할 것. 기술 용어와 코드 식별자(변수명, 함수명, 테이블명 등)는 원문 그대로 유지한다. 이 저장소의 UI 문구와 코드 주석도 모두 한국어이므로, 기존 파일을 수정할 때 이 톤을 맞춘다.

## 개요

모임 날짜·장소 추천 Next.js(App Router) 앱 (자세한 소개는 `README.md`). 백엔드는 전부 Supabase(Postgres + Auth + Realtime + RLS)이며 별도 애플리케이션 서버는 없다. 테스트 스위트는 없으므로 변경 후 `npm run build`/`npm run lint`로 검증한다.

## 작업별 참고 문서

- DB 스키마, migration, RLS 정책, Postgres 함수를 다룰 때는 **먼저 `docs/supabase.md`를 읽을 것.**
- 디자인 시안 적용은 `apply-design` 스킬을 쓴다.

## 주의사항

### 인증

`src/utils/supabase/middleware.ts`에 라우트 보호용 미들웨어가 있지만 **이를 연결하는 루트 `middleware.ts`가 없어 실제로는 동작하지 않는다.** 실제 인증 검사는 각 보호된 레이아웃/페이지(예: `src/app/dashboard/layout.tsx`)가 서버 측에서 `auth.getUser()`로 재검사하고 비로그인 시 `redirect("/")`하는 쪽이다. Supabase 클라이언트는 실행 위치(브라우저/서버/미들웨어)에 맞는 `src/utils/supabase/*` 팩토리를 쓴다.

예외로 졸업전시 체험 모드(`/try`, `/api/try/*`)는 로그인 없이 전시용 키 쿠키로 접근한다(`src/utils/exhibition.ts`, 환경변수 `EXHIBITION_KEY`). 카카오 쿼터를 쓰는 API 라우트는 `isLoggedInOrExhibition()` 등으로 로그인 또는 전시 쿠키를 확인할 것. 체험 모드만 카카오 대중교통 쿼터가 바닥나면 TMAP 대중교통(유료, `src/utils/tmap/*`)으로 넘어가며, TMAP 호출 전에 반드시 `reserveTmapCalls()`로 월간 상한(`tmap_usage` 테이블)을 예약한다. 이 예약은 서버 전용 secret key 클라이언트(`src/utils/supabase/admin.ts`, 환경변수 `SUPABASE_SECRET_KEY`)로만 하며, 이 키에는 `NEXT_PUBLIC_`을 붙이지 않는다.

### 데이터 접근은 RLS에 전적으로 의존

- 클라이언트 컴포넌트가 `@supabase/supabase-js`로 Postgres에 직접 접근하며, DB를 감싸는 API 레이어는 없다. 인가는 전부 RLS 정책이 담당한다. `src/app/api/**` 라우트는 서버 전용 `KAKAO_REST_API_KEY`를 숨기기 위해 존재하며, 카카오 호출 로직은 `src/utils/kakao/*`에 있다.
- **카카오 API 응답은 저장하지 않는다.** 대중교통 경로 조회 결과는 DB 저장·임시 캐싱이 금지이고, 로컬 API(장소 검색)가 반환한 장소명도 DB 저장이 금지다(장소 ID·place_url만 허용). 요청 처리 중 메모리에서 비교·계산하고 버리는 것은 허용된다. 이동시간은 `/api/transit/time`(하루 무료 1,000건)으로 필요할 때마다 조회한다. (임시 예외: 추천 알고리즘 검증용 정답표 `data/ground-truth/`는 이동시간을 로컬에 저장한다. gitignore 대상이며 커밋 금지, 검증이 끝나면 삭제한다 — `docs/todos.md` 위치 추천 3번.)
- 추천 장소 후보는 공공데이터 역 목록 `src/data/stations.json`(국가철도공단 전국도시철도역사정보표준데이터, `npm run data:stations`로 `data/raw/`의 XLSX에서 생성)이다. 공공데이터라 역 이름·좌표를 저장해도 된다. 추천 계산은 `/api/location/recommend`가 하고, 결과는 역 id(`station_id`)와 순위(`rank`)로 저장한다.
- RLS에 막힌 select는 에러가 아니라 빈 배열을 반환한다. 쿼리 결과가 이유 없이 비어 있으면 정책부터 의심할 것.
- `profiles`는 전체 공개가 아니므로 이메일로 사용자를 찾을 때는 `find_profile_by_email` RPC를 쓴다.
- `meetings`에는 insert/update/delete 정책이 없다. 모임 생성·나가기는 `create_meeting`/`leave_meeting` RPC로 하며, 테이블 직접 조작으로 되돌리지 말 것.
- 초대 수락은 `members` insert → `invitations` delete 순서를 지켜야 한다 (`members` insert가 본인 초대 로우 존재를 조건으로 함).
- 추천 장소 계산은 모임당 한 명만 하도록 `claim_location_calculation`으로 락을 잡고, 결과는 `save_recommended_locations` RPC로 저장한다 (실패 시 `release_location_calculation`). `recommended_locations`에 직접 insert/delete하지 말 것.

### DB 트리거 (클라이언트 코드에 흔적이 없는 동작)

- `handle_new_user` — `auth.users` 가입 시 `profiles` 로우 생성 (회원가입 페이지는 `profiles`에 insert하지 않는다).
- `log_member_joined` / `log_member_left` — `members` insert/delete 시 `meeting_logs`에 기록. 클라이언트는 `updated` 타입만 직접 기록한다.
- `clear_recommended_locations_for_meeting` — `members`(insert/delete/`departure_location` 변경)나 `member_schedules`(insert/delete)가 바뀌면 해당 모임의 `recommended_locations`와 진행 중인 계산 락을 삭제한다 (계산 도중 입력이 바뀌면 그 결과는 저장되지 않음). `MeetingLocationResult.tsx`는 저장된 결과가 비어 있으면 재계산해서 저장한다.

### 도메인 규칙

- 위치 컬럼은 PostGIS `geography(Point, 4326)`이며 WKT `` `POINT(${lng} ${lat})` `` 리터럴로 넣는다. **lng/lat 순서**를 지킬 것.
- 모임 추천(`MeetingScheduleResult.tsx`, `MeetingLocationResult.tsx`)의 "전원 준비 완료" 체크는 일정 존재 여부가 아니라 **미래** 일정(`free_date >= today`) 기준이다. 과거 일정만 남은 상태가 "완료"로 집계되지 않도록 이 방식을 유지할 것.

### Realtime

폴링 대신 Supabase Realtime `postgres_changes` 구독을 쓴다. 패턴: 한 번 fetch → 세션을 가져와 `supabase.realtime.setAuth(session.access_token)` → `supabase.channel(...).on("postgres_changes", {...}, refetch).subscribe()` → effect cleanup에서 `supabase.removeChannel`. Realtime 이벤트도 RLS를 따르므로 구독자가 select로 볼 수 있는 로우의 변경만 전달된다.

### 스타일링

**디자인을 새 시안으로 전면 교체하는 중이다** (Tailwind CSS v4, `src/app/globals.css`의 CSS-first 설정).
- 코드 곳곳의 하드코딩된 헥스(`#0d1f2d`, `#4ecdc4`, `#6b7280`, `#9ca3af`, `#f0f2f5` 등)는 기존 디자인의 색이며 폐기 예정이다. 새 코드에서 재사용하지 말고, 새 시안의 색을 이 값들에 맞추지도 말 것.
- 새 시안의 색은 컴포넌트에 헥스를 직접 박지 않고 `globals.css`의 `:root` 토큰 → `@theme inline`의 `--color-*` 참조로 유틸리티 클래스화해서 쓴다 (세부 규칙은 `apply-design` 스킬).
- 새 시안으로 옮기는 화면의 헥스만 토큰으로 바꾸고, 아직 옮기지 않은 화면은 그대로 둔다.

### Kakao Maps

전역 `window.kakao` 타입은 `src/kakao.d.ts`에 직접 선언되어 있다. 추가 Kakao Maps JS API를 쓸 때는 `@types/kakao*`를 설치하지 말고 이 파일을 확장할 것.
