#!/usr/bin/env node
// tools/status.mjs —— 从**离线存档**算出成就台账(不需要游戏在跑)。
//
// 这是「台账机算」的核心:不信文档里手写的进度数字,只信存档本身。
//
//   node tools/status.mjs --in save.gz              # 人读摘要
//   node tools/status.mjs --in save.gz --json       # 机器可读
//   node tools/status.mjs --in save.gz --out ledger.json
//
// 它回答四个问题:
//   1. 阶段是哪一段(由 SourceFile 推导,不是手填)
//   2. 成就拿到了几条 / 还缺哪些
//   3. 按 data/routes.json 的轮次表,哪些轮次已完成、下一轮是哪一轮
//   4. 有没有「没有任何轮次认领」的成就(账本完整性检查)

import { resolve } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import {
  readSave, playerOf, achievementsOf, sourceFilesOf, settingsOf,
  readManifestAuto, installFriendlyErrors, parseArgs, die, pct, bar, findData,
} from "./lib.mjs";

installFriendlyErrors();
const args = parseArgs();
const inp = args.in === true ? null : args.in;
if (!inp) die("--in <存档.gz> 是必需的。没有存档?见 README「第一步:把存档导出到本地」。");

const outer = readSave(inp);
const player = playerOf(outer);
const unlocked = new Set(achievementsOf(player));
const sf = sourceFilesOf(player);
const settings = settingsOf(outer);

// ---- 成就清单 ----
let manifest;
let manifestSource;
try {
  manifest = readManifestAuto();
  manifestSource = "achievements.manifest.json";
} catch {
  // 没有 manifest 也能跑,只是没有名字/描述
  manifest = null;
  manifestSource = "(无 manifest,只按 ID 计算)";
}

// ---- Steam 名单 ----
let steamClass = null;
const scPath = findData("steam-classification.json");
if (existsSync(scPath)) steamClass = JSON.parse(readFileSync(scPath, "utf8"));
const notInSteam = new Set(steamClass?.notInSteam ?? []);

// ---- 轮次表 ----
let routes;
try {
  routes = JSON.parse(readFileSync(findData("routes.json"), "utf8"));
} catch (e) {
  die(`读不到 routes.json:${e.message}`);
}
const byGoal = new Map(); // goal id -> [run ids]
for (const r of routes.runs) for (const g of r.goals) {
  if (!byGoal.has(g)) byGoal.set(g, []);
  byGoal.get(g).push(r.id);
}

// ---- 阶段推导(算出来的)----
function stage() {
  const anySf = Object.values(sf).some((v) => v > 0);
  if (!anySf) return { id: "S0", name: "cold-start", why: "没有任何 SourceFile:还进不了 BitVerse,第一轮必须靠 UI/终端半自动完成" };
  if ((sf[4] || 0) < 1) return { id: "S1", name: "pre-sf4", why: "有 SF 但 SF4=0:Singularity 不可用(64 个 ns.singularity.* 全部拒绝访问),下一站必须是 BN4" };
  if ((sf[12] || 0) < 50) return { id: "S2", name: "main-line", why: "SF4 已解锁,按轮次表推进;BN12 尚未到 50 轮" };
  return { id: "S3", name: "ending", why: "SF12 已到 50,只剩收尾轮" };
}

// ---- 轮次台账 ----
const done = [];
const pending = [];
for (const r of routes.runs) {
  const missing = r.goals.filter((g) => !unlocked.has(g));
  (missing.length === 0 ? done : pending).push({ ...r, missing });
}

// ---- 完整性检查:有没有成就没人认领 ----
// 这是一个**硬不变量**:108 条成就每一条都必须被至少一个轮次认领。
// 否则「轮次表跑完了但成就还差几条」这种情况会被悄悄漏掉 —— 旧版账本就坏在这里。
// 注意不要给某些成就开豁免(例如「BN_DESTROYER 是派生的,不用认领」):
// 开豁免就等于把不变量降级成"差不多"。
const allIds = manifest ? manifest.map((a) => a.id) : [...unlocked];
const unassigned = allIds.filter((id) => !byGoal.has(id));
// 反向检查:轮次表里写了、但注册表里不存在的 ID(拼错 / 版本不符)
const bogusGoals = [...byGoal.keys()].filter((id) => manifest && !allIds.includes(id));

// ---- Steam 口径 ----
const total = manifest ? manifest.length : unlocked.size;
const steamTotal = manifest ? manifest.filter((a) => !notInSteam.has(a.id)).length : null;
const steamUnlocked = manifest
  ? manifest.filter((a) => !notInSteam.has(a.id) && unlocked.has(a.id)).length
  : null;

// ---- BN_DESTROYER 进度 ----
const sfMissing = [];
for (let n = 1; n <= 15; n++) if ((sf[n] || 0) < 3) sfMissing.push({ bn: n, lvl: sf[n] || 0 });

const result = {
  save: inp,
  manifestSource,
  gameTotal: total,
  unlocked: unlocked.size,
  missing: total - unlocked.size,
  steam: steamTotal === null ? null : { total: steamTotal, unlocked: steamUnlocked },
  sourceFiles: sf,
  steamSyncSetting: settings?.SyncSteamAchievements ?? null,
  stage: stage(),
  runs: { total: routes.runs.reduce((s, r) => s + (r.repeat || 1), 0), done: done.reduce((s, r) => s + (r.repeat || 1), 0) },
  nextRun: pending[0] ? { id: pending[0].id, bn: pending[0].bn, label: pending[0].label, missing: pending[0].missing } : null,
  pendingRuns: pending.map((r) => ({ id: r.id, bn: r.bn, label: r.label, repeat: r.repeat, missing: r.missing })),
  unassigned,
  bogusGoals,
  bnDestroyer: { ready: sfMissing.length === 0, missingSfLevels: sfMissing },
  // 清单外但存档里有的 ID(改档残留 / 版本不符)
  unknownInSave: manifest ? [...unlocked].filter((id) => !allIds.includes(id)) : [],
};

const outArg = args.out === true ? null : args.out;
if (outArg) {
  writeFileSync(resolve(outArg), JSON.stringify(result, null, 2) + "\n");
}

if (args.json) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

// ---- 人读输出 ----
console.log("Bitburner 成就台账");
console.log("═".repeat(62));
console.log(`存档        : ${inp}`);
console.log(`成就清单    : ${manifestSource}`);
console.log(`阶段        : ${result.stage.id} ${result.stage.name}`);
console.log(`              ${result.stage.why}`);
console.log("");
const rate = total ? unlocked.size / total : 0;
console.log(`游戏内成就  : ${unlocked.size}/${total} (${pct(unlocked.size, total)}) ${bar(rate)}`);
if (steamTotal !== null) {
  console.log(`Steam 口径  : ${steamUnlocked}/${steamTotal} (${pct(steamUnlocked, steamTotal)})`);
} else {
  console.log(`Steam 口径  : (缺 steam-classification.json,算不了)`);
}
console.log(`Steam 同步开关: ${result.steamSyncSetting === null ? "(读不到)" : result.steamSyncSetting}`);
console.log(`SourceFiles : ${Object.keys(sf).length ? JSON.stringify(sf) : "(空)"}`);
console.log("");
console.log(`轮次        : ${result.runs.done} done / ${result.runs.total} total`);
if (result.nextRun) {
  console.log(`下一轮      : ${result.nextRun.id} BN${result.nextRun.bn} 〈${result.nextRun.label}〉`);
  console.log(`              还缺 ${result.nextRun.missing.length} 条: ${result.nextRun.missing.slice(0, 8).join(" ")}${result.nextRun.missing.length > 8 ? " …" : ""}`);
} else {
  console.log(`下一轮      : 无 —— 轮次表上的目标全部达成 🎉`);
}
console.log("");
console.log(`BN_DESTROYER: ${result.bnDestroyer.ready ? "ready(所有 BN 的 SF 均 >= 3)" : "blocked —— 缺 " + sfMissing.map((x) => `SF${x.bn}=${x.lvl}`).join(" ")}`);

if (result.unassigned.length) {
  console.log("");
  console.log(`⚠️ 账本漏洞  : ${result.unassigned.length} 条成就没有任何轮次认领 -> ${result.unassigned.join(" ")}`);
}
if (result.bogusGoals.length) {
  console.log("");
  console.log(`⚠️ 幽灵目标  : 轮次表里有 ${result.bogusGoals.length} 个 ID 在成就注册表里不存在 -> ${result.bogusGoals.join(" ")}`);
}
if (result.unknownInSave.length) {
  console.log("");
  console.log(`⚠️ 清单外 ID : ${result.unknownInSave.length} 条存档里有、清单里没有 -> ${result.unknownInSave.join(" ")}`);
}

// 仍然缺失的成就(最多列 20 条)
const missingIds = allIds.filter((id) => !unlocked.has(id));
if (missingIds.length) {
  console.log("");
  console.log(`仍缺 ${missingIds.length} 条:`);
  const nameOf = new Map((manifest ?? []).map((a) => [a.id, a.name]));
  for (const id of missingIds.slice(0, 20)) {
    console.log(`  ${id.padEnd(26)} ${nameOf.get(id) ?? ""}${notInSteam.has(id) ? "   [NotInSteam]" : ""}`);
  }
  if (missingIds.length > 20) console.log(`  … 还有 ${missingIds.length - 20} 条`);
}
console.log("");
console.log(`验收四条:阶段正确 · 下一轮唯一 · 没有无人认领的成就 · 没有幽灵目标。`);
const verdict = {
  stageKnown: !!result.stage.id,
  nextRunUnique: pending.length === 0 || !!result.nextRun,
  noUnassigned: result.unassigned.length === 0,
  noBogusGoals: result.bogusGoals.length === 0,
};
const failed = Object.entries(verdict).filter(([, v]) => !v);
console.log(
  failed.length === 0
    ? `✅ 四条全部通过。`
    : `❌ 未通过: ${failed.map(([k]) => k).join(", ")}`,
);
