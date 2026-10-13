"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import {
  ERROR_CLASS,
  INPUT_CLASS,
  LINK_CLASS,
  SUBMIT_CLASS,
} from "@/app/(auth-frame)/auth/_components/styles";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError("이메일 또는 비밀번호가 올바르지 않아요.");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <>
      <h1 className="text-[32px] font-semibold tracking-[-0.03em]">로그인</h1>

      <form onSubmit={handleLogin} className="mt-7 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold">이메일</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="hello@example.com"
            required
            className={INPUT_CLASS}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold">비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            className={INPUT_CLASS}
          />
        </label>

        {error && <p className={ERROR_CLASS}>{error}</p>}

        <button type="submit" disabled={loading} className={SUBMIT_CLASS}>
          {loading ? "로그인 중..." : "로그인"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        아직 계정이 없으신가요?{" "}
        <Link href="/auth/signup" className={LINK_CLASS}>
          회원가입
        </Link>
      </p>
    </>
  );
}
