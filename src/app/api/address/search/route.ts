import { NextResponse } from "next/server";

export async function GET(request: Request) {
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
