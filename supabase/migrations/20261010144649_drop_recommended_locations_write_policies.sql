-- =============================================================
-- recommended_locations 직접 쓰기 정책 제거
--
-- 추천 결과 저장은 save_recommended_locations RPC(계산 락 확인 + delete/insert를
-- 한 트랜잭션으로 처리)로만 하도록 바꿨다. 이전 버전 클라이언트 호환을 위해
-- 남겨 두었던 insert/delete 정책을 제거해서 락을 우회하는 쓰기를 막는다.
-- (새 클라이언트 배포 후에 적용할 것)
-- =============================================================

DROP POLICY IF EXISTS recommended_locations_insert ON public.recommended_locations;
DROP POLICY IF EXISTS recommended_locations_delete ON public.recommended_locations;
