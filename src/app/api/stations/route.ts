import { NextRequest, NextResponse } from "next/server";
import stationsData from "@/data/stations.json";

// 역 id로 노선 목록을 돌려준다. 추천 결과는 역 id만 저장되어 있어서, 화면에
// "약수역 3호선, 6호선"처럼 노선을 붙이려면 공공데이터 역 목록에서 찾아야 한다.
// 역 목록(src/data/stations.json)을 클라이언트 번들에 싣지 않으려고 서버에서 찾는다.
// 공공데이터만 다루고 카카오 쿼터를 쓰지 않으므로 로그인 확인은 하지 않는다.

const linesById = new Map(
  (stationsData.stations as { id: string; lines: string[] }[]).map((s) => [
    s.id,
    s.lines,
  ]),
);

const MAX_IDS = 20;

export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .filter(Boolean)
    .slice(0, MAX_IDS);

  return NextResponse.json({
    stations: ids.map((id) => ({ id, lines: linesById.get(id) ?? [] })),
  });
}
