-- =============================================================
-- RLS 활성화 및 정책 정비
--
-- 원칙
--   - 개인 데이터(user_schedules, user_locations): 본인만 접근
--   - 모임 데이터(meetings, members, member_schedules, meeting_logs,
--     recommended_locations): 해당 모임 멤버만 접근
--   - profiles: 본인 + 같은 모임 멤버 + 초대 관계인 사용자만 조회.
--     이메일 검색은 전체 공개 대신 find_profile_by_email RPC로 정확히 일치하는 1명만 조회
--   - 정책은 모두 authenticated 대상. anon은 어떤 테이블에도 접근 불가
--   - RLS로 표현하기 어려운 흐름(모임 생성, 모임 나가기)은 security definer RPC로 처리
-- =============================================================


-- -------------------------------------------------------------
-- 1. 헬퍼 함수
--    members 정책이 members를 다시 조회하면 무한 재귀가 발생하므로,
--    RLS를 우회하는 security definer 함수로 멤버십을 판별한다.
-- -------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_meeting_member(p_meeting_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.members
    WHERE meeting_id = p_meeting_id AND user_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.shares_meeting_with(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.members me
    JOIN public.members other ON other.meeting_id = me.meeting_id
    WHERE me.user_id = (SELECT auth.uid()) AND other.user_id = p_user_id
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_meeting_member(bigint) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.shares_meeting_with(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_meeting_member(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_meeting_with(uuid) TO authenticated;


-- -------------------------------------------------------------
-- 2. 기존 security definer 함수 보완
-- -------------------------------------------------------------

-- 트리거 함수들은 스키마를 명시하지 않은 테이블명을 사용하므로 search_path를 고정한다.
-- (search_path = '' 인 RPC 안에서 트리거가 실행돼도 테이블을 찾을 수 있도록)
ALTER FUNCTION public.clear_recommended_locations_for_meeting() SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.log_member_joined() SET search_path = public;
ALTER FUNCTION public.log_member_left() SET search_path = public;

-- 기존에는 p_user_id를 그대로 신뢰해서 다른 사람의 출발지를 바꿀 수 있었다.
-- 클라이언트 호환을 위해 시그니처는 유지하고, 본인 요청인지 검사한다.
CREATE OR REPLACE FUNCTION public.copy_location_to_member(
  p_user_id uuid,
  p_meeting_id bigint,
  p_location_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_user_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.members
  SET
    departure_location = ul.location,
    departure_address = ul.address
  FROM public.user_locations ul
  WHERE ul.user_id = p_user_id
    AND ul.name = p_location_name
    AND public.members.user_id = p_user_id
    AND public.members.meeting_id = p_meeting_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.copy_location_to_member(uuid, bigint, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.copy_location_to_member(uuid, bigint, text) TO authenticated;


-- -------------------------------------------------------------
-- 3. 새 RPC
-- -------------------------------------------------------------

-- 모임 생성 + 생성자 멤버 등록을 한 트랜잭션으로 처리.
-- (meetings insert 직후에는 아직 멤버가 아니라서 RLS상 조회할 수 없는 문제 해결)
CREATE OR REPLACE FUNCTION public.create_meeting(p_name text)
RETURNS public.meetings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_meeting public.meetings;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'meeting name is required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.meetings (name)
  VALUES (btrim(p_name))
  RETURNING * INTO v_meeting;

  INSERT INTO public.members (user_id, meeting_id)
  VALUES ((SELECT auth.uid()), v_meeting.id);

  RETURN v_meeting;
END;
$$;

-- 모임 나가기. 마지막 인원이면 모임도 삭제 (CASCADE로 연관 데이터 정리).
-- (본인 members 로우를 지운 뒤에는 RLS상 남은 인원을 셀 수 없는 문제 해결)
CREATE OR REPLACE FUNCTION public.leave_meeting(p_meeting_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.members
  WHERE meeting_id = p_meeting_id AND user_id = (SELECT auth.uid());

  -- 멤버가 아니었다면 아무것도 하지 않는다
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.members WHERE meeting_id = p_meeting_id) THEN
    DELETE FROM public.meetings WHERE id = p_meeting_id;
  END IF;
END;
$$;

-- 초대용 이메일 검색. profiles 전체를 공개하지 않고 정확히 일치하는 1명만 반환.
CREATE OR REPLACE FUNCTION public.find_profile_by_email(p_email text)
RETURNS TABLE (id uuid, name text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.name, p.email
  FROM public.profiles p
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND lower(p.email) = lower(btrim(p_email))
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.create_meeting(text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.leave_meeting(bigint) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.find_profile_by_email(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_meeting(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_meeting(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_profile_by_email(text) TO authenticated;


-- -------------------------------------------------------------
-- 4. view가 RLS를 우회하지 않도록 호출자 권한으로 실행
-- -------------------------------------------------------------

ALTER VIEW public.member_coordinates SET (security_invoker = true);
ALTER VIEW public.recommended_location_coordinates SET (security_invoker = true);


-- -------------------------------------------------------------
-- 5. RLS 활성화
-- -------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommended_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_schedules ENABLE ROW LEVEL SECURITY;
-- invitations는 이미 활성화되어 있음


-- -------------------------------------------------------------
-- 6. 정책
-- -------------------------------------------------------------

-- profiles ----------------------------------------------------
-- insert는 handle_new_user 트리거가 처리, delete는 auth.users CASCADE
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR public.shares_meeting_with(id)
    OR EXISTS (
      SELECT 1 FROM public.invitations i
      WHERE (i.to_user = (SELECT auth.uid()) AND i.from_user = profiles.id)
         OR (i.to_user = profiles.id AND public.is_meeting_member(i.meeting_id))
    )
  );

CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- meetings ----------------------------------------------------
-- insert는 create_meeting, delete는 leave_meeting RPC로만 처리
CREATE POLICY meetings_select ON public.meetings
  FOR SELECT TO authenticated
  USING (
    public.is_meeting_member(id)
    -- 초대받은 사람은 알림에서 모임 이름을 볼 수 있어야 함
    OR EXISTS (
      SELECT 1 FROM public.invitations i
      WHERE i.meeting_id = meetings.id AND i.to_user = (SELECT auth.uid())
    )
  );

-- members -----------------------------------------------------
CREATE POLICY members_select ON public.members
  FOR SELECT TO authenticated
  USING (public.is_meeting_member(meeting_id));

-- 초대를 받은 경우에만 본인을 멤버로 추가 가능 (모임 생성 시는 create_meeting RPC)
CREATE POLICY members_insert ON public.members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.invitations i
      WHERE i.meeting_id = members.meeting_id AND i.to_user = (SELECT auth.uid())
    )
  );

CREATE POLICY members_update ON public.members
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY members_delete ON public.members
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- member_schedules --------------------------------------------
CREATE POLICY member_schedules_select ON public.member_schedules
  FOR SELECT TO authenticated
  USING (public.is_meeting_member(meeting_id));

CREATE POLICY member_schedules_insert ON public.member_schedules
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND public.is_meeting_member(meeting_id));

CREATE POLICY member_schedules_delete ON public.member_schedules
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- meeting_logs ------------------------------------------------
-- member_joined / member_left는 트리거가 기록하므로 클라이언트는 'updated'만 기록 가능
CREATE POLICY meeting_logs_select ON public.meeting_logs
  FOR SELECT TO authenticated
  USING (public.is_meeting_member(meeting_id));

CREATE POLICY meeting_logs_insert ON public.meeting_logs
  FOR INSERT TO authenticated
  WITH CHECK (type = 'updated' AND public.is_meeting_member(meeting_id));

-- recommended_locations ---------------------------------------
-- 추천 결과는 브라우저에서 계산해 저장하므로 멤버라면 누구나 갱신 가능
CREATE POLICY recommended_locations_select ON public.recommended_locations
  FOR SELECT TO authenticated
  USING (public.is_meeting_member(meeting_id));

CREATE POLICY recommended_locations_insert ON public.recommended_locations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_meeting_member(meeting_id));

CREATE POLICY recommended_locations_delete ON public.recommended_locations
  FOR DELETE TO authenticated
  USING (public.is_meeting_member(meeting_id));

-- user_locations ----------------------------------------------
CREATE POLICY user_locations_all ON public.user_locations
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- user_schedules ----------------------------------------------
CREATE POLICY user_schedules_all ON public.user_schedules
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- invitations -------------------------------------------------
-- 기존 insert 정책은 from_user만 검사해서, 자기 자신에게 아무 모임 초대를 만들고
-- 수락하는 방식으로 남의 모임에 들어갈 수 있었다. 모임 멤버만 초대할 수 있도록 강화.
DROP POLICY IF EXISTS invitations_insert ON public.invitations;
DROP POLICY IF EXISTS invitations_select ON public.invitations;

CREATE POLICY invitations_insert ON public.invitations
  FOR INSERT TO authenticated
  WITH CHECK (from_user = (SELECT auth.uid()) AND public.is_meeting_member(meeting_id));

CREATE POLICY invitations_select ON public.invitations
  FOR SELECT TO authenticated
  USING (
    from_user = (SELECT auth.uid())
    OR to_user = (SELECT auth.uid())
    OR public.is_meeting_member(meeting_id)
  );
-- invitations_delete, invitations_update_seen은 기존 정책 유지
