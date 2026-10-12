// 지도 오버레이(KakaoMapCanvas) 안에 그리는 공통 표시. 좌표는 오버레이 기준점에서의 픽셀이다.

interface Point {
  x: number;
  y: number;
}

// 멤버 출발지 핀 + 오른쪽 라벨. 나는 주홍
export function MemberPin({
  x,
  y,
  label,
  isMe,
  labelX = 12,
}: Point & { label: string; isMe: boolean; labelX?: number }) {
  return (
    <div className="absolute size-0" style={{ left: x, top: y }}>
      <div
        className={`absolute -left-1.5 -top-1.5 size-3 shadow-halo ${isMe ? "bg-accent" : "bg-ink"}`}
      />
      <div
        className={`absolute -top-2.75 whitespace-nowrap border px-1.75 py-px font-mono text-xs leading-4.5 font-medium ${
          isMe
            ? "border-accent bg-accent text-white"
            : "border-ink bg-paper text-ink"
        }`}
        style={{ left: labelX }}
      >
        {label}
      </div>
    </div>
  );
}

// 핀에서 목적지까지의 점선. 내 선은 주홍
export function RouteLines({
  lines,
}: {
  lines: { from: Point; to: Point; isMe: boolean }[];
}) {
  return (
    <svg
      width={1}
      height={1}
      className="pointer-events-none absolute top-0 left-0 overflow-visible"
    >
      {lines.map(({ from, to, isMe }, i) => (
        <line
          key={i}
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          className={isMe ? "stroke-accent" : "stroke-ink"}
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />
      ))}
    </svg>
  );
}
