// 서버 전용 (KAKAO_REST_API_KEY 사용). 카카오 정책상 로컬 API 응답의 장소명·좌표는 DB에 저장하지 않는다.

import { KakaoQuotaExceededError } from "./errors";

// 좌표 반경 안에서 해당 카테고리(FD6 음식점, CE7 카페 등) 장소 수. 실패하면 null.
// 목록은 필요 없으므로 size=1로 요청하고 meta.total_count만 쓴다.
export async function countCategoryPlaces(
  lat: number,
  lng: number,
  radius: number,
  categoryCode: string,
): Promise<number | null> {
  const params = new URLSearchParams({
    category_group_code: categoryCode,
    x: String(lng),
    y: String(lat),
    radius: String(radius),
    size: "1",
  });
  const res = await fetch(
    `https://dapi.kakao.com/v2/local/search/category.json?${params}`,
    { headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` } },
  );
  const data = await res.json().catch(() => null);
  if (data?.code === -10) throw new KakaoQuotaExceededError();
  if (!res.ok || typeof data?.meta?.total_count !== "number") return null;
  return data.meta.total_count;
}
