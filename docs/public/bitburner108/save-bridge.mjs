#!/usr/bin/env node
// tools/save-bridge.mjs —— 在运行中的 Bitburner 页面(CDP)与本地文件之间搬运存档。
//
// Bitburner 的存档存在渲染进程的 IndexedDB 里:
//     database "bitburnerSave" (v2) / objectStore "savestring" / key "save"
// 值是一个 gzip 后的 JSON 的 Uint8Array —— 也就是说,想改它就得先进页面把它读出来。
//
//   node tools/save-bridge.mjs get --port 9222 --out save.gz      # 导出(先备份!)
//   node tools/save-bridge.mjs put --port 9222 --in  save.gz --reload
//
// ⚠️ 为什么必须分块读:
//   存档有 1.2 MB 左右,直接把它当 Runtime.evaluate 的返回值会被 CDP 的 JSON 消息大小限制截断。
//   所以先在页面里转成 base64,再每 0x8000 字节拼一次字符串。
//
// ⚠️ put 是**不可逆**的:它会覆盖游戏当前存档。永远先 get 一份。

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { installFriendlyErrors, parseArgs, die } from "./lib.mjs";

installFriendlyErrors();
const args = parseArgs();
const cmd = args._[0];
// 注意:下面的 `??` 而不是 `||`,`--port 0` 之类不会误判
const PORT = Number(args.port === true || args.port === undefined ? process.env.CDP_PORT ?? 9222 : args.port);

if (cmd !== "get" && cmd !== "put") {
  die("用法:save-bridge.mjs get|put --port 9222 [--out f.gz | --in f.gz] [--reload]");
}

/** 连上 CDP,返回一个可以求值的函数。 */
async function connect(port) {
  let list;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`);
    list = await res.json();
  } catch (e) {
    die(
      `连不上 CDP 端口 ${port}(${e.message})。\n` +
        `  · 游戏在运行吗?\n` +
        `  · 打过开启 CDP 的补丁吗?(见 README「前置条件」)\n` +
        `  · 端口对吗?默认 9222。`,
    );
  }
  const page = list.find((t) => t.type === "page");
  if (!page) die(`CDP 端口 ${port} 上没有 page target。目标列表:${JSON.stringify(list.map((t) => t.type))}`);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = ++seq;
      pending.set(id, { res, rej });
      ws.send(JSON.stringify({ id, method, params }));
    });

  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(JSON.stringify(msg.error)));
      else res(msg.result);
    }
  });
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", () => rej(new Error("websocket 连接失败")), { once: true });
  });
  await send("Runtime.enable");

  const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error("页面内异常: " + JSON.stringify(r.exceptionDetails).slice(0, 900));
    return r.result?.value;
  };
  return { send, evalJs, close: () => ws.close() };
}

// 页面内：把存档 Uint8Array 转成 base64（分块，避免超长参数）
const READ_EXPR = `(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open("bitburnerSave", 2);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const v = await new Promise((res, rej) => {
    const tx = db.transaction("savestring", "readonly");
    const g = tx.objectStore("savestring").get("save");
    g.onsuccess = () => res(g.result); g.onerror = () => rej(g.error);
  });
  if (v == null) return null;
  const u8 = (v instanceof Uint8Array) ? v : new Uint8Array(v);
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
})()`;

const { send, evalJs, close } = await connect(PORT);

if (cmd === "get") {
  const b64 = await evalJs(READ_EXPR);
  if (typeof b64 !== "string") die(`页面上读不到存档(拿到的是 ${typeof b64})。游戏加载完了吗?`);
  const buf = Buffer.from(b64, "base64");
  const out = args.out === true || args.out === undefined ? "live.gz" : args.out;
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(resolve(out), buf);
  const magic = buf.subarray(0, 2).toString("hex");
  console.log(`已导出 ${resolve(out)}`);
  console.log(`  ${buf.length} 字节,gzip 魔数 = ${magic}${magic === "1f8b" ? " (正确)" : " ⚠️ 不是 gzip,存档格式可能变了"}`);
} else {
  const inp = args.in === true ? null : args.in;
  if (!inp) die("put 需要 --in <存档.gz>");
  const b64 = readFileSync(resolve(inp)).toString("base64");
  const expr = `(async () => {
    const s = ${JSON.stringify(b64)};
    const bin = atob(s);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open("bitburnerSave", 2);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    await new Promise((res, rej) => {
      const tx = db.transaction("savestring", "readwrite");
      tx.objectStore("savestring").put(u8, "save");
      tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error);
    });
    return "ok:" + u8.length;
  })()`;
  console.log("写入 => " + (await evalJs(expr)));
  if (args.reload) {
    await send("Page.reload", { ignoreCache: true });
    console.log("已重载页面。等游戏加载完(约 10–25 秒)再验收。");
  } else {
    console.log("⚠️ 没有加 --reload:游戏里还是旧存档。存档只在页面加载时读取。");
  }
}

close();
process.exit(0);
