import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import AuthFrame from "@/app/_components/AuthFrame";
import HeaderLink from "./_components/HeaderLink";

// 랜딩과 로그인·회원가입·이메일 확인이 같이 쓰는 레이아웃 (라우트 그룹이라 URL에는 나타나지 않는다).
// 프레임(지도 배경 + 카드)을 여기서 한 번만 그려야 화면을 오갈 때 지도가 다시 만들어지며 깜빡이지 않는다.
export default async function AuthFrameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  return <AuthFrame headerRight={<HeaderLink />}>{children}</AuthFrame>;
}
