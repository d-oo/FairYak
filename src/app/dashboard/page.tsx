import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  // 프로필 조회
  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  async function handleLogout() {
    "use server";
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    await supabase.auth.signOut();
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <header className="bg-white border-b border-[#e5e7eb] px-6 py-4 flex items-center justify-between">
        <span className="text-xl font-bold text-[#0d1f2d]">FairYak</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-[#6b7280]">
            {profile?.name ?? user.email}님
          </span>
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

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold text-[#0d1f2d]">
            안녕하세요, {profile?.name ?? ""}님! 👋
          </h1>
          <p className="text-[#6b7280]">
            대시보드가 곧 완성될 예정이에요. 함께 만들어가요!
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#4ecdc4]/10 text-[#4ecdc4] text-sm font-medium">
            <span>✉️</span> {user.email}
          </div>
        </div>
      </main>
    </div>
  );
}
