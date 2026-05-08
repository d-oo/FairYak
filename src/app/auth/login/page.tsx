"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

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
    <div className="min-h-screen flex flex-col justify-center px-6 py-12 bg-[#f8f9fa]">
      <div className="w-full max-w-md mx-auto">
        {/* 로고 */}
        <div className="mb-8">
          <Link
            href="/"
            className="text-2xl font-bold text-[#0d1f2d] hover:text-[#4ecdc4] transition-colors cursor-pointer"
          >
            FairYak
          </Link>
        </div>

        <div className="mb-8">
          <h2 className="text-3xl font-bold text-[#0d1f2d]">로그인</h2>
          <p className="mt-2 text-[#6b7280]">로그인해서 일정을 저장해보세요.</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-semibold text-[#374151]">
              이메일
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="hello@example.com"
              required
              className="w-full px-4 py-3 rounded-xl border border-[#e5e7eb] bg-white text-[#0d1f2d] placeholder-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#4ecdc4] focus:border-transparent transition-all"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="block text-sm font-semibold text-[#374151]">
                비밀번호
              </label>
              <button
                type="button"
                className="text-xs text-[#4ecdc4] hover:underline cursor-pointer"
              >
                비밀번호를 잊으셨나요?
              </button>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-4 py-3 rounded-xl border border-[#e5e7eb] bg-white text-[#0d1f2d] placeholder-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#4ecdc4] focus:border-transparent transition-all"
            />
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
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-[#6b7280]">
            아직 계정이 없으신가요?{" "}
            <Link
              href="/auth/signup"
              className="font-semibold text-[#4ecdc4] hover:underline cursor-pointer"
            >
              회원가입
            </Link>
          </p>
        </div>

        <div className="mt-4 text-center">
          <Link
            href="/"
            className="text-sm text-[#9ca3af] hover:text-[#6b7280] transition-colors cursor-pointer"
          >
            ← 홈으로
          </Link>
        </div>
      </div>
    </div>
  );
}
