---
title: Bitburner 108 全成就速通（any%）
---

> **一句话**：不玩，直接把 108 条成就点亮。
> 手段是改存档 + 调游戏自己的 Steam IPC。
>
> ⚠️ 这是 **any% 速通**，不是攻略。想正常玩拿 108 条的人不要用这个。
> 单人离线游戏，改的是你自己机器上你自己的存档。

**最短路径**（6 条命令，全程约 5 分钟）：

```bash
git clone https://github.com/wulusai2333/wulusai.net.git && cd wulusai.net/docs/public/bitburner108

node save-bridge.mjs get --port 9222 --out live-before.gz          # 1 备份
node grant-all.mjs --in live-before.gz --out full.gz --sf-all 3    # 2 改档
node verify.mjs --in full.gz                                       # 3 验收
node save-bridge.mjs put --port 9222 --in full.gz --reload         # 4 灌回，等 10–25 秒
node make-steam-expr.mjs --out steam.expr.js                       # 5 生成推送表达式
node cdp-eval.mjs --expr-file steam.expr.js                        # 6 推 Steam
```

前置条件是「Steam 版 + 给 `main.js` 加 3 行开 CDP」，见下节。**第 1 步之前先看第 2 步的备份说明**——`put` 会覆盖游戏当前存档。

## 结果与验证环境

| 项 | 值 |
| --- | --- |
| 游戏版本 | Bitburner **v3.0.1**（commit `3162fd2`，Steam AppID `1812820`） |
| 结果 | 游戏内 **108/108**；Steam 侧 **98/98** |
| 工具运行环境 | Node.js ≥ 18（用到全局 `fetch` 与 `WebSocket`） |
| 实测平台 | Windows + Steam 版 |
| 未验证 | 网页版 / itch 版（没有 `electronBridge`，第 5 步做不了） |

为什么是 108 和 98 两个数：游戏内共 108 条成就，其中 **10 条永远不会同步到 Steam**，所以 Steam 侧满额是 98。这 10 条在源码里带 `NotInSteam` 标记，见「为什么 Steam 只有 98 条」。

## 前置条件

### 必须是 Steam 版

Steam 成就只存在于 Steam 客户端里。Steam 版自带 `electronBridge`，我们通过它走游戏自己的同步通道——**不需要** hook Steam API、**不需要**改 `steam_api64.dll`、**不需要**第三方注入器。

### 给游戏开 CDP（唯一需要的客户端改动）

要在游戏页面里执行 JS，得让游戏暴露 Chrome DevTools 协议端口。

打开 `<游戏目录>/resources/app/main.js`，在 `require("electron")` 那一行**之后**插入 3 行：

```js
app.commandLine.appendSwitch("remote-debugging-port", "9222");
app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
app.commandLine.appendSwitch("remote-allow-origins", "*");
```

::: warning 先备份这个文件，并且记住它会被覆盖
Steam 校验文件完整性、游戏更新，都会把 `main.js` 还原。还原后 9222 端口消失，所有 CDP 步骤失效，按本节重打即可。

顺便说：这条路线**不需要**改 `dist/main.bundle.js`。这是它相对「打 bundle 补丁」的关键优势——注入直接改数据结构，不调用任何被门控的游戏函数，所以游戏更新后只有这 3 行要重打。
:::

验证（游戏必须先启动）：

```bash
curl.exe -s http://127.0.0.1:9222/json/version
```

返回带 `"Browser"` 字段的 JSON 就算通了。

## 原理：三层，各自独立可验证

```text
① 改存档        → 游戏内成就变成 108
   往 IndexedDB 里的 gzip 存档的 PlayerSave.achievements 数组写满 108 个条目

② 调 Steam IPC  → Steam 侧成就变成 98
   页面里执行 window.electronBridge.send("activate-achievements", {achievements:[...]})

③ 验收          → 用"复推新增 0 行"证明，而不是"看起来亮了"
   看 %APPDATA%\bitburner\logs\main.log 里 "Granting Steam achievement" 的行数
```

三层的证据互相独立：① 看存档字段，② 看主进程日志，③ 看游戏内面板。任何一层失败都能单独定位。

::: tip 面板亮 ≠ Steam 亮
游戏内成就面板显示 108，**只**证明第 ① 层成功。它能被存档注入直接刷出来，和 Steam 侧没有任何因果关系。验收判据见「第 5 步」。
:::

### 存档到底长什么样

这是整件事里最容易搞错的地方。存档不在磁盘的 JSON 文件里，而在渲染进程的 IndexedDB：

```text
database   "bitburnerSave"   (version 2)
  store    "savestring"
    key    "save"
    value  Uint8Array(gzip(JSON))
```

而这个 JSON 是**层层套壳**的，`achievements` 藏在两层字符串里：

```jsonc
{
  "ctor": "BitBurnerSaveObject",
  "data": {
    "PlayerSave": "<一个 JSON 字符串>",   // 注意：字符串，不是对象
    "SettingsSave": "<一个 JSON 字符串>"
  }
}
```

`JSON.parse(outer.data.PlayerSave)` 之后还有一层：

```jsonc
{ "ctor": "PlayerObject", "data": "<又一个 JSON 字符串>" }
// 再 parse 一次才拿到真身：
{
  "achievements": [ { "ID": "CYBERSEC", "unlockedOn": 1730000000000 } ],
  "sourceFiles":  { "data": [ [1, 3], [2, 3] ] },
  "exploits":     [],
  "bitNodeN":     1
}
```

工具里的 `unwrap()` 负责剥壳，写回时**只替换那一个字符串**、外层原样保留。

::: warning 只剥一层会拿到 undefined
只读 `outer.data.PlayerSave.achievements` 会得到 `undefined`（因为 `PlayerSave` 是字符串），然后很容易误判成"这个存档没有成就系统"。
:::

## 第 1 步：导出存档（先备份）

```bash
node save-bridge.mjs get --port 9222 --out live-before.gz
```

期望输出：

```text
已导出 <路径>/live-before.gz
  1287905 字节，gzip 魔数 = 1f8b (正确)
```

**魔数不是 `1f8b` 就停下**，说明拿到的不是 gzip 存档，格式可能变了。

### 这里踩过的坑

**为什么读存档要分块传 base64**：存档约 1.2 MB。`String.fromCharCode.apply(null, 大数组)` 会爆栈，而且整个 base64 字符串一次塞进 CDP 的求值返回值里可能被消息大小限制截断。所以按 `0x8000` 分块拼。

**为什么工具会明确警告 `--reload`**：存档只在**页面加载时**被读取一次。写进 IndexedDB 但游戏内存里还是旧状态，必须重载页面才生效。

## 第 2 步：写入 108 条成就

```bash
node grant-all.mjs --in live-before.gz --out full.gz --sf-all 3
```

期望输出：

```text
成就                 : 37 -> 108 / 清单 108
SourceFiles          : {"1":3,"2":3,...,"15":3}
```

（`37` 是你的起始值，每个人不同。关键是右边变成 `108 / 清单 108`。）

### 成就 ID 是索引键，写错不会报错

灌进去的条目 ID 如果不在游戏注册表里，游戏读进来**直接忽略，不报错**——你只会看到"成就没增加"而不知道为什么。所以清单必须来自你正在运行的那份 build。

`achievements.manifest.json` 就是从游戏 bundle 里提取的。bundle 里的形状是：

```js
e.exports=JSON.parse('{"P":{"CYBERSEC":{"ID":"CYBERSEC","Name":"CyberSec",...},...}}')
```

提取它有两个坑，都处理过了：

1. **这是单引号 JS 字符串字面量**，里面的撇号写成 `\'`（例如 `"They\'re lunatics"`）。直接 `JSON.parse` 报 `Bad escaped character`。
2. **不能靠正则找结尾**，得做括号配平并跳过字符串内的括号。注册表有 108 条、约 20 KB，贪婪匹配会越界。

### 条目形状必须是 `{ID, unlockedOn}`

```json
{ "ID": "CYBERSEC", "unlockedOn": 1730000000000 }
```

`ID` 不是字符串、或缺 `unlockedOn`，成就面板都可能显示异常。`verify.mjs` 会逐条检查形状。

### `--sf-all 3` 不影响验收，但有实际好处

验收口径是「游戏内 108 + Steam 98」，本来不需要 SourceFile。置 3 有两个好处：

1. BitVerse 里所有 BitNode 都显示已解锁，便于人工抽查；
2. `BN_DESTROYER` 的条件是「每个 BN 的 SourceFile 等级 ≥ 3」，置 3 之后这条**由游戏自己算出来为真**，不需要硬写。

SourceFile 上限是 3（BN12 除外），传更大的数会被游戏自行钳制，**不报错**。

### 默认不写 `exploits`——这一项要单独说

游戏里有一组「Exploit」成就（源码里叫 Source-File −1），其中 5 条的条件就是 `Player.exploits` 里有没有对应枚举值。工具里有个 `--exploits-all` 开关可以一次写进 11 条，**默认关闭**，因为它和改成就是**两种性质**的事。

::: danger 开了 `--exploits-all` 会留下可见标记
它会把 11 个枚举原文写进 `Player.exploits`，游戏随即显示 `Source-File -1: Exploits in the BitNodes`，等级 = 条数（11），并给一个 `1.001^11` 的加成。

这是**游戏自己记账的标记**，也就是"这段进度能被游戏和真实游玩区分开"。而改成就不会产生任何标记。
:::

## 第 3 步：存档侧验收

```bash
node verify.mjs --in full.gz
```

7 项检查，每项都能追到一个字段或一条源码依据：

| # | 检查 | 失败意味着 |
| --- | --- | --- |
| 1 | 条目数 = 注册表条数 | 没写全 |
| 2 | 无清单外的脏 ID | 版本不符或拼错 |
| 3 | 条目形状 `{ID, unlockedOn}` | 游戏会忽略这些条目 |
| 4 | SourceFiles 覆盖 SF1–SF15 | BN 面板不全 |
| 5 | `SyncSteamAchievements` 为 true | 游戏不会主动推 Steam |
| 6 | exploits 状态 | **这是留痕判据，不是对错判断** |
| 7 | Steam 口径 = 98 | 分类文件过期 |

::: tip 这一层能证明什么、不能证明什么
✅ 能证明：存档结构正确，游戏读得进来。

❌ 不能证明：Steam 侧亮了（那在游戏进程外）。
❌ 不能证明：游戏面板会立刻刷新（存档注入不触发 UI 重算，必须重载页面）。
:::

## 第 4 步：灌回游戏并推送到 Steam

```bash
node save-bridge.mjs put --port 9222 --in full.gz --reload
```

`--reload` 会重载页面。**等 10–25 秒**让游戏加载完——在它加载完之前做下一步，页面可能还没有 `electronBridge`。

然后生成推送表达式并执行：

```bash
node make-steam-expr.mjs --out steam.expr.js
node cdp-eval.mjs --expr-file steam.expr.js
```

期望输出 `sent 108 ids`。

为什么不把这一长串写在命令行上：108 个 ID 拼成的表达式约 900 字符，经 shell 引号转义后极易出错，而且 bash / PowerShell / cmd 的规则各不相同。`make-steam-expr.mjs` 从清单生成这个文件，稳定得多。

生成的表达式长这样（就是一会儿要在页面里求值的东西）：

```js
(async () => {
  if (!window.electronBridge || typeof window.electronBridge.send !== "function") {
    return "FAIL: 页面上没有 window.electronBridge —— 这不是 Steam 版，或 preload 没加载。";
  }
  const ids = ["CYBERSEC", "NITESEC", /* … 共 108 个 */];
  window.electronBridge.send("activate-achievements", { achievements: ids });
  return "sent " + ids.length + " ids to activate-achievements";
})()
```

### `window.electronBridge` 是怎么来的

游戏的 `preload.js` 用 `contextBridge.exposeInMainWorld("electronBridge", {...})` 把它暴露给页面，而页面正好是 CDP 能求值的地方。**我们走的就是游戏自己用来同步成就的那条代码路径**，连它自己的过滤逻辑都照跑。

### 为什么可以发 108 个给只有 98 条的 Steam

主进程处理器会自己过滤。`resources/app/achievements.js` 里的循环：

```js
for (const achievement of data.achievements) {
  // Don't try activating achievements that don't exist Steam-side
  if (!allSteamAchievements.includes(achievement)) {
    continue;
  }
  // Don't spam achievements that have already been recorded
  if (steamAchievements.includes(achievement)) {
    continue;
  }
  log.info(`Granting Steam achievement ${achievement}`);
  // ...
}
```

`allSteamAchievements` 来自 `steamworksClient.achievement.names()`——**Steam 客户端实际注册的清单**。所以多出来的 10 条被静默跳过，不报错、不计数。你不需要自己剔除它们。

而且第二个 `continue` 意外地给了我们一个很好的验收判据，见下节。

## 第 5 步：验收——什么才算证据

### ❌ 不算证据

- 游戏内面板显示 108（只证明第 ① 层）
- Steam 客户端里成就一片亮（只证明"有些"亮了）
- 终端里没有报错（沉默不是证据）

### ✅ 算证据：幂等复推新增 0 行

```powershell
$log = "$env:APPDATA\bitburner\logs\main.log"
$before = (Select-String -Path $log -Pattern "Granting Steam achievement").Count
node cdp-eval.mjs --expr-file steam.expr.js | Out-Null
$after = (Select-String -Path $log -Pattern "Granting Steam achievement").Count
"before=$before after=$after new=$($after - $before)"
```

**`new=0` ⇒ 没有任何成就还处于"未在 Steam 激活"状态 ⇒ 98/98 全亮。**

为什么这个判据可靠：循环里那个 `if (steamAchievements.includes(achievement)) continue;`，`steamAchievements` 是启动时从 Steam 拉的实际已激活列表。所以「新增 0 行」恰好等价于「全部已激活」——比肉眼看面板强得多。

顺带：游戏内 108 可以用台账命令核对，它只读存档、不信任何手写数字：

```bash
node status.mjs --in full.gz
```

```text
游戏内成就  : 108/108 (100.0%) ████████████████████████
Steam 口径  : 98/98 (100.0%)
```

## 为什么 Steam 只有 98 条

游戏内 108 条里有 **10 条永远不会同步到 Steam**。这 10 条来自两类：

| 来源 | 条数 | 内容 |
| --- | --- | --- |
| 显式 `NotInSteam: true` | 7 | `BN_DESTROYER` `IPVGO_ANTICHEAT` `IPVGO_WINNING_STREAK` `DARKNET_BACKDOOR` `DARKNET_DEPTHS` `CHALLENGE_BN14` `CHALLENGE_BN15` |
| 生成器规则 `NotInSteam: bn >= 13` | 3 | `SF13.1` `SF14.1` `SF15.1` |

7 + 3 = 10，108 − 10 = **98**。

::: warning `NotInSteam` 不在 bundle 的注册表里
bundle 的注册表 JSON 只有 `ID` / `Name` / `Description` 三个字段。`NotInSteam` 是 TypeScript 侧的元数据，**只能从源码算**。

直觉上会写 `notInSteam: !!a.NotInSteam`，结果 108 条全部报 `false`——不报错，只是静静给你一个错的答案。这就是它值得单独列一节的原因。
:::

想亲手核对（`--source` 接受任意一份源码目录，官方仓库 `github.com/bitburner-official/bitburner-src`）：

```bash
node -e "
const fs=require('fs');
const t=fs.readFileSync('<源码目录>/src/Achievements/Achievements.ts','utf8');
const re=/^ {2}([A-Z][A-Za-z0-9_.]*):\s*\{/gm; const st=[]; let m;
while((m=re.exec(t))) st.push({id:m[1],at:m.index});
const hits=st.filter((s,i)=>/NotInSteam:\s*true/.test(t.slice(s.at, st[i+1]?.at ?? t.length)));
console.log('显式 NotInSteam:', hits.length, hits.map(h=>h.id).join(' '));
console.log('规则:', t.match(/NotInSteam:\s*bn\s*>=\s*(\d+)/)?.[0]);
"
```

## 这会不会留下"作弊"记录

游戏里确实有一条 `EditSaveFile` exploit，语义就是"你编辑了自己的存档"。直觉上会以为改档必然触发它。

**不会。** 全仓库（含上游源码）**不存在任何** `giveExploit(Exploit.EditSaveFile)` 调用点，也没有任何检测代码。`Exploit.EditSaveFile` 只出现在三处：枚举定义、描述文本、成就条件。

也就是说，拿它的**唯一**方式是**你自己**把 `"EditSaveFile"` 写进存档的 `exploits` 数组。上游源码的注释也明说了这是预期玩法：

> // To the players reading this: Yes, you're supposed to gain the EditSaveFile exploit by editing your real save file.

::: warning "零留痕"要把范围说清
精确的说法分两层：

- **改成就 + 置 SourceFile 本身不留痕**。游戏没有对照表能验证"这些成就你本该打多久"。
- **但输入存档的既有权重不在这个动作范围内**。实测那次速通，输入存档改档前就带着 **11 条 exploit**（更早的改档动作留下的），注入前后逐字节相同。所以"零留痕"描述的是注入动作，不是整份存档的状态。

另外 `main.js` 那 3 行 CDP 补丁是**客户端改动**，和成就判定无关，但 Steam 校验会覆盖它。
:::

## 坑点汇总

| 症状 | 原因 | 解法 |
| --- | --- | --- |
| `连不上 CDP 端口 9222` | 游戏没启动 / `main.js` 补丁被 Steam 校验覆盖 | 启动游戏；重打那 3 行 |
| `no page target on 9222` | 游戏还在加载 | 等进主界面 |
| 存档魔数不是 `1f8b` | 存档格式变了 | 停，重新分析格式 |
| `Bad escaped character` | 注册表是单引号字符串，`\'` 没修 | 已处理；若复现请核对版本 |
| 灌回后成就没变 | 没加 `--reload` | 加 `--reload` |
| `FAIL: 没有 electronBridge` | 非 Steam 版 / 页面未加载完 | 用 Steam 版；再等几秒 |
| 日志 `Granting` 行数复推还在增 | 有些成就未激活 | 正常，说明还没全亮；等它归零 |
| `status.mjs` 报 `账本漏洞` | 轮次表有缺口 | `routes.json` 里给那个 ID 补一条轮次 |
| `status.mjs` 报 `幽灵目标` | `routes.json` 里 ID 拼错 | 对照清单修正 |

## 边界与取舍

| 路线 | 用时 | 客户端改动 | 游戏能区分吗 | 能拿满 108 吗 |
| --- | --- | --- | --- | --- |
| **本方案**：存档注入 + Steam IPC | ≈5 分钟 | `main.js` 加 3 行 | 不能 | ✅ |
| 改 bundle 补丁 | 取决于补丁 | 改 `main.bundle.js` | 不能 | ✅（含 `UNACHIEVABLE`） |
| 正常玩 | **83 个 BitNode 轮次** | 无 | — | ✅ |
| "只靠游戏内彩蛋、啥都不改" | — | — | — | ❌ **做不到** |

两处值得展开：

**① 「啥都不改」在算术上就不成立。** `UNACHIEVABLE` 这条成就的条件在源码里写死为假（`Condition: () => false`），源码注释直接写着"是的，你该改它才能拿到"。而 11 条 Exploit 里，`INeedARainbow` 需要猜中一个不在源码里的 bcrypt 口令，`EditSaveFile` 只能改存档。所以"完全不改任何东西"这条路线不存在。

**② 正常玩是 83 轮，其中 50 轮是重复刷 BN12。** 它最大的杠杆是第一轮：

- `ns.singularity.*` 的 64 个函数在 BN4 之外被 SourceFile 4 门控（BN4 本身让门控条件直接成立）；
- 而且 **BN4 里 Singularity 的 RAM 不打折**，其它情况 `SF4 <= 1` 时是 **16 倍** RAM 惩罚。

⇒ 路线是：第一轮 BN1 手点 → 拿 SF1.1 → 进 **BN4**（全自动）→ 之后所有 BN 都是 ×1 全自动，**全程零补丁**。这也是为什么"第一轮之后必须去 BN4"是硬约束而不是建议——没有它就没有自动化。

::: tip 关于 `DEVMENU` 的一条未验证项
这条成就**没有**标 `NotInSteam`，说明设计意图是"玩家应当能拿到"。但在 v3.0.1 里，侧栏的 DevMenu 入口是 `process.env.NODE_ENV === "development" && {...}`——**正式构建没有入口**；而 `ns.openDevMenu()` 是诱饵，它只弹 4 月 1 日 ASCII 动画，不挂载 DevMenu 页。

已排查掉的入口：键位绑定、URL/hash 路由、终端命令。可能是 v3.0.1 的回归 bug，也可能存在本快照未覆盖的入口。**仅凭源码无法定论，这里标未验证。**
:::

## 本方案的相关文件

全部托管在站点仓库里，可以直接 clone 下来用：

```bash
git clone https://github.com/wulusai2333/wulusai.net.git
cd wulusai.net/docs/public/bitburner108
```

| 文件 | 作用 |
| --- | --- |
| `lib.mjs` | 存档格式层（剥壳 / 读 / 写）。其余工具都 import 它 |
| `save-bridge.mjs` | 存档 ↔ IndexedDB 搬运：`get` / `put --reload` |
| `grant-all.mjs` | 写入 108 条成就（`--sf-all` / `--exploits-all` / `--steam-sync`） |
| `verify.mjs` | 存档侧 7 项验收 |
| `status.mjs` | 台账机算：从存档反推进度 |
| `make-steam-expr.mjs` | 从清单生成推送表达式（`steam.expr.js`） |
| `cdp-eval.mjs` | 在游戏页面里求值（推 Steam 用） |
| `achievements.manifest.json` | 108 条成就注册表（从 v3.0.1 的 bundle 提取） |
| `steam-classification.json` | 那 10 条不同步 Steam 的判定结果 |
| `routes.json` | 「正常玩」的轮次表（83 轮） |

::: warning 这些脚本不能丢进游戏里跑
它们用 `node:fs`、`node:zlib` 和 ESM `import`——这些在游戏的 Netscript 运行时里都不存在。必须在你自己的机器上用 Node 跑，游戏只需要开着（因为要读它的 IndexedDB）。

游戏里能跑的脚本见另一个页面：[Bitburner 脚本](./bitburner.md)。
:::

## 参考

- 游戏源码（成就条件、`NotInSteam`、`EditSaveFile` 都在这）：[bitburner-official/bitburner-src](https://github.com/bitburner-official/bitburner-src)
- 上游 `Exploits` 设计说明：`src/Exploits/Exploit.ts`——它把"找漏洞"定义为游戏内容本身（Source-File −1），而不是缺陷
- 验证基准：本文所有命令与数字都在 Bitburner **v3.0.1 / `3162fd2`** 上实跑过；未验证的项已单独标注
