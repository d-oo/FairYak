// 로그인·회원가입·이메일 확인 카드의 안쪽 여백. 프레임과 로그인 사용자 리다이렉트는 상위 (auth-frame) 레이아웃이 맡는다.
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col justify-center px-7 pt-10 pb-8">
      {children}
    </div>
  );
}
