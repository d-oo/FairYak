-- =============================================================
-- PostGIS 시스템 테이블 public.spatial_ref_sys 쓰기 차단
--
--   - PostGIS가 public 스키마에 설치되어 있어 좌표계 정의 테이블 spatial_ref_sys도
--     PostgREST에 노출되고, anon·authenticated에게 쓰기 권한까지 열려 있다.
--     4326 같은 로우를 지우거나 바꾸면 geography 저장·거리 계산이 깨질 수 있다.
--   - 테이블 소유자와 권한 부여자가 supabase_admin이라 postgres로는 RLS를 켜거나
--     권한을 회수할 수 없다. 대신 postgres에게 있는 TRIGGER 권한으로 쓰기를 막는다.
--   - SELECT는 막지 않는다. PostGIS 함수가 호출한 사용자 권한으로 이 테이블을 읽는다.
--   - Supabase 보안 검사(rls_disabled_in_public)는 RLS 여부만 보므로 경고는 계속 남는다.
-- =============================================================

CREATE FUNCTION public.block_spatial_ref_sys_writes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- PostgREST로 들어온 요청만 막는다 (PostGIS 업데이트 등 내부 역할의 작업은 통과)
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'spatial_ref_sys is read-only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.block_spatial_ref_sys_writes() FROM public, anon, authenticated;

-- 문장 단위 트리거라 영향받는 로우가 없어도 실행되고, 로우 수와 상관없이 한 번만 검사한다
CREATE TRIGGER block_spatial_ref_sys_writes
BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.spatial_ref_sys
FOR EACH STATEMENT
EXECUTE FUNCTION public.block_spatial_ref_sys_writes();
