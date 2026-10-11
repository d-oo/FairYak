// 서버 전용. 졸업전시 체험 모드(/try) 접근 확인.
//
// 전시장 노트북에서만 쓰므로 로그인 대신 전시용 키로 막는다. 스태프가 `/try/enter?key=...`로 한 번
// 들어가면 키가 httpOnly 쿠키로 저장되고, 이후 체험 화면·API는 이 쿠키를 확인한다.
// 환경변수 EXHIBITION_KEY를 지우면 체험 모드 전체가 꺼진다.

import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export const EXHIBITION_COOKIE = "fairyak_exhibition";

export function isValidExhibitionKey(value: string | undefined): boolean {
  const key = process.env.EXHIBITION_KEY;
  if (!key || !value) return false;
  const a = Buffer.from(value);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function hasExhibitionAccess(): Promise<boolean> {
  const cookieStore = await cookies();
  return isValidExhibitionKey(cookieStore.get(EXHIBITION_COOKIE)?.value);
}

// 카카오 쿼터를 쓰는 API 라우트용: 로그인 사용자 또는 전시 체험 모드만 허용
export async function isLoggedInOrExhibition(): Promise<boolean> {
  if (await hasExhibitionAccess()) return true;
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user !== null;
}
