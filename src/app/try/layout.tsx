import { notFound } from "next/navigation";
import { hasExhibitionAccess } from "@/utils/exhibition";
import Logo from "@/app/_components/Logo";

// 졸업전시 체험 모드. 로그인 없이 쓰는 대신 전시용 쿠키가 있어야 열린다 (src/utils/exhibition.ts).
export default async function TryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await hasExhibitionAccess())) notFound();

  return (
    <div className="min-h-screen bg-page">
      <header className="sticky top-0 z-20 border-b border-ink bg-paper">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center px-[clamp(16px,4vw,40px)]">
          <Logo href="/try" className="h-16 items-center" />
          <span className="ml-auto font-mono text-xs text-muted">체험 모드</span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-[clamp(16px,4vw,40px)] pt-7 pb-16">
        {children}
      </main>
    </div>
  );
}
