#!/usr/bin/env node
// tools/cdp-eval.mjs —— 在运行中的 Bitburner 渲染进程里执行一段 JS 表达式。
//
// 这是 Steam IPC 那一步的工具:游戏的 preload.js 用 contextBridge 把
// `window.electronBridge` 暴露给了渲染进程(页面),所以我们可以在页面里直接调它。
//
//   node tools/cdp-eval.mjs "1+1"
//   node tools/cdp-eval.mjs --expr-file tools/grant-steam.expr.js
//   CDP_PORT=9222 node tools/cdp-eval.mjs "window.electronBridge ? '有桥' : '没桥'"
//
// 为什么用 --expr-file 而不是把长表达式写在命令行上:
//   一次性把 108 个 ID 写在 shell 命令行上会被引号/转义/长度搞死。写成 .js 文件最稳。

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { installFriendlyErrors, parseArgs, die } from "./lib.mjs";

installFriendlyErrors();
const args = parseArgs();
const PORT = Number(args.port === true || args.port === undefined ? process.env.CDP_PORT ?? 9222 : args.port);

let expr;
const fileArg = args["expr-file"] === true ? null : args["expr-file"];
if (fileArg) {
  expr = readFileSync(resolve(fileArg), "utf8").trim();
} else {
  expr = args._.join(" ");
}
if (!expr) die('用法:cdp-eval.mjs "<表达式>" | --expr-file <文件>');

let list;
try {
  list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
} catch (e) {
  die(`连不上 CDP 端口 ${PORT}(${e.message})。游戏在运行吗?补丁打了吗?`);
}
const page = list.find((t) => t.type === "page");
if (!page) die(`CDP 端口 ${PORT} 上没有 page target`);

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
const r = await send("Runtime.evaluate", {
  expression: expr,
  awaitPromise: true,
  returnByValue: true,
  includeCommandLineAPI: true,
});

if (r.exceptionDetails) {
  console.error("页面内异常: " + JSON.stringify(r.exceptionDetails, null, 2));
  ws.close();
  process.exit(3);
}
const v = r.result?.value;
console.log(typeof v === "string" ? v : JSON.stringify(v, null, 2));
ws.close();
process.exit(0);
