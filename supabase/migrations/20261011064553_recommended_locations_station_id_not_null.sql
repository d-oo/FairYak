-- =============================================================
-- recommended_locations.station_id / rank 필수화
--
-- 20261010174020_recommended_locations_station_id.sql은 이전 버전 클라이언트와
-- 호환되도록 두 컬럼을 nullable로 추가했다. 새 클라이언트 배포가 끝났으므로,
-- 그 사이 이전 버전이 카카오 장소명으로 저장한 행(station_id 없음)을 지우고 NOT NULL로 바꾼다.
-- =============================================================

DELETE FROM public.recommended_locations
WHERE station_id IS NULL OR rank IS NULL;

ALTER TABLE public.recommended_locations
  ALTER COLUMN station_id SET NOT NULL,
  ALTER COLUMN rank SET NOT NULL;
