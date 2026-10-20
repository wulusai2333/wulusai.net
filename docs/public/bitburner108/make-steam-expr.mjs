#!/usr/bin/env node
// tools/make-steam-expr.mjs —— 生成一段「把全部成就推给 Steam」的页面表达式。
//
// 为什么不直接写在命令行上:108 个 ID 拼成的表达式约 900 字符,经 shell 引号转义后
// 极易出错,而且不同终端的转义规则不一样。生成一个 .js 文件再交给
// cdp-eval.mjs --expr-file 是最稳的做法。
//
//   node tools/make-steam-expr.mjs --out tools/grant-steam.expr.js
//   node tools/cdp-eval.mjs --expr-file tools/grant-steam.expr.js
//
// 生成的表达式做三件事:
//   1. 检查 window.electronBridge 存在(不在 Steam 版 / preload 没加载时会缺)
//   2. 把 108 个 ID 一次性发给主进程的 activate-achievements IPC
//   3. 返回一句人可读的结果
//
// ⚠️ 为什么发 108 个而 Steam 只有 98 条是安全的:
//   主进程处理器(resources/app/achievements.js)自己会过滤:
//       if (!allSteamAchievements.includes(achievement)) continue;
//   多出来的 10 条被静默跳过,不报错、不计数。

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readManifestAuto, installFriendlyErrors, parseArgs, die, findData } from "./lib.mjs";

installFriendlyErrors();
const args = parseArgs();

let ids;
try {
  ids = readManifestAuto().map((a) => a.id);
} catch (e) {
  die(`读不到 data/achievements.manifest.json(${e.message})。\n先跑:node extract-registry.mjs --auto --out achievements.manifest.json`);
}

// 可选:把 NotInSteam 的那 10 条剔掉再发。
// 默认**不剔** —— 发全量更能暴露"清单和游戏实际注册表是否一致"。
const steamOnly = !!args["steam-only"];
if (steamOnly) {
  try {
    const c = JSON.parse(readFileSync(findData("steam-classification.json"), "utf8"));
    const drop = new Set(c.notInSteam);
    ids = ids.filter((id) => !drop.has(id));
  } catch (e) {
    die(`--steam-only 需要 steam-classification.json(${e.message})`);
  }
}

const expr = `(async () => {
  if (!window.electronBridge || typeof window.electronBridge.send !== "function") {
    return "FAIL: 页面上没有 window.electronBridge —— 这不是 Steam 版,或 preload 没加载。";
  }
  const ids = ${JSON.stringify(ids)};
  window.electronBridge.send("activate-achievements", { achievements: ids });
  return "sent " + ids.length + " ids to activate-achievements";
})()`;

const out = args.out === true || args.out === undefined ? "tools/grant-steam.expr.js" : args.out;
writeFileSync(resolve(out), expr + "\n");
console.log(`已生成 ${resolve(out)}`);
console.log(`  将推送 ${ids.length} 个成就 ID${steamOnly ? "(已剔除 NotInSteam 的 10 条)" : "(含 NotInSteam 的 10 条,主进程会自行跳过)"}`);
console.log("");
console.log("下一步:");
console.log(`  node cdp-eval.mjs --expr-file ${out}`);
console.log("");
console.log("验收(唯一可靠判据):看主进程日志里新增了几行 Granting Steam achievement");
console.log("  %APPDATA%\\bitburner\\logs\\main.log");
