import { NextResponse } from "next/server";
import { isLoggedInOrExhibition } from "@/utils/exhibition";

export async function GET(request: Request) {
  // 외부에서 카카오 쿼터를 소진하지 못하도록 로그인 사용자 또는 전시 체험 모드만 허용
  if (!(await isLoggedInOrExhibition())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json(
      { error: "lat, lng 파라미터가 필요해요." },
      { status: 400 },
    );
  }

  const response = await fetch(
    `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`,
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
