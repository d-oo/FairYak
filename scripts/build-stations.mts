// 국가철도공단 "전국도시철도역사정보표준데이터" XLSX를 추천 후보용 역 목록 JSON으로 변환한다.
//
//   npm run data:stations -- [XLSX 경로]
//
// 경로를 생략하면 data/raw/에서 가장 최근 파일명(전체_도시철도역사정보_YYYYMMDD.xlsx)을 쓴다.
// 원본은 (역, 노선) 단위 행이라, 같은 역의 여러 노선을 하나의 역으로 묶어서 src/data/stations.json에 쓴다.
// 공공데이터라 역 이름·좌표를 DB에 저장해도 된다 (카카오 로컬 API 응답은 장소명 저장 불가).

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";

const RAW_DIR = "data/raw";
const OUTPUT_PATH = "src/data/stations.json";
// 이름이 같은 행끼리 이 거리 안에 있으면 같은 역으로 본다 (다른 도시의 동명 역 구분용)
const SAME_STATION_MAX_METERS = 1000;

// 1호선 구간처럼 철도 노선명으로 적힌 것들을 사람들이 부르는 이름으로 바꾼다
const LINE_ALIASES: Record<string, string> = {
  경부선: "1호선",
  경원선: "1호선", // 용산~왕십리 구간은 아래 GYEONGWON_GYEONGUI_STATIONS 참고
  경인선: "1호선",
  장항선: "1호선",
  일산선: "3호선",
  안산과천선: "4호선",
  진접선: "4호선",
  분당선: "수인분당선",
  수인선: "수인분당선",
  인천국제공항선: "공항철도",
  에버라인: "용인에버라인",
  의정부: "의정부경전철",
  자기부상철도: "인천자기부상철도",
  김포도시철도: "김포골드라인",
};

// 원본은 경원선(용산~연천)을 한 노선으로 적지만, 용산~왕십리 구간은 실제로 경의중앙선이 다닌다
const GYEONGWON_GYEONGUI_STATIONS = new Set([
  "용산",
  "이촌",
  "서빙고",
  "한남",
  "옥수",
  "응봉",
  "왕십리",
]);

// 노선마다 이름이 다르게 적힌 같은 역 (7호선 "이수" = 4호선 "총신대입구(이수)")
const STATION_KEY_ALIASES: Record<string, string> = { 이수: "총신대입구" };
const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  총신대입구: "총신대입구(이수)역",
};

// 원본 좌표 오류 수동 보정. 키는 `${노선번호}-${역번호}`.
const COORD_OVERRIDES: Record<string, { lat: number; lng: number; note: string }> = {
  // 원본에서 마곡 좌표가 발산과 거의 같게(7m) 들어가 있음. OpenStreetMap "마곡역" 기준.
  "S1105-0514": { lat: 37.559904, lng: 126.825959, note: "마곡" },
  // 원본에서 4호선 이촌 좌표가 신용산과 거의 같게(14m) 들어가 있음. OpenStreetMap "이촌역" 기준.
  "I1104-0430": { lat: 37.522301, lng: 126.973956, note: "이촌(4호선)" },
};

// 같은 노선에서 이름이 다른 역이 이보다 가까우면 좌표 오류로 의심해 경고한다
const SUSPICIOUS_SAME_LINE_METERS = 200;

interface Row {
  stationNo: string;
  rawName: string;
  lineNo: string;
  lineName: string;
  lat: number;
  lng: number;
}

interface Station {
  id: string;
  name: string;
  lines: string[];
  lat: number;
  lng: number;
}

// --- XLSX(zip) 읽기 -------------------------------------------------------

function readZipEntries(buf: Buffer): Map<string, Buffer> {
  // End of Central Directory 레코드를 뒤에서부터 찾는다
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip 형식이 아닙니다");

  const entries = new Map<string, Buffer>();
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);

    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    const data = buf.subarray(start, start + compSize);
    entries.set(name, method === 8 ? inflateRawSync(data) : data);

    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function readSheetRows(xlsxPath: string): Record<string, string>[] {
  const entries = readZipEntries(readFileSync(xlsxPath));
  const sharedXml = entries.get("xl/sharedStrings.xml")?.toString("utf8") ?? "";
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    decodeXml([...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join("")),
  );
  const sheetXml = entries.get("xl/worksheets/sheet1.xml")?.toString("utf8");
  if (!sheetXml) throw new Error("sheet1을 찾을 수 없습니다");

  return [...sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((row) => {
    const cells: Record<string, string> = {};
    for (const c of row[1].matchAll(
      /<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
    )) {
      const [, col, attrs, body = ""] = c;
      const type = attrs.match(/t="(\w+)"/)?.[1];
      const value = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const inline = body.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/)?.[1];
      if (type === "s" && value !== undefined) cells[col] = shared[Number(value)];
      else if (inline !== undefined) cells[col] = decodeXml(inline);
      else if (value !== undefined) cells[col] = decodeXml(value);
    }
    return cells;
  });
}

// --- 정규화 ---------------------------------------------------------------

// "양재(서초구청)" → "양재", "광운대역" → "광운대", "서울역" → "서울"
function stationKey(rawName: string): string {
  let s = rawName.replace(/\s+/g, "").replace(/\(.*?\)/g, "");
  if (s.length > 1 && s.endsWith("역")) s = s.slice(0, -1);
  return STATION_KEY_ALIASES[s] ?? s;
}

// "수도권  도시철도 9호선" → "9호선", "부산 도시철도 2호선" → "부산 2호선", "경부선" → "1호선"
function normalizeLine(raw: string, key: string): string {
  let s = raw.replace(/\s+/g, " ").trim();
  s = s.replace(/^(수도권|서울)?\s*(광역철도|경량도시철도|도시철도)\s*/, "");
  s = s.replace(/^(부산|대구|대전|광주|인천)\s*(경량도시철도|도시철도|지하철)\s*/, "$1 ");
  if (s === "경원선" && GYEONGWON_GYEONGUI_STATIONS.has(key)) return "경의중앙선";
  return LINE_ALIASES[s] ?? s;
}

function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

// --- 변환 -----------------------------------------------------------------

function findLatestXlsx(): string {
  const files = readdirSync(RAW_DIR)
    .filter((f) => /^전체_도시철도역사정보_\d{8}\.xlsx$/.test(f))
    .sort();
  if (files.length === 0)
    throw new Error(`${RAW_DIR}에 전체_도시철도역사정보_YYYYMMDD.xlsx가 없습니다`);
  return join(RAW_DIR, files[files.length - 1]);
}

function main() {
  const xlsxPath = process.argv[2] ?? findLatestXlsx();
  const [header, ...body] = readSheetRows(xlsxPath);

  // 열 위치가 바뀌어도 동작하도록 헤더 이름으로 찾는다
  const col = (label: string) => {
    const found = Object.entries(header).find(([, v]) => v === label)?.[0];
    if (!found) throw new Error(`"${label}" 열을 찾을 수 없습니다`);
    return found;
  };
  const C = {
    stationNo: col("역번호"),
    name: col("역사명"),
    lineNo: col("노선번호"),
    lineName: col("노선명"),
    lat: col("역위도"),
    lng: col("역경도"),
  };

  const rows: Row[] = [];
  const appliedOverrides = new Set<string>();
  let skipped = 0;
  for (const r of body) {
    const lineNo = r[C.lineNo] ?? "";
    const stationNo = r[C.stationNo] ?? "";
    const override = COORD_OVERRIDES[`${lineNo}-${stationNo}`];
    if (override) appliedOverrides.add(`${lineNo}-${stationNo}`);
    const lat = override?.lat ?? Number(r[C.lat]);
    const lng = override?.lng ?? Number(r[C.lng]);
    // 좌표가 없거나 국내 범위를 벗어난 행은 버린다
    if (!(lat > 33 && lat < 39 && lng > 124 && lng < 132) || !r[C.name]) {
      skipped++;
      continue;
    }
    rows.push({
      stationNo,
      rawName: r[C.name],
      lineNo,
      lineName: r[C.lineName] ?? "",
      lat,
      lng,
    });
  }

  // 데이터를 갱신했을 때 보정 대상 행이 사라졌거나 원본이 고쳐졌을 수 있으므로 알린다
  for (const [id, o] of Object.entries(COORD_OVERRIDES)) {
    if (!appliedOverrides.has(id))
      console.warn(`[경고] 좌표 보정 대상 ${id}(${o.note}) 행이 없습니다. 보정이 아직 필요한지 확인하세요.`);
  }

  // 같은 노선에서 이름이 다른 역이 지나치게 가까우면 원본 좌표 오류일 가능성이 높다
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      if (
        a.lineNo === b.lineNo &&
        stationKey(a.rawName) !== stationKey(b.rawName) &&
        distanceMeters(a, b) < SUSPICIOUS_SAME_LINE_METERS
      ) {
        console.warn(
          `[경고] ${a.lineName} ${a.rawName}(${a.lineNo}-${a.stationNo})와 ${b.rawName}(${b.lineNo}-${b.stationNo})가 ${Math.round(distanceMeters(a, b))}m 거리입니다. 좌표 오류인지 확인하고 COORD_OVERRIDES로 보정하세요.`,
        );
      }
    }
  }

  // 이름이 같고 가까운 행끼리 하나의 역으로 묶는다
  const byKey = new Map<string, Row[][]>();
  for (const row of rows) {
    const clusters = byKey.get(stationKey(row.rawName)) ?? [];
    const near = clusters.find(
      (cl) => distanceMeters(cl[0], row) <= SAME_STATION_MAX_METERS,
    );
    if (near) near.push(row);
    else clusters.push([row]);
    byKey.set(stationKey(row.rawName), clusters);
  }

  const stations: Station[] = [];
  for (const [key, clusters] of byKey) {
    for (const cl of clusters) {
      // id는 묶인 행 중 (노선번호-역번호)가 가장 작은 것으로 정해서 재실행해도 바뀌지 않게 한다
      const ids = cl.map((r) => `${r.lineNo}-${r.stationNo}`).sort();
      stations.push({
        id: ids[0],
        name: DISPLAY_NAME_OVERRIDES[key] ?? `${key}역`,
        lines: [...new Set(cl.map((r) => normalizeLine(r.lineName, key)))].sort(),
        lat: round6(cl.reduce((s, r) => s + r.lat, 0) / cl.length),
        lng: round6(cl.reduce((s, r) => s + r.lng, 0) / cl.length),
      });
    }
  }
  stations.sort((a, b) => a.name.localeCompare(b.name, "ko") || a.id.localeCompare(b.id));

  const idCount = new Set(stations.map((s) => s.id)).size;
  if (idCount !== stations.length) throw new Error("역 id가 중복됩니다");

  writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(
      {
        source: `국가철도공단 전국도시철도역사정보표준데이터 (${xlsxPath.split(/[\\/]/).pop()})`,
        stations,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `${xlsxPath}: ${body.length}행 (제외 ${skipped}) → 역 ${stations.length}개 → ${OUTPUT_PATH}`,
  );
}

main();
