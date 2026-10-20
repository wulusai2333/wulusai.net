// tools/lib.mjs —— 存档格式层 / 成就注册表层。
//
// 这个文件是整套工具的共用底座,不直接执行。它负责三件容易被搞错的事:
//
//   1. 存档的**嵌套形状**。Bitburner 的 IndexedDB 存档是 gzip(JSON),但这个 JSON
//      里几乎所有字段都是**被 JSON.stringify 过的字符串**,并且外面包着 {ctor,data} 壳。
//      不 unwrap 就拿不到 achievements。
//   2. **成就注册表**的获取。唯一权威来源是正在运行的那份 bundle —— 不是任何外部清单。
//   3. 写出时的**保序**:已有成就按原顺序保留,新条目追加(见 grant-all 的说明)。

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const PKG_ROOT = resolve(HERE, "..");
export const MANIFEST = resolve(PKG_ROOT, "data", "achievements.manifest.json");

/**
 * 在几个常见位置找数据文件。
 * 这样同一份代码在两种布局下都能跑:
 *   · 工具与数据分离   tools/ 与 data/ 平级
 *   · 平铺             所有文件在同一个目录里
 */
export function findData(name) {
  const candidates = [
    resolve(HERE, "data", name), // tools/data/<name>
    resolve(HERE, name), // 与脚本同目录(平铺布局)
    resolve(PKG_ROOT, "data", name), // 上一级的 data/
    resolve(process.cwd(), name), // 当前工作目录
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0];
}

/**
 * 成就注册表的位置。
 * 优先用环境变量,其次扫常见 Steam 库位置。不硬编码任何具体机器的路径 ——
 * 别人的游戏可能装在别的盘。
 */
export const BUNDLE_RELATIVE = "steamapps/common/Bitburner/resources/app/dist/main.bundle.js";

export function candidateBundles() {
  const explicit = process.env.BITBURNER_BUNDLE;
  if (explicit) return [explicit];
  const driveLibraries = [];
  for (const drive of ["C", "D", "E", "F", "G"]) {
    driveLibraries.push(`${drive}:/SteamLibrary/${BUNDLE_RELATIVE}`);
    driveLibraries.push(`${drive}:/Program Files (x86)/Steam/${BUNDLE_RELATIVE}`);
    driveLibraries.push(`${drive}:/Steam/${BUNDLE_RELATIVE}`);
  }
  return driveLibraries;
}

/** 能不能找到 bundle;找到就返回第一个存在的路径,找不到返回 null。 */
export function defaultBundle() {
  for (const p of candidateBundles()) if (existsSync(p)) return p;
  return null;
}

// ---------------------------------------------------------------------------
// 1. 存档形状
// ---------------------------------------------------------------------------

/**
 * 反复剥壳:{"ctor":"...","data":"<json 字符串>"} → 里面的对象。
 * 深度上限 6 是防御性的 —— 正常存档 2~3 层就到底了。
 */
export function unwrap(v, maxDepth = 6) {
  let cur = typeof v === "string" ? JSON.parse(v) : v;
  let d = 0;
  while (cur && typeof cur === "object" && "data" in cur && d < maxDepth) {
    const next = cur.data;
    if (next === undefined || next === null) break;
    // 只有"带 ctor 的壳"才继续剥;BareInstance 之类直接停。
    if (!("ctor" in cur)) break;
    cur = typeof next === "string" ? JSON.parse(next) : next;
    d++;
  }
  return cur;
}

/** 读一个 gzip 存档,返回原始外层对象(不剥壳 —— 写回时要原样保留)。 */
export function readSave(path) {
  if (!existsSync(path)) {
    throw new Error(
      `存档文件不存在:${path}\n` +
        "  · 路径写对了吗?(Windows 上 Node 里用正斜杠或双反斜杠)\n" +
        "  · 还没导出过?先跑:node save-bridge.mjs get --port 9222 --out live.gz",
    );
  }
  let buf;
  try {
    buf = readFileSync(path);
  } catch (e) {
    throw new Error(`读不了 ${path}:${e.message}`);
  }
  if (buf.length < 2 || buf[0] !== 0x1f || buf[1] !== 0x8b) {
    throw new Error(
      `${path} 不是 gzip(魔数 ${buf.subarray(0, 2).toString("hex")})。\n` +
        "  这个工具只吃 gzip 的 IndexedDB 存档。如果你拿到的是明文 JSON," +
        "说明来源不对 —— 见 docs/WALKTHROUGH.md §1。",
    );
  }
  let outer;
  try {
    outer = JSON.parse(gunzipSync(buf).toString("utf8"));
  } catch (e) {
    throw new Error(`${path} 解压/解析失败:${e.message}(文件可能损坏或被截断)`);
  }
  if (!outer || !outer.data) {
    throw new Error(`${path} 不是合法的 Bitburner 存档:缺少顶层 .data`);
  }
  return outer;
}

/** 从外层对象里取出 PlayerSave 的**可写对象**(剥壳后的)。 */
export function playerOf(outer) {
  return unwrap(outer.data.PlayerSave);
}

/** 从外层对象里取出 SettingsSave 的**可写对象**(可能不存在)。 */
export function settingsOf(outer) {
  if (!outer.data.SettingsSave) return null;
  return unwrap(outer.data.SettingsSave);
}

/** 把(可能被改过的)PlayerSave 塞回外层对象。注意:只序列化一层。 */
export function putPlayer(outer, player) {
  outer.data.PlayerSave = JSON.stringify(player);
}

/** 把(可能被改过的)SettingsSave 塞回外层对象。 */
export function putSettings(outer, settings) {
  if (settings) outer.data.SettingsSave = JSON.stringify(settings);
}

/** 写出 gzip 存档。 */
export function writeSave(outer, path) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), gzipSync(Buffer.from(JSON.stringify(outer), "utf8")));
}

/** 从 PlayerSave 里读 SourceFile 等级表 → {1:3, 2:3, ...}。 */
export function sourceFilesOf(player) {
  const raw = player?.sourceFiles?.data ?? player?.sourceFiles ?? [];
  const sf = {};
  if (Array.isArray(raw)) {
    for (const e of raw) {
      if (Array.isArray(e)) sf[e[0]] = e[1];
      else if (e && typeof e === "object") sf[e.key ?? e[0]] = e.value ?? e[1];
    }
  } else if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw)) sf[k] = v;
  }
  return sf;
}

/** 从 PlayerSave 里读已解锁成就 ID 数组(保序)。 */
export function achievementsOf(player) {
  const raw = player?.achievements ?? [];
  return raw.map((a) => (typeof a === "string" ? a : a.ID)).filter(Boolean);
}

// ---------------------------------------------------------------------------
// 2. 从游戏 bundle 里抠出成就注册表
// ---------------------------------------------------------------------------

/**
 * 在 bundle 里定位成就注册表。
 *
 * 已核实的形状(v3.0.1,bundle 第 4837342 字节附近):
 *   e.exports=JSON.parse('{"P":{"CYBERSEC":{"ID":"CYBERSEC","Name":"...","Description":"..."},...}}')
 *
 * 两个坑:
 *   a) 这是**单引号** JS 字符串字面量,所以里面的撇号写成 `\'`(例如 "They\'re lunatics")。
 *      直接 JSON.parse 会报 Bad escaped character —— 必须先把 `\'` 修成 `'`。
 *   b) 不能靠正则找结尾,得做**括号配平**,并且跳过字符串内的括号。
 */
export function extractRegistry(bundlePath) {
  const raw = readFileSync(bundlePath, "latin1"); // latin1 = 1 字节 1 字符,下标与字节数一致
  const anchor = '"ID":"CYBERSEC"';
  const at = raw.indexOf(anchor);
  if (at < 0) throw new Error(`在 ${bundlePath} 里找不到成就注册表锚点;这真的是 Bitburner 的 bundle 吗?`);

  // 往前找到注册表对象的开头 `{"P":`
  const objStart = raw.lastIndexOf('{"P":', at);
  if (objStart < 0) throw new Error("找到了锚点,但找不到注册表对象起点 {\"P\":");

  // 从 objStart 开始做括号配平(跳过字符串)
  let depth = 0;
  let inStr = false;
  let quote = "";
  let end = -1;
  for (let i = objStart; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (c === "\\") i++; // 跳过被转义的字符
      else if (c === quote) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = true;
      quote = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) throw new Error("注册表对象没有闭合;bundle 可能被改过");

  let text = raw.slice(objStart, end + 1);
  // 修掉 JS 单引号字符串里的 `\'`(JSON 里这是非法转义)
  text = text.replace(/\\'/g, "'");
  return JSON.parse(text);
}

/** 从 bundle 里取成就注册表 → 归一化成 [{id,name,description,notInSteam}]。 */
export function registryFromBundle(bundlePath = defaultBundle()) {
  if (!bundlePath) {
    throw new Error(
      "没能定位到游戏的 main.bundle.js。请设 BITBURNER_BUNDLE=<路径>,或改用 tools/classify-steam.mjs 的 --source 模式。",
    );
  }
  if (!existsSync(bundlePath)) {
    throw new Error(`bundle 不存在:${bundlePath}(用 BITBURNER_BUNDLE 环境变量指定正确路径)`);
  }
  const obj = extractRegistry(bundlePath);
  const src = obj.P ?? obj; // 顶层可能是 {P:{...}},也可能直接是注册表
  return Object.values(src)
    .map((a) => ({
      id: a.ID,
      name: a.Name ?? a.ID,
      description: a.Description ?? "",
      notInSteam: !!a.NotInSteam,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** 读本地 manifest(如果已经生成过)。 */
export function readManifest(path = MANIFEST) {
  const j = JSON.parse(readFileSync(path, "utf8"));
  return j.achievements ?? j;
}

/**
 * 读 manifest —— 上面那个函数的"位置自适应"版本,推荐新代码用它。
 * 区别:readManifest 只在仓库布局下有效;readManifestAuto 会先去找文件。
 */
export function readManifestAuto() {
  const p = findData("achievements.manifest.json");
  if (!existsSync(p)) {
    throw new Error(
      `找不到 achievements.manifest.json(试过若干位置)。\n` +
        `这个文件是成就 ID 清单,必须和脚本放在一起。见 README「文件清单」。`,
    );
  }
  return readManifest(p);
}

// ---------------------------------------------------------------------------
// 3. 小工具
// ---------------------------------------------------------------------------

export const pct = (n, d) => (d ? ((n / d) * 100).toFixed(1) + "%" : "n/a");

export function bar(rate, width = 24) {
  const n = Math.round(rate * width);
  return "█".repeat(n) + "░".repeat(Math.max(0, width - n));
}

/** 极简参数解析:--key value / --flag。 */
export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) out[k] = true;
      else {
        out[k] = next;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}

export function die(msg, code = 1) {
  console.error("错误:" + msg);
  process.exit(code);
}

/**
 * 把顶层异常变成一行人话,而不是一屏 stack trace。
 * 用法(在各工具的末尾):`installFriendlyErrors();`
 */
export function installFriendlyErrors() {
  process.on("uncaughtException", (e) => {
    console.error("\n错误:" + (e?.message ?? e));
    process.exit(1);
  });
  process.on("unhandledRejection", (e) => {
    console.error("\n错误:" + (e?.message ?? e));
    process.exit(1);
  });
}
