#!/usr/bin/env node
// tools/verify.mjs —— 改档结果验收。每一步都产出可核对的事实,而不是"看起来对了"。
//
//   node tools/verify.mjs --in full.gz
//
// 它检查七件事,每件都能追到一个具体字段或一条源码依据:
//   1. 成就条目数 = 注册表条目数,且**没有清单外的 ID**(脏 ID 会被游戏忽略)
//   2. 成就条目形状正确({ID, unlockedOn})—— 形状错了游戏读不进来
//   3. SourceFiles 覆盖 SF1–SF15
//   4. SyncSteamAchievements 已打开(否则游戏不会把成就推给 Steam)
//   5. exploits 状态(这一项是"留痕"与否的判据,必须显式报告)
//   6. 算出"下一步灌回游戏后,Steam 侧预计新增几条授予"
//   7. 有什么东西是**不能**从存档验证的(诚实边界)

import { resolve } from "node:path";
import {
  readSave, playerOf, achievementsOf, sourceFilesOf, settingsOf,
  readManifestAuto, installFriendlyErrors, parseArgs, die, findData,
} from "./lib.mjs";
import { readFileSync, existsSync } from "node:fs";

installFriendlyErrors();
const args = parseArgs();
const inp = args.in === true ? null : args.in;
if (!inp) die("--in <存档.gz> 是必需的");

const outer = readSave(inp);
const player = playerOf(outer);
const unlockedIds = achievementsOf(player);
const unlocked = new Set(unlockedIds);
const rawAch = player.achievements ?? [];
const sf = sourceFilesOf(player);
const settings = settingsOf(outer);

const manifest = readManifestAuto();
const allIds = manifest.map((a) => a.id);
const allIdSet = new Set(allIds);

// Steam 名单
let notInSteam = new Set();
let steamClassSource = "(缺 steam-classification.json)";
const scPath = findData("steam-classification.json");
if (existsSync(scPath)) {
  const sc = JSON.parse(readFileSync(scPath, "utf8"));
  notInSteam = new Set(sc.notInSteam);
  steamClassSource = "steam-classification.json";
}

const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok, detail });

// 1) 数量与 ID 合法性
const orphan = unlockedIds.filter((id) => !allIdSet.has(id));
check(
  "成就条目数与注册表一致",
  unlocked.size === allIds.length,
  `${unlocked.size} / ${allIds.length}`,
);
check("没有清单外的脏 ID", orphan.length === 0, orphan.length ? orphan.join(" ") : "0 条");

// 2) 条目形状
const badShape = rawAch.filter(
  (a) => !a || typeof a !== "object" || typeof a.ID !== "string" || !("unlockedOn" in a),
);
check(
  "成就条目形状 {ID, unlockedOn}",
  badShape.length === 0,
  badShape.length ? `有 ${badShape.length} 条形状不对:${JSON.stringify(badShape.slice(0, 3))}` : `${rawAch.length} 条全部合规`,
);

// 3) SourceFiles
const sfMissing = [];
for (let n = 1; n <= 15; n++) if (!(sf[n] > 0)) sfMissing.push(n);
check(
  "SourceFiles 覆盖 SF1–SF15",
  sfMissing.length === 0,
  sfMissing.length ? `缺 SF${sfMissing.join(" SF")}` : `15/15,等级 ${JSON.stringify(sf)}`,
);

// 4) Steam 同步开关
const syncOn = settings?.SyncSteamAchievements;
check(
  "SyncSteamAchievements 已开启",
  syncOn === true,
  syncOn === undefined ? "读不到 SettingsSave 结构" : String(syncOn),
);

// 5) exploits(留痕判据)
const ex = player.exploits ?? [];
check(
  "exploits 状态(留痕判据)",
  true, // 不是对错判断,是必须报告的事实
  ex.length === 0
    ? "0 条 —— 游戏无法把这段进度与真实游玩区分(无 SF−1)"
    : `${ex.length} 条 -> ${ex.join(" ")} —— 游戏会显示 Source-File -1(等级 ${ex.length}),可被区分`,
);

// 6) Steam 预计新增授予数
//    依据:主进程处理器只对 "存在于 Steam 名单里、且还没激活过" 的 ID 记一行
//    "Granting Steam achievement <ID>"(resources/app/achievements.js)。
//    未激活集合 = 未同步 Steam 的成就里,当前存档已经解锁的那些。
const notSyncedUnlocked = [...unlocked].filter((id) => notInSteam.has(id));
const steamUnlocked = [...unlocked].filter((id) => !notInSteam.has(id));
check(
  "Steam 口径成就数",
  steamUnlocked.length === 108 - 10,
  `${steamUnlocked.length} / ${108 - 10}  (不同步 Steam: ${notSyncedUnlocked.length} 条 | 名单来源 ${steamClassSource})`,
);
check(
  "灌回后 Steam 侧预计新增授予",
  true,
  `最多 ${steamUnlocked.length} 行 "Granting Steam achievement"(已经激活过的不会重复记)`,
);

// ---- 输出 ----
console.log("改档验收");
console.log("═".repeat(64));
console.log(`存档: ${inp}`);
console.log("");
let allOk = true;
for (const c of checks) {
  if (!c.ok) allOk = false;
  console.log(`${c.ok ? "✅" : "❌"} ${c.name}`);
  console.log(`     ${c.detail}`);
}

console.log("");
console.log("─".repeat(64));
console.log("⚠️ 以下三件事**无法**从存档验证,必须到游戏里看:");
console.log("   1. Steam 侧是否真的全亮 —— 看 %APPDATA%\\bitburner\\logs\\main.log");
console.log("      里 \"Granting Steam achievement\" 行数;幂等复推时新增行数应当是 0。");
console.log("   2. 游戏内成就面板是否显示 108 —— 存档注入不触发 UI 重算,需要重载页面。");
console.log("   3. 改档没有留下任何\"改档检测\"痕迹 —— 这一点由源码保证:");
console.log("      全仓库不存在 EditSaveFile 的授予点或检测点(上游源码里没有它的授予点,也没有检测点)。");

console.log("");
console.log(allOk ? "✅ 存档侧验收通过。" : "❌ 存档侧有未通过项,先修再灌回。");
process.exit(allOk ? 0 : 1);
