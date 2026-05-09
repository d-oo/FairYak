import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const [{ data: profile }, { data: locations }, { data: schedules }] =
    await Promise.all([
      supabase.from("profiles").select("name").eq("id", user.id).single(),
      supabase
        .from("user_locations")
        .select("name, address")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("user_schedules")
        .select("free_date")
        .eq("user_id", user.id),
    ]);

  async function handleLogout() {
    "use server";
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    await supabase.auth.signOut();
    redirect("/");
  }

  const displayName = profile?.name
    ? `${profile.name}(${user.email})`
    : user.email;

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      <header className="bg-white border-b border-[#e5e7eb] px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <span className="text-xl font-bold text-[#0d1f2d] tracking-tight">
          FairYak
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

      <DashboardClient
        userId={user.id}
        userName={profile?.name ?? ""}
        userEmail={user.email ?? ""}
        initialLocations={(locations ?? []).map((l) => ({
          name: l.name,
          address: l.address ?? "",
        }))}
        initialFreeDates={(schedules ?? []).map((s) => s.free_date as string)}
      />
    </div>
  );
}
