import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// 브라우저에서는 createBrowserClient가 항상 같은 인스턴스를 돌려준다(싱글턴).
// 그래서 컴포넌트가 렌더마다 호출해도 effect 의존성에 넣었을 때 다시 실행되지 않는다.
export const createClient = () =>
  createBrowserClient(supabaseUrl!, supabaseKey!);
