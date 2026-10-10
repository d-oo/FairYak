-- =============================================================
-- 추천 장소 계산 중복 방지 + 멤버별 이동시간 저장
--
--   - 추천 결과가 비면 모임 화면을 연 모든 멤버가 동시에 계산을 시작해서
--     ODsay 호출이 인원수만큼 배로 늘던 문제를, 모임별 계산 락으로 막는다.
--   - 계산 때 구한 (멤버 × 장소) 이동시간을 travel_times에 저장해서
--     화면 방문 때마다 ODsay를 다시 호출하지 않게 한다.
--   - 저장은 save_recommended_locations RPC 하나로 delete + insert를 처리한다.
--     계산 도중 출발지·일정이 바뀌면 트리거가 락을 지우므로, 낡은 입력으로
--     계산한 결과는 저장되지 않는다.
-- =============================================================


-- -------------------------------------------------------------
-- 1. 멤버별 이동시간 컬럼
--    { "<user_id>": <분> } 형태. ODsay 조회에 실패한 멤버는 키가 없다.
-- -------------------------------------------------------------

ALTER TABLE public.recommended_locations
  ADD COLUMN travel_times jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE VIEW public.recommended_location_coordinates
WITH (security_invoker = true) AS
 SELECT id,
    meeting_id,
    recommended_address AS place_name,
    public.st_y((recommended_location)::public.geometry) AS lat,
    public.st_x((recommended_location)::public.geometry) AS lng,
    travel_times
   FROM public.recommended_locations;


-- -------------------------------------------------------------
-- 2. 계산 락 테이블
--    RPC로만 다루므로 정책을 두지 않는다 (RLS만 켜서 직접 접근 차단).
-- -------------------------------------------------------------

CREATE TABLE public.recommended_location_calc_locks (
  meeting_id bigint PRIMARY KEY REFERENCES public.meetings(id) ON DELETE CASCADE,
  token uuid NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recommended_location_calc_locks ENABLE ROW LEVEL SECURITY;


-- -------------------------------------------------------------
-- 3. 입력이 바뀌면 추천 결과와 함께 진행 중인 계산 락도 지운다
-- -------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.clear_recommended_locations_for_meeting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM recommended_locations
  WHERE meeting_id = COALESCE(NEW.meeting_id, OLD.meeting_id);
  DELETE FROM recommended_location_calc_locks
  WHERE meeting_id = COALESCE(NEW.meeting_id, OLD.meeting_id);
  RETURN NULL;
END;
$$;


-- -------------------------------------------------------------
-- 4. RPC
-- -------------------------------------------------------------

-- 계산 권한 획득. 이미 추천 결과가 있거나 다른 멤버가 계산 중이면 NULL.
-- 2분이 지난 락은 계산하던 탭이 닫힌 것으로 보고 새로 가져갈 수 있다.
CREATE OR REPLACE FUNCTION public.claim_location_calculation(p_meeting_id bigint)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token uuid;
BEGIN
  IF NOT public.is_meeting_member(p_meeting_id) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.recommended_locations WHERE meeting_id = p_meeting_id) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.recommended_location_calc_locks AS l (meeting_id, token, claimed_at)
  VALUES (p_meeting_id, gen_random_uuid(), now())
  ON CONFLICT (meeting_id) DO UPDATE
    SET token = EXCLUDED.token, claimed_at = EXCLUDED.claimed_at
    WHERE l.claimed_at < now() - interval '2 minutes'
  RETURNING l.token INTO v_token;

  RETURN v_token;
END;
$$;

-- 계산 결과 저장 + 락 해제. 락을 잃었으면(시간 초과, 계산 중 입력 변경) 저장하지 않고 false.
-- p_locations: [{ "place_name": text, "lat": number, "lng": number, "travel_times": { "<user_id>": <분> } }]
CREATE OR REPLACE FUNCTION public.save_recommended_locations(
  p_meeting_id bigint,
  p_token uuid,
  p_locations jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_meeting_member(p_meeting_id) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.recommended_location_calc_locks
  WHERE meeting_id = p_meeting_id AND token = p_token;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  DELETE FROM public.recommended_locations WHERE meeting_id = p_meeting_id;

  INSERT INTO public.recommended_locations
    (meeting_id, recommended_location, recommended_address, travel_times)
  SELECT
    p_meeting_id,
    public.st_setsrid(public.st_makepoint(x.lng, x.lat), 4326)::public.geography,
    x.place_name,
    COALESCE(x.travel_times, '{}'::jsonb)
  FROM jsonb_to_recordset(p_locations)
    AS x(place_name text, lat double precision, lng double precision, travel_times jsonb);

  RETURN true;
END;
$$;

-- 계산 실패 시 락을 바로 풀어서 다른 멤버가 재시도할 수 있게 한다.
CREATE OR REPLACE FUNCTION public.release_location_calculation(p_meeting_id bigint, p_token uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM public.recommended_location_calc_locks
  WHERE meeting_id = p_meeting_id
    AND token = p_token
    AND public.is_meeting_member(p_meeting_id);
$$;

REVOKE EXECUTE ON FUNCTION public.claim_location_calculation(bigint) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.save_recommended_locations(bigint, uuid, jsonb) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.release_location_calculation(bigint, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_location_calculation(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_recommended_locations(bigint, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_location_calculation(bigint, uuid) TO authenticated;

-- recommended_locations의 insert/delete 정책은 배포 중인 이전 버전 클라이언트가
-- 직접 쓰고 있으므로 아직 남겨둔다. 새 클라이언트 배포 후 별도 migration으로 제거한다.
