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

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSignup(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) {
      setError("비밀번호가 일치하지 않아요.");
      return;
    }
    if (form.password.length < 6) {
      setError("비밀번호는 최소 6자 이상이어야 해요.");
      return;
    }

    setLoading(true);

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: { name: form.name },
      },
    });

    if (authError) {
      setError(
        authError.message.includes("already registered")
          ? "이미 가입된 이메일이에요."
          : "회원가입 중 오류가 발생했어요. 다시 시도해주세요.",
      );
      setLoading(false);
      return;
    }

    // identities가 비어있으면 이미 가입된 이메일 (Supabase 이메일 열거 방지 정책)
    if (!authData.user?.identities || authData.user.identities.length === 0) {
      setError("이미 가입된 이메일이에요.");
      setLoading(false);
      return;
    }

    // profiles 테이블 insert는 DB 트리거가 처리

    // 이메일 확인이 필요한 경우 (session === null)
    if (!authData.session) {
      router.push(`/auth/confirm?email=${encodeURIComponent(form.email)}`);
      return;
    }

    // 이메일 확인이 비활성화된 경우 바로 대시보드로
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <>
      <h1 className="text-[32px] font-semibold tracking-[-0.03em]">회원가입</h1>
      <p className="mt-2 text-[15px] text-muted">
        계정을 만들고 친구들과 약속을 잡아봐요.
      </p>

      <form onSubmit={handleSignup} className="mt-7 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold">이름</span>
          <input
            type="text"
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="홍길동"
            required
            className={INPUT_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold">이메일</span>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            placeholder="hello@example.com"
            required
            className={INPUT_CLASS}
          />
        </label>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">비밀번호</span>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="6자 이상"
              required
              className={INPUT_CLASS}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">비밀번호 확인</span>
            <input
              type="password"
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={handleChange}
              placeholder="••••••"
              required
              className={INPUT_CLASS}
            />
          </label>
        </div>

        {error && <p className={ERROR_CLASS}>{error}</p>}

        <button type="submit" disabled={loading} className={SUBMIT_CLASS}>
          {loading ? "가입 중..." : "회원가입"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        이미 계정이 있으신가요?{" "}
        <Link href="/auth/login" className={LINK_CLASS}>
          로그인
        </Link>
      </p>
    </>
  );
}
