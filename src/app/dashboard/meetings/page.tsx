import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import MeetingList from "../MeetingList";

interface MeetingMember {
  user_id: string;
  profiles: { name: string } | null;
}

export default async function MeetingsPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data } = await supabase
    .from("members")
    .select(
      `
      joined_at,
      meetings (
        id,
        name,
        members (
          user_id,
          profiles (name)
        )
      )
    `,
    )
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false });

  const meetings = (data ?? [])
    .filter((row) => row.meetings)
    .map((row) => {
      const meeting = row.meetings as unknown as {
        id: number;
        name: string;
        members: MeetingMember[];
      };
      const allMembers = meeting.members ?? [];
      const otherNames = allMembers
        .filter((m) => m.user_id !== user.id)
        .map((m) => m.profiles?.name ?? "")
        .filter(Boolean);
      return {
        meetingId: meeting.id,
        meetingName: meeting.name,
        joinedAt: row.joined_at,
        memberCount: allMembers.length,
        otherMemberNames: otherNames,
      };
    });

  return (
    <MeetingList
      userId={user.id}
      userEmail={user.email ?? ""}
      initialMeetings={meetings}
    />
  );
}
