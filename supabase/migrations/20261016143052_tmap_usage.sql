-- =============================================================
-- 졸업전시 체험 모드(/try)의 TMAP 대중교통 폴백 월간 호출 상한
--
--   - 카카오 대중교통 무료 쿼터가 바닥나면 체험 모드만 TMAP(유료, 건당 과금)으로 넘어간다.
--     체험 모드는 로그인 없이 쓰므로, 누가 과도하게 써도 비용이 정해진 선을 넘지 않도록
--     계산 전에 이번에 쓸 최대 호출 수를 먼저 예약하고, 월 상한을 넘으면 예약을 거절한다.
--   - 서버(Next.js API 라우트)가 secret key(service_role)로만 다룬다.
--     RLS를 켜고 정책을 두지 않으며 anon·authenticated 권한을 모두 회수한다.
-- =============================================================


-- -------------------------------------------------------------
-- 1. 월별 호출 수 (예약 기준이라 실제 호출 수보다 같거나 많다)
-- -------------------------------------------------------------

CREATE TABLE public.tmap_usage (
  -- 그 달 1일 (한국 시간 기준)
  month date PRIMARY KEY,
  calls integer NOT NULL DEFAULT 0 CHECK (calls >= 0)
);

ALTER TABLE public.tmap_usage ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tmap_usage FROM anon, authenticated;


-- -------------------------------------------------------------
-- 2. 예약: 이번 달 호출 수 + p_count가 p_monthly_limit 이하일 때만 더하고 true
--    조건부 UPDATE 한 문장이라 동시에 여러 요청이 와도 상한을 넘지 않는다.
-- -------------------------------------------------------------

CREATE FUNCTION public.reserve_tmap_calls(p_count integer, p_monthly_limit integer)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_month date := date_trunc('month', now() AT TIME ZONE 'Asia/Seoul')::date;
BEGIN
  IF p_count <= 0 THEN
    RETURN true;
  END IF;

  INSERT INTO public.tmap_usage (month) VALUES (v_month)
  ON CONFLICT (month) DO NOTHING;

  UPDATE public.tmap_usage
  SET calls = calls + p_count
  WHERE month = v_month
    AND calls + p_count <= p_monthly_limit;

  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reserve_tmap_calls(integer, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_tmap_calls(integer, integer) TO service_role;
