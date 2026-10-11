-- =============================================================
-- 추천 장소를 공공데이터 역 기준으로 저장
--
-- 카카오 정책상 로컬 API가 반환한 장소명은 DB에 저장할 수 없다
-- (https://devtalk.kakao.com/t/local-api/151505). 추천 후보를 공공데이터
-- (국가철도공단 전국도시철도역사정보표준데이터, src/data/stations.json)의 역으로 바꾸고,
-- 역 id와 순위를 함께 저장한다. place_name·좌표도 공공데이터 값이다.
--
-- 이전 버전 클라이언트가 배포 중인 동안에도 동작하도록 새 컬럼은 우선 nullable로 두고,
-- 새 클라이언트 배포 후 별도 migration에서 NOT NULL로 바꾼다.
-- =============================================================

-- 카카오 카테고리 검색 결과(장소명·좌표)로 저장된 기존 추천 결과 삭제. 다음 방문 때 다시 계산된다.
DELETE FROM public.recommended_locations;

ALTER TABLE public.recommended_locations
  ADD COLUMN station_id text,
  ADD COLUMN rank smallint;

DROP VIEW public.recommended_location_coordinates;

CREATE VIEW public.recommended_location_coordinates
WITH (security_invoker = true) AS
 SELECT id,
    meeting_id,
    station_id,
    rank,
    recommended_address AS place_name,
    public.st_y((recommended_location)::public.geometry) AS lat,
    public.st_x((recommended_location)::public.geometry) AS lng
   FROM public.recommended_locations;

GRANT SELECT ON public.recommended_location_coordinates TO authenticated, service_role;

-- p_locations: [{ "station_id": text, "rank": int, "place_name": text, "lat": number, "lng": number }]
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
    (meeting_id, station_id, rank, recommended_location, recommended_address)
  SELECT
    p_meeting_id,
    x.station_id,
    x.rank,
    public.st_setsrid(public.st_makepoint(x.lng, x.lat), 4326)::public.geography,
    x.place_name
  FROM jsonb_to_recordset(p_locations)
    AS x(station_id text, rank smallint, place_name text, lat double precision, lng double precision);

  RETURN true;
END;
$$;
