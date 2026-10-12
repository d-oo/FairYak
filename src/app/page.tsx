import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import AuthFrame from "@/app/_components/AuthFrame";

const FEATURES = [
  "바쁜 날 / 한가한 날 등록",
  "자주 가는 장소 저장",
  "모두가 한가한 날 찾기",
  "모두의 중간 지점 추천",
];

export default async function LandingPage() {
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
          href="/auth/login"
          className="text-sm font-medium text-ink hover:text-accent-text"
        >
          로그인
        </Link>
      }
    >
      <div className="flex flex-1 flex-col px-7 pb-7">
        <h1 className="mt-auto pt-10 text-[clamp(38px,4.4vw,50px)] leading-[1.12] font-semibold tracking-[-0.035em]">
          모임 일정 및<br />
          장소 추천
        </h1>
        <p className="mt-5 text-base leading-[1.65] text-muted">
          가입하고 친구들을 초대해보세요.
          <br />
          모두가 만족하는 모임 날짜와 장소를
          <br />
          찾아드릴게요.
        </p>
        <div className="mt-7 flex flex-col border-t border-ink">
          {FEATURES.map((text, i) => (
            <div
              key={text}
              className="grid grid-cols-[44px_1fr] border-b border-rule py-2.75 text-[15px]"
            >
              <span className="pt-0.5 font-mono text-xs text-faint">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{text}</span>
            </div>
          ))}
        </div>
        <div className="mt-7 flex gap-2">
          <Link
            href="/auth/signup"
            className="flex h-13 flex-1 items-center justify-between bg-ink px-5 text-[15px] font-semibold text-paper hover:bg-ink-hover"
          >
            <span>시작하기</span>
            <span className="font-mono">→</span>
          </Link>
          <Link
            href="/auth/login"
            className="flex h-13 flex-1 items-center justify-center border border-ink text-[15px] font-semibold text-ink hover:bg-page"
          >
            로그인
          </Link>
        </div>
      </div>
    </AuthFrame>
  );
}
