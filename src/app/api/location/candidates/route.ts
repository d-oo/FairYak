import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const radius = searchParams.get("radius") ?? "10000";
  const category = searchParams.get("category") ?? "SW8";

  if (!lat || !lng) {
    return NextResponse.json({ error: "lat, lng required" }, { status: 400 });
  }

  const params = new URLSearchParams({
    category_group_code: category,
    x: lng,
    y: lat,
    radius,
    sort: "distance",
    size: "15",
  });

  const res = await fetch(
    `https://dapi.kakao.com/v2/local/search/category.json?${params}`,
    { headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` } },
  );

  if (!res.ok) {
    return NextResponse.json(
      { error: "Kakao API error" },
      { status: res.status },
    );
  }

  const data = await res.json();

  const places = (data.documents ?? []).map(
    (p: {
      place_name: string;
      road_address_name: string;
      address_name: string;
      x: string;
      y: string;
    }) => ({
      name: p.place_name,
      address: p.road_address_name || p.address_name,
      lat: parseFloat(p.y),
      lng: parseFloat(p.x),
    }),
  );

  return NextResponse.json({ places });
}
