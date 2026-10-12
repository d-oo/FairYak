import AuthMap from "@/app/_components/AuthMap";
import Logo from "@/app/_components/Logo";

// 랜딩·로그인·회원가입·이메일 확인이 같이 쓰는 프레임: 회색조 지도 배경 + 왼쪽 452px 패널
export default function AuthFrame({
  headerRight,
  children,
}: {
  headerRight: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-start overflow-hidden bg-map-bg p-3 wide:p-8">
      <AuthMap />
      <div className="relative z-1 mt-[36vh] flex w-[min(452px,100%)] flex-col border border-ink bg-paper wide:mt-0 wide:min-h-[calc(100vh-64px)]">
        <div className="flex items-center justify-between border-b border-ink px-7 py-4.5">
          <Logo href="/" className="items-baseline" />
          {headerRight}
        </div>
        {children}
      </div>
    </div>
  );
}
