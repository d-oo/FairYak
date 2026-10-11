import { notFound } from "next/navigation";
import Script from "next/script";
import { hasExhibitionAccess } from "@/utils/exhibition";

// 졸업전시 체험 모드. 로그인 없이 쓰는 대신 전시용 쿠키가 있어야 열린다 (src/utils/exhibition.ts).
export default async function TryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await hasExhibitionAccess())) notFound();

  return (
    <div className="min-h-screen bg-gray-50">
      {children}
      <Script
        src={`//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_KEY}&autoload=false`}
        strategy="afterInteractive"
      />
    </div>
  );
}
