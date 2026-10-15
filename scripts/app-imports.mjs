// node --import ./scripts/app-imports.mjs <스크립트>
// 스크립트에서 src/의 앱 코드(TypeScript)를 그대로 import할 수 있게 Next.js 번들러가 해 주던 일을 대신한다.
//  - "@/..." 경로 별칭을 src/로 풀고, 확장자 없는 상대 경로(./errors)에 .ts를 붙인다
//  - import 속성 없이 가져오는 JSON(import x from "./a.json")을 ES 모듈로 감싼다
//  - src/의 .ts는 ES 모듈로 읽는다 (package.json에 "type"이 없어 Node가 형식을 추측하며 경고를 낸다)

import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const SRC_URL = new URL("../src/", import.meta.url);
const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts"];

registerHooks({
  resolve(specifier, context, nextResolve) {
    let base = null;
    if (specifier.startsWith("@/")) base = new URL(specifier.slice(2), SRC_URL);
    else if (specifier.startsWith(".") && context.parentURL?.startsWith("file:"))
      base = new URL(specifier, context.parentURL);
    if (base) {
      for (const ext of EXTENSIONS) {
        const url = new URL(base.href + ext);
        const path = fileURLToPath(url);
        if (existsSync(path) && (ext !== "" || /\.[cm]?[jt]sx?$|\.json$/.test(path)))
          return { url: url.href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".json") && !context.importAttributes?.type) {
      const json = readFileSync(fileURLToPath(url), "utf8");
      return { format: "module", source: `export default ${json};`, shortCircuit: true };
    }
    if (url.startsWith(SRC_URL.href) && url.endsWith(".ts"))
      return nextLoad(url, { ...context, format: "module-typescript" });
    return nextLoad(url, context);
  },
});
