import { NextResponse } from "next/server";
import { isLoggedInOrExhibition } from "@/utils/exhibition";

type KeywordDocument = {
  place_name: string;
  road_address_name: string;
  address_name: string;
  x: string;
  y: string;
};

type AddressDocument = {
  address_name: string;
  x: string;
  y: string;
  address: { address_name: string } | null;
  road_address: { address_name: string; building_name: string } | null;
};

async function kakaoGet<T>(url: string): Promise<T[]> {
  try {
    const response = await fetch(url, {
      headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` },
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data.documents ?? [];
  } catch {
    return [];
  }
}

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

  const encoded = encodeURIComponent(query);

  const keywordDocs = await kakaoGet<KeywordDocument>(
    `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encoded}&size=7`,
  );
  if (keywordDocs.length > 0) {
    return NextResponse.json({ documents: keywordDocs });
  }

  // 키워드 검색은 이름이 있는 장소만 나오므로, "마천로13길 5"처럼 이름 없는 주소는
  // 결과가 없을 때만 주소 검색으로 한 번 더 찾는다 (쿼터 절약)
  const addressDocs = await kakaoGet<AddressDocument>(
    `https://dapi.kakao.com/v2/local/search/address.json?query=${encoded}&size=5`,
  );

  // 주소 검색 결과를 키워드 검색 결과와 같은 형태로 맞춘다 (이름은 건물명, 없으면 주소)
  const documents: KeywordDocument[] = addressDocs.map((doc) => {
    const road = doc.road_address?.address_name ?? "";
    const jibun = doc.address?.address_name ?? doc.address_name;
    return {
      place_name: doc.road_address?.building_name || road || jibun,
      road_address_name: road,
      address_name: jibun,
      x: doc.x,
      y: doc.y,
    };
  });

  return NextResponse.json({ documents });
}
