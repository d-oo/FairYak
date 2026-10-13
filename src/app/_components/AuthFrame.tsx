import AuthMap from "@/app/_components/AuthMap";
import Logo from "@/app/_components/Logo";

// 랜딩·로그인·회원가입·이메일 확인이 같이 쓰는 프레임: 회색조 지도 배경 + 왼쪽 452px 패널
// 넓은 화면에서는 화면을 오가도 카드 크기가 같도록, 내용이 가장 긴 회원가입 카드 높이(613px)를
// 최소 높이로 두고 나머지 화면은 그 안에서 세로 가운데 정렬한다. 회원가입 내용이 바뀌면 다시 잴 것.
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
      <div className="relative z-1 mt-[36vh] flex w-[min(452px,100%)] flex-col border border-ink bg-paper wide:mt-0 wide:min-h-[613px]">
        <div className="flex items-center justify-between border-b border-ink px-7 py-4.5">
          <Logo href="/" className="items-baseline" />
          {headerRight}
        </div>
        {children}
      </div>
    </div>
  );
}
