import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import Logo from "@/app/_components/Logo";
import DashboardTabBar from "./_components/DashboardTabBar";
import NotificationBell from "./_components/NotificationBell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  const displayName = profile?.name
    ? `${profile.name}(${user.email})`
    : user.email;

  async function handleLogout() {
    "use server";
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    await supabase.auth.signOut();
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-page">
      <header className="sticky top-0 z-20 border-b border-ink bg-paper">
        {/* 알림 패널이 이 영역 기준으로 헤더 구분선 바로 아래, 콘텐츠 오른쪽 끝에 맞춰 열린다 */}
        <div className="relative mx-auto flex min-h-16 max-w-7xl flex-wrap items-center gap-x-8 px-[clamp(16px,4vw,40px)]">
          <Logo href="/dashboard" className="h-16 items-center" />
          <DashboardTabBar />
          <div className="ml-auto flex items-center gap-4">
            <NotificationBell userId={user.id} />
            <span className="hidden text-[13px] text-muted wide:inline">
              {displayName}님
            </span>
            <form action={handleLogout} className="flex">
              <button
                type="submit"
                className="cursor-pointer text-[13px] text-muted hover:text-ink"
              >
                로그아웃
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-[clamp(16px,4vw,40px)] pt-7 pb-16">
        {children}
      </main>
    </div>
  );
}
