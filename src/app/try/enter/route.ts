import { NextRequest, NextResponse } from "next/server";
import { EXHIBITION_COOKIE, isValidExhibitionKey } from "@/utils/exhibition";

// 전시장 노트북 준비용: /try/enter?key=<EXHIBITION_KEY> 로 한 번 들어오면 쿠키를 심고 /try로 보낸다.
// 이후 주소창에 키가 남지 않아 관람객이 키를 볼 수 없다.
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") ?? undefined;
  if (!isValidExhibitionKey(key)) {
    return new NextResponse(null, { status: 404 });
  }

  const res = NextResponse.redirect(new URL("/try", req.url));
  res.cookies.set(EXHIBITION_COOKIE, key!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
