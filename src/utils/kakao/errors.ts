// 카카오 API 쿼터 초과(code -10, "API limit has been exceeded"). HTTP 상태는 400으로 오기도 한다.
export class KakaoQuotaExceededError extends Error {
  constructor() {
    super("Kakao API quota exceeded");
  }
}
