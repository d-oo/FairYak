-- =============================================================
-- 추천 장소의 멤버별 이동시간 저장 제거
--
-- 이동시간 조회를 카카오맵 대중교통 경로 조회 API로 바꿨는데, 카카오 정책상
-- 조회 결과는 저장·임시 캐싱이 허용되지 않는다. travel_times 컬럼을 없애고
-- 화면에서 필요할 때마다 조회한다. 저장 RPC도 이동시간을 받지 않게 바꾼다.
-- (travel_times를 읽지 않는 새 클라이언트 배포 후에 적용할 것)
-- =============================================================

-- CREATE OR REPLACE VIEW로는 컬럼을 뺄 수 없으므로 다시 만든다
DROP VIEW public.recommended_location_coordinates;

ALTER TABLE public.recommended_locations DROP COLUMN travel_times;

CREATE VIEW public.recommended_location_coordinates
WITH (security_invoker = true) AS
 SELECT id,
    meeting_id,
    recommended_address AS place_name,
    public.st_y((recommended_location)::public.geometry) AS lat,
    public.st_x((recommended_location)::public.geometry) AS lng
   FROM public.recommended_locations;

GRANT SELECT ON public.recommended_location_coordinates TO authenticated, service_role;

-- p_locations: [{ "place_name": text, "lat": number, "lng": number }]
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
    (meeting_id, recommended_location, recommended_address)
  SELECT
    p_meeting_id,
    public.st_setsrid(public.st_makepoint(x.lng, x.lat), 4326)::public.geography,
    x.place_name
  FROM jsonb_to_recordset(p_locations)
    AS x(place_name text, lat double precision, lng double precision);

  RETURN true;
END;
$$;
