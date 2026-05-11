import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import MyStatus from "./MyStatus";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const [{ data: locations }, { data: schedules }] = await Promise.all([
    supabase
      .from("user_locations")
      .select("name, address")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase.from("user_schedules").select("free_date").eq("user_id", user.id),
  ]);

  return (
    <MyStatus
      userId={user.id}
      initialLocations={(locations ?? []).map((l) => ({
        name: l.name,
        address: l.address ?? "",
      }))}
      initialFreeDates={(schedules ?? []).map((s) => s.free_date as string)}
    />
  );
}
