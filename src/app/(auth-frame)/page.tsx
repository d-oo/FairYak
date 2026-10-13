const FEATURES = [
  "바쁜 날 / 한가한 날 등록",
  "자주 가는 장소 저장",
  "모두가 한가한 날 찾기",
  "모두의 중간 지점 추천",
];

// 프레임과 로그인 사용자 리다이렉트는 (auth-frame) 레이아웃이 맡는다
export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col justify-center px-7 pb-7">
      <h1 className="pt-10 text-[clamp(38px,4.4vw,50px)] leading-[1.12] font-semibold tracking-[-0.035em]">
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
    </div>
  );
}
