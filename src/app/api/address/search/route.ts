import { NextResponse } from "next/server";
import { isLoggedInOrExhibition } from "@/utils/exhibition";

export async function GET(request: Request) {
  // 외부에서 카카오 쿼터를 소진하지 못하도록 로그인 사용자 또는 전시 체험 모드만 허용
  if (!(await isLoggedInOrExhibition())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");

  if (!query || query.trim().length < 2) {
    return NextResponse.json({ documents: [] });
  }

  const response = await fetch(
    `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=7`,
    {
      headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` },
    },
  );

  if (!response.ok) {
    return NextResponse.json({ documents: [] }, { status: response.status });
  }

  const data = await response.json();
  return NextResponse.json(data);
}
