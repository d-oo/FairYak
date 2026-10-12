import type { Metadata } from "next";
import Script from "next/script";
import { IBM_Plex_Sans_KR, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// 한글 글리프는 unicode-range로 나뉘어 필요한 조각만 내려받으므로 preload하지 않는다
const plexSans = IBM_Plex_Sans_KR({
  variable: "--font-plex-sans",
  weight: ["400", "500", "600", "700"],
  preload: false,
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "페어약: 모임 일정 및 장소 추천 서비스",
  description: "모임 일정 및 장소 추천 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* 랜딩·인증 배경, 모임 상세, 체험 화면이 모두 카카오맵을 쓴다 */}
        <Script
          src={`//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_KEY}&autoload=false`}
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
