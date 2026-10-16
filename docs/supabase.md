# Supabase 스키마·RLS 작업 가이드

DB 스키마, RLS 정책, Postgres 함수를 추가·수정할 때 따르는 규칙이다.

## 스키마 관리

- `supabase/schema.sql` — RLS 도입 **직전** 원격 `public` 스키마를 덤프한 스냅샷(기준선). migration이 아니며 `supabase/migrations/`에 넣으면 안 된다 (이미 존재하는 객체를 다시 만들려다 push가 실패한다).
- `supabase/migrations/` — 그 이후의 모든 스키마 변경. 원격 migration 이력은 `20261007162843_enable_rls.sql`부터 시작한다. 현재 스키마 = `schema.sql` + migrations 순서대로 적용한 결과.

스키마를 바꿀 때는 대시보드 SQL Editor에서 직접 수정하지 말고 `migration new` → SQL 작성 → `db push --dry-run` → `db push` 순서를 따른다. 로컬 Supabase 스택은 쓰지 않고 원격에 바로 적용한다 (Supabase 프로젝트가 하나뿐이고 개발과 Vercel 배포가 같은 DB를 쓴다).

```bash
# Supabase CLI (devDependency, npx로 실행. 원격 프로젝트에 link되어 있음)
npx supabase migration new <name>   # supabase/migrations/에 빈 migration 생성
npx supabase db push --dry-run      # 원격에 적용될 migration 확인 (DB 변경 없음)
npx supabase db push                # 원격 DB에 migration 적용
npx supabase db dump --linked --schema public -f <file>   # 원격 스키마 덤프 (Docker 필요)
```

`db dump`/`db pull`/`db diff`/`start`는 내부적으로 Docker 컨테이너를 쓰므로 Docker Desktop이 실행 중이어야 한다. `migration new`, `db push`, `gen types --linked`는 Docker 없이 동작한다. 원격 인증은 `supabase login` 액세스 토큰으로 하며, link 정보는 `supabase/.temp/`(gitignore됨)에 저장된다.

## RLS 정책 작성 규칙

- 모든 테이블에 RLS가 켜져 있고 정책은 전부 `TO authenticated`다. `anon`은 어떤 로우도 볼 수 없다.
- 예외로 서버만 쓰는 테이블(`tmap_usage`)은 RLS만 켜고 정책을 두지 않으며 `anon`·`authenticated` 권한을 회수한다. 이런 테이블을 다루는 함수는 `service_role`에만 `EXECUTE`를 주고, 서버가 secret key 클라이언트(`src/utils/supabase/admin.ts`)로 호출한다.
- 접근 범위: 개인 데이터(`user_schedules`, `user_locations`)는 본인만, 모임 데이터(`meetings`, `members`, `member_schedules`, `meeting_logs`, `recommended_locations`)는 해당 모임 멤버만, `invitations`는 보낸 사람·받은 사람·모임 멤버만. `profiles`는 본인 + 같은 모임 멤버 + 초대를 주고받은 사용자만 조회 가능하다. 초대받은 사람은 수락 전에도 알림에 표시할 모임 이름을 보기 위해 해당 `meetings` 로우를 조회할 수 있다.
- 멤버십 판별은 security definer 헬퍼 `is_meeting_member(meeting_id)`, `shares_meeting_with(user_id)`를 쓴다. `members` 정책 안에서 `members`를 직접 조회하면 무한 재귀가 나므로 서브쿼리 대신 이 헬퍼를 쓸 것.
- 정책 안의 `auth.uid()`는 `(select auth.uid())`로 감싼다.
- `members` insert는 본인에 대한 `invitations` 로우가 있을 때만 허용된다. `invitations` insert는 해당 모임 멤버만 가능하다.

## 함수·view 작성 규칙

- security definer 함수는 `SET search_path = ''`로 만들고 테이블을 `public.`으로 전부 명시한다. 기존 트리거 함수들은 스키마를 명시하지 않은 테이블명을 쓰므로 `search_path = public`으로 고정되어 있다.
- 사용자 식별은 항상 함수 안의 `auth.uid()`로 하며 클라이언트가 넘긴 user id를 신뢰하지 않는다.
- 새 함수는 `public`, `anon`에서 `EXECUTE`를 revoke하고 `authenticated`에만 grant한다 (이 프로젝트는 default privileges로 새 함수가 `anon`에게도 열린다).
- view는 기본적으로 소유자(`postgres`) 권한으로 실행되어 RLS를 우회한다. 새 view는 반드시 `security_invoker = true`로 만든다.
- RLS로 표현하기 어려운 다단계 흐름은 security definer RPC로 묶는다. 모임 생성(`create_meeting`: insert 직후엔 아직 멤버가 아니라 조회 불가)과 모임 나가기(`leave_meeting`: 본인 로우를 지운 뒤엔 남은 인원을 셀 수 없음)가 그래서 RPC다.
