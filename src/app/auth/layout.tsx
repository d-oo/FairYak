import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import AuthFrame from "@/app/_components/AuthFrame";
import BackIcon from "@/app/_components/BackIcon";

export default async function AuthLayout({
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

  return (
    <AuthFrame
      headerRight={
        <Link
          href="/"
          className="flex items-center gap-1.5 font-mono text-[13px] text-muted hover:text-ink"
        >
          <BackIcon />
          처음으로
        </Link>
      }
    >
      <div className="flex flex-1 flex-col justify-center px-7 pt-10 pb-8">
        {children}
      </div>
    </AuthFrame>
  );
}
