#!/usr/bin/env node
// tools/grant-all.mjs —— 把一个存档里的成就写成「全部解锁」(离线改档)。
//
// 这是整个流程的**核心动作**。它不碰游戏、不碰客户端文件,只动一个离线 gzip 存档。
//
//   # 0) 先看现状(只读)
//   node tools/grant-all.mjs --in live.gz --report
//
//   # 1) 生成满成就档
//   node tools/grant-all.mjs --in live.gz --out full.gz --sf-all 3
//
//   # 2) 灌回游戏(见 tools/save-bridge.mjs)
//
// 关于 --sf-all:
//   验收口径是「游戏内 108 + Steam 98」,本来不需要 SF。但 SF1–15 全设成 3
//   有两个实际好处:① 打开游戏后 BitVerse 里所有 BN 都已解锁,便于人工抽查;
//   ② BN_DESTROYER 的 Condition(每个 BN 的 SF ≥ 3)会当场变真,游戏自己算出这条,
//      不需要我们硬写 —— 注入的 108 条里它本来就有一份。
//   ⚠️ SF 上限是 3(BN12 无限,见源码),传 >3 会被游戏自行钳制,不会报错。

import { resolve } from "node:path";
import {
  readSave, writeSave, playerOf, putPlayer, settingsOf, putSettings,
  achievementsOf, sourceFilesOf, readManifestAuto, installFriendlyErrors, parseArgs, die,
} from "./lib.mjs";

installFriendlyErrors();
const args = parseArgs();

const inp = args.in === true ? null : args.in;
if (!inp) die("--in <存档.gz> 是必需的");

// ---- 成就 ID 清单:优先 manifest,其次 --ids 指向的 JSON ----
let allIds;
let idSource;
try {
  const idsArg = args.ids === true ? null : args.ids;
  if (idsArg) {
    const j = JSON.parse(await import("node:fs").then((m) => m.readFileSync(resolve(idsArg), "utf8")));
    const src = j.achievements ?? j;
    allIds = Object.values(src).map((a) => a.ID);
    idSource = idsArg;
  } else {
    allIds = readManifestAuto().map((a) => a.id);
    idSource = "achievements.manifest.json";
  }
} catch (e) {
  die(`读不到成就清单(${e.message})。先跑:node extract-registry.mjs --auto --out achievements.manifest.json`);
}

// ---- 读存档 ----
const outer = readSave(inp);
const player = playerOf(outer);
const before = achievementsOf(player);
const sfBefore = sourceFilesOf(player);
const settings = settingsOf(outer);
const steamOn = settings?.SyncSteamAchievements;

const hits = allIds.filter((id) => before.includes(id));
const missing = allIds.filter((id) => !before.includes(id));
// 存档里有、但注册表里没有的(ID 被游戏改过名 / 改档残留)
const orphans = before.filter((id) => !allIds.includes(id));

console.log("── 存档现状 ────────────────────────────────");
console.log(`存档                 : ${inp}`);
console.log(`成就 ID 清单来源     : ${idSource}(${allIds.length} 条)`);
console.log(`存档已有成就         : ${before.length}`);
console.log(`  其中在清单内       : ${hits.length}`);
console.log(`  清单外(孤儿)      : ${orphans.length}${orphans.length ? " -> " + orphans.join(" ") : ""}`);
console.log(`缺                   : ${missing.length}`);
console.log(`SourceFiles          : ${JSON.stringify(sfBefore)}`);
console.log(`exploits             : ${(player.exploits ?? []).length} 条`);
console.log(`SyncSteamAchievements: ${steamOn === undefined ? "(读不到 SettingsSave 结构)" : steamOn}`);

if (args.report) process.exit(0);

// ---- 改档 ----
const now = Date.now();
const byId = new Map((player.achievements ?? []).map((a) => [typeof a === "string" ? a : a.ID, a]));

// 保序策略:已有的按原顺序留下,缺的按清单顺序追加。
// 为什么不整体覆盖?因为顺序是游戏自己的写入顺序,保留它能让"改档前后 diff"最小,
// 也避免把本来合法的历史记录打乱。
player.achievements = [
  ...before.filter((id) => allIds.includes(id)).map((id) => byId.get(id) ?? { ID: id, unlockedOn: now }),
  ...missing.map((id) => byId.get(id) ?? { ID: id, unlockedOn: now }),
];

const sfAll = args["sf-all"] === true ? null : args["sf-all"];
if (sfAll) {
  const lvl = Number(sfAll);
  if (!Number.isFinite(lvl) || lvl < 0) die(`--sf-all 需要一个非负数字,收到 "${sfAll}"`);
  const data = player.sourceFiles?.data ?? (player.sourceFiles = { data: [] }).data;
  for (let n = 1; n <= 15; n++) {
    const hit = data.find((x) => Array.isArray(x) && x[0] === n);
    if (hit) hit[1] = lvl;
    else data.push([n, lvl]);
  }
  console.log(`\nsourceFiles          -> SF1–15 全部置为 ${lvl}`);
}

if (args["steam-sync"]) {
  if (!settings) die("存档里没有 SettingsSave,无法设置 SyncSteamAchievements");
  settings.SyncSteamAchievements = true;
  putSettings(outer, settings);
  console.log("SyncSteamAchievements -> true");
}

// ---- 可选:一次性把 11 条 exploit 也写进去 ----
//
// ⚠️ 这一项是**有留痕**的,而且性质和改成就不同,所以默认关闭,必须显式开启。
//
// 它会做的:把 11 个 exploit 枚举值写进 PlayerSave.exploits。
// 后果有两个,都必须在文档里说清楚:
//   1. 游戏会给你 "Source-File -1: Exploits in the BitNodes" —— 等级 = exploits 条数,
//      并给一个 1.001^n 的加成(n=11 ⇒ ×1.011)。这是**游戏自己记账的标记**,
//      也就是"这段进度和真实游玩可以被区分开"。
//   2. 其中 5 条成就(BYPASS / PROTOTYPETAMPERING / UNCLICKABLE /
//      TIMECOMPRESSION / REALITYALTERATION 等)的 Condition 就是
//      Player.exploits.includes(...) —— 不过它们**本来也会被成就注入覆盖**,
//      所以写 exploits 并不是拿这些成就的必要条件,而只是让 SF−1 显示出来。
//
// 源码依据:PlayerObjectGeneralMethods.ts:581-586 的 giveExploit 是唯一写入漏斗;
// sanitizeExploits()(Exploit.ts:47-50)会过滤非法值 ⇒ 必须填枚举原文。
const EXPLOIT_ENUM = [
  "Bypass",
  "PrototypeTampering",
  "Unclickable",
  "UndocumentedFunctionCall",
  "TimeCompression",
  "RealityAlteration",
  "N00dles",
  "YoureNotMeantToAccessThis",
  "TrueRecursion",
  "INeedARainbow",
  "EditSaveFile",
];

if (args["exploits-all"]) {
  const prev = player.exploits ?? [];
  player.exploits = [...EXPLOIT_ENUM];
  console.log(`\nexploits             -> ${prev.length} 条 -> ${EXPLOIT_ENUM.length} 条`);
  console.log(`                      ⚠️ 这会在游戏里产生 Source-File -1(等级 ${EXPLOIT_ENUM.length}),是可见留痕。`);
}

putPlayer(outer, player);

const outArg = args.out === true ? null : args.out;
if (!outArg) die("--out <输出.gz> 是必需的(只想看现状请加 --report)");
writeSave(outer, outArg);

console.log("\n── 结果 ────────────────────────────────────");
console.log(`写出                 : ${outArg}`);
console.log(`成就                 : ${before.length} -> ${player.achievements.length} / 清单 ${allIds.length}`);
console.log(`SourceFiles          : ${JSON.stringify(sourceFilesOf(player))}`);
console.log("\n下一步:把改好的存档灌回游戏");
console.log(`  node save-bridge.mjs put --port 9222 --in ${outArg} --reload`);
