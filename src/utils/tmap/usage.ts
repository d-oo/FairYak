// 서버 전용. TMAP 호출의 월간 상한 (supabase/migrations/*_tmap_usage.sql).
// 체험 모드는 로그인 없이 쓰므로 누가 과도하게 써도 비용이 이 선을 넘지 않게 한다.
// 요약정보 API 건당 0.55원 기준 월 최대 약 5,500원.

import { createAdminClient } from "@/utils/supabase/admin";

export const TMAP_MONTHLY_LIMIT = 10000;

// 이번 달 상한 안에서 count건을 예약한다. 상한을 넘으면 false (아무것도 더하지 않음).
// DB 오류나 secret key 미설정이면 던진다 (예약 확인 없이 TMAP을 부르지 않도록)
export async function reserveTmapCalls(count: number): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("reserve_tmap_calls", {
    p_count: count,
    p_monthly_limit: TMAP_MONTHLY_LIMIT,
  });
  if (error) throw new Error(`TMAP 사용량 예약 실패: ${error.message}`);
  return data === true;
}
