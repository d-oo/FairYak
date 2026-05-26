import { redirect } from "next/navigation";
import Script from "next/script";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import DashboardTabBar from "./_components/DashboardTabBar";

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
    <div className="min-h-screen bg-[#f0f2f5]">
      <header className="bg-white border-b border-[#e5e7eb] px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <span className="text-xl font-bold text-[#0d1f2d] tracking-tight">
          페어약
        </span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-[#6b7280]">{displayName}님</span>
          <form action={handleLogout}>
            <button
              type="submit"
              className="text-sm text-[#6b7280] hover:text-[#0d1f2d] transition-colors cursor-pointer"
            >
              로그아웃
            </button>
          </form>
        </div>
      </header>

      <DashboardTabBar userId={user.id} />

      {children}

      <Script
        src={`//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_KEY}&autoload=false`}
        strategy="afterInteractive"
      />
    </div>
  );
}
