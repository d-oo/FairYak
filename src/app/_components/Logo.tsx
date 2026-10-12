import Link from "next/link";

// "페어약" + Mono "FairYak". 정렬(baseline/center)은 놓이는 곳마다 달라서 className으로 받는다.
export default function Logo({
  href,
  className = "",
}: {
  href: string;
  className?: string;
}) {
  return (
    <Link href={href} className={`flex gap-2.5 text-ink ${className}`}>
      <span className="text-xl font-bold tracking-[-0.02em]">페어약</span>
      <span className="font-mono text-xs text-muted">FairYak</span>
    </Link>
  );
}
