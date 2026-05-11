import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import MeetingDetailClient from "./MeetingDetailClient";

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const meetingId = parseInt(id);
  if (isNaN(meetingId)) redirect("/dashboard");

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // 멤버 여부 확인
  const { data: myMembership } = await supabase
    .from("members")
    .select("departure_address, departure_location")
    .eq("meeting_id", meetingId)
    .eq("user_id", user.id)
    .single();

  if (!myMembership) redirect("/dashboard");

  const [
    { data: meeting },
    { data: members },
    { data: invitations },
    { data: savedLocations },
    { data: profile },
  ] = await Promise.all([
    supabase.from("meetings").select("id, name").eq("id", meetingId).single(),
    supabase
      .from("members")
      .select(
        "user_id, departure_address, departure_location, joined_at, profiles(name)",
      )
      .eq("meeting_id", meetingId)
      .order("joined_at", { ascending: true }),
    supabase.from("invitations").select("to_user").eq("meeting_id", meetingId),
    supabase
      .from("user_locations")
      .select("name, address")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("name").eq("id", user.id).single(),
  ]);

  if (!meeting) redirect("/dashboard");

  // 초대 대기중 인원 이름 조회
  let pendingInvites: { toUserId: string; toUserName: string }[] = [];
  if (invitations && invitations.length > 0) {
    const { data: inviteProfiles } = await supabase
      .from("profiles")
      .select("id, name")
      .in(
        "id",
        invitations.map((i) => i.to_user),
      );

    pendingInvites = invitations.map((inv) => ({
      toUserId: inv.to_user,
      toUserName:
        inviteProfiles?.find((p) => p.id === inv.to_user)?.name ?? "알 수 없음",
    }));
  }

  return (
    <MeetingDetailClient
      meetingId={meetingId}
      meetingName={meeting.name}
      currentUserId={user.id}
      currentUserName={profile?.name ?? user.email ?? "알 수 없음"}
      currentUserEmail={user.email ?? ""}
      myDepartureAddress={myMembership.departure_address}
      myHasLocation={myMembership.departure_location !== null}
      initialMembers={(members ?? []).map((m) => ({
        userId: m.user_id,
        name:
          (m.profiles as unknown as { name: string } | null)?.name ??
          "알 수 없음",
        hasLocation: m.departure_location !== null,
        departureAddress: m.departure_address,
      }))}
      initialPendingInvites={pendingInvites}
      savedLocations={(savedLocations ?? []).map((l) => ({
        name: l.name,
        address: l.address ?? "",
      }))}
    />
  );
}
