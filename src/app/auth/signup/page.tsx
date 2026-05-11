"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

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
    <div className="min-h-screen flex flex-col justify-center px-6 py-12 bg-[#f8f9fa]">
      <div className="w-full max-w-md mx-auto">
        {/* 로고 */}
        <div className="mb-8">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm font-semibold text-[#6b7280] hover:text-[#0d1f2d] transition-colors cursor-pointer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="7 4 10 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-3.5 h-3.5"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span>페어약</span>
          </Link>
        </div>

        <div className="mb-8">
          <h2 className="text-3xl font-bold text-[#0d1f2d]">회원가입</h2>
          <p className="mt-2 text-[#6b7280]">
            계정을 만들고 친구들과 약속을 잡아봐요.
          </p>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-semibold text-[#374151]">
              이름
            </label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="홍길동"
              required
              className="w-full px-4 py-3 rounded-xl border border-[#e5e7eb] bg-white text-[#0d1f2d] placeholder-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#4ecdc4] focus:border-transparent transition-all"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-semibold text-[#374151]">
              이메일
            </label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="hello@example.com"
              required
              className="w-full px-4 py-3 rounded-xl border border-[#e5e7eb] bg-white text-[#0d1f2d] placeholder-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#4ecdc4] focus:border-transparent transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-sm font-semibold text-[#374151]">
                비밀번호
              </label>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder="6자 이상"
                required
                className="w-full px-4 py-3 rounded-xl border border-[#e5e7eb] bg-white text-[#0d1f2d] placeholder-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#4ecdc4] focus:border-transparent transition-all"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-semibold text-[#374151]">
                비밀번호 확인
              </label>
              <input
                type="password"
                name="confirmPassword"
                value={form.confirmPassword}
                onChange={handleChange}
                placeholder="••••••"
                required
                className="w-full px-4 py-3 rounded-xl border border-[#e5e7eb] bg-white text-[#0d1f2d] placeholder-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#4ecdc4] focus:border-transparent transition-all"
              />
            </div>
          </div>

          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-[#0d1f2d] text-white font-semibold text-sm hover:bg-[#1a3244] active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer mt-2"
          >
            {loading ? "가입 중..." : "회원가입"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-[#6b7280]">
            이미 계정이 있으신가요?{" "}
            <Link
              href="/auth/login"
              className="font-semibold text-[#4ecdc4] hover:underline cursor-pointer"
            >
              로그인
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
