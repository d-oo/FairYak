// 서버 전용. secret key(service_role)로 RLS를 우회하는 Supabase 클라이언트.
// 사용자 요청과 무관한 서버 내부 기록(TMAP 사용량 상한 등)에만 쓴다. 클라이언트 컴포넌트에서 import하지 말 것.
// SUPABASE_SECRET_KEY에는 절대 NEXT_PUBLIC_ 접두사를 붙이지 않는다 (브라우저 번들에 포함됨).

import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) throw new Error("SUPABASE_SECRET_KEY가 설정되지 않았어요");
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
