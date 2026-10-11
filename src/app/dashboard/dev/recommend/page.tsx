import { notFound } from "next/navigation";
import RecommendDebug from "./_components/RecommendDebug";

// 개발용 추천 과정 테스트 페이지. 카카오 쿼터를 쓰므로 개발 서버(npm run dev)에서만 연다.
export default function RecommendDebugPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <RecommendDebug />;
}
