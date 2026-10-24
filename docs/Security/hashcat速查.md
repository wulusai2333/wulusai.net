---
title: hashcat 速查：提 hash、模式与中文口令
---

> **最短路径**：
>
> 1. 先提 hash —— hashcat 自己不提，zip / rar / 7z 要用 John 的 `zip2john` / `rar2john` / `7z2john.pl`，输出**去掉 `文件名:` 前缀**
> 2. 再定模式 —— 看 hash 开头：`$pkzip2$` → 17200/17210，`$7z$` → 11600，`$rar5$` → 13000，`$RAR3$` → 12500/23700/23800；不确定就 `hashcat --example-hashes -m <id>` 自证
> 3. 中文口令别用掩码猜字，用 `--hex-charset` 按 UTF-8 字节类拼（[§4](#_4-中文口令-两条路-第二条是主路)）；但 7-Zip 走不通，得换 John
>
> 先决定「值不值得跑」的是 [压缩包口令破解的优先级](./压缩包破解优先级.md)，这里只讲怎么让命令跑对。

## 1. 装好之后，先会提 hash

hashcat 解压即用，但它**不负责从归档里提 hash** —— 这件事由 John the Ripper 的 `*2john` 系列做。

| 需要 | 从哪拿 |
| --- | --- |
| hashcat 本体 | <https://hashcat.net/hashcat/> |
| John（`zip2john` / `rar2john` / `7z2john` 的来源） | <https://www.openwall.com/john/> |

```powershell
# 在 john 的 run 目录里执行，结果重定向到文件
.\zip2john.exe test.zip > ziphash.txt
.\rar2john.exe test.rar > rarhash.txt

# 7z 只有 Perl 脚本，先装 Perl（Windows 用 Strawberry 或 ActivePerl）
perl .\7z2john.pl test.7z > 7zhash.txt
```

两个必踩的坑：

| 现象 | 原因 / 处置 |
| --- | --- |
| `Can't locate Compress/Raw/Lzma.pm in @INC … at 7z2john.pl line 6` | 缺 Perl 模块；装上，或用 `perl -I <桩目录>` 绕过（`data type=0` 的归档不会走 LZMA 分支） |
| `Token length exception … No hashes loaded` | `*2john` 的输出带 `文件名:` 前缀，hashcat 不认；先去前缀再喂 |

只拿到一个文件、想算个杂凑对照（确认是不是 MD5）：Windows 自带 `certutil -hashfile <文件> MD5`，不用额外装工具。

## 2. 模式表：看 hash 前缀就能定

| 归档 | 算法 / 加密方式 | `-m` | hash 开头 |
| --- | --- | ---: | --- |
| ZIP | ZipCrypto（压缩过的条目） | 17200 | `$pkzip2$` |
| ZIP | ZipCrypto（Stored，不压缩） | 17210 | `$pkzip2$` |
| ZIP | ZipCrypto 多文件（压缩 / 混合） | 17220 / 17225 | `$pkzip2$` |
| ZIP | ZipCrypto 多文件（仅校验和） | 17230 | `$pkzip2$` |
| ZIP | WinZip AES（`$zip2$`） | 13600 | `$zip2$` |
| ZIP | SecureZIP AES-128 / 192 / 256 | 23001 / 23002 / 23003 | `$zip3$` |
| 7-Zip | AES-256 + LZMA2 | 11600 | `$7z$` |
| RAR | RAR5（PBKDF2 32799 轮） | 13000 | `$rar5$` |
| RAR | RAR3-hp | 12500 | `$RAR3$*0*` |
| RAR | RAR3-p（不压缩 / 压缩） | 23700 / 23800 | `$RAR3$*1*` |
| 对照 | MD5 / NTLM | 0 / 1000 | 32 位 hex / 32 位 hex |

- **17200 和 17210 别选错**：同一个 `.zip`，条目是 `Stored` 就 17210、`Deflated` 就 17200。判法见 [优先级设计 § 第一步](./压缩包破解优先级.md)：`7z l -slt` 看 `Method`。
- **`$7z$` 的第二段是 `NumCyclesPower`**，默认 19；小于 19 说明归档用了低迭代，速度会快很多 —— 先读它再算预算。
- 手上只有 hash、不知道是哪一档，`--example-hashes -m <id>` 会把该模式的官方样例打印出来比对。

::: warning 17200 / 17210 的校验很弱
这两个模式只带 20 字节（12 字节加密头 + 8 字节密文），`Keep.Guessing: Yes`，**同一个 hash 可能报出多个「正确」口令**。撞上「明明破了却解不开」先看 [实战复盘](./hashcat实战复盘.md)，不要重跑。
:::

## 3. 四种攻击形式与常用开关

```powershell
cd <hashcat目录>          # 必须在 hashcat 自己目录下跑，否则找不到 OpenCL

# -a 0 字典
.\hashcat.exe -m 13000 -a 0 target.hash rockyou.txt

# -a 1 组合：两张字典左右拼接（左 × 右）
.\hashcat.exe -m 17200 -a 1 target.hash dict1.txt dict2.txt

# -a 3 掩码 + 递增长度（-i 从短到长，先吃便宜的长度）
.\hashcat.exe -m 17210 -a 3 target.hash -i --increment-min 6 --increment-max 10 ?l?l?l?l?l?l?l?l?l?l

# -a 6 混合：字典 + 固定后缀
.\hashcat.exe -m 13000 -a 6 target.hash top-10000.txt ?d?d?d?d

# 查 potfile 里已经破了什么
.\hashcat.exe -m 13000 target.hash --show
```

内置字符集：`?d` 数字、`?l` 小写、`?u` 大写、`?a` 可见字符全集；自定义字符集用 `-1` … `-8`（hashcat 7 起支持 8 个），值可以直接写在命令行，也可以给 `.hcchr` 文件路径。

几个不出错就好的开关：

| 开关 | 作用 |
| --- | --- |
| `-O` / `-w 3` | 优化内核，约 +10% 速度，代价是口令长度 ≤ 20 字节 |
| `--potfile-disable` | 不写 potfile —— 做实验、测速时用，避免污染正式结果 |
| `--outfile-autohex-disable` | 结果按明文输出，而不是 `$HEX[...]` |
| `--keep-guessing` | 对弱校验模式收集**所有**通过校验的候选，而不是第一个就收工 |

约束两条：`-a 3` / `-a 6` **只接受一个 hash 文件**；多 hash 同跑在 `-a 0` 下会被盐数摊薄速度（见 [优先级设计](./压缩包破解优先级.md) 的换算陷阱）。

## 4. 中文口令：两条路，第二条是主路

### 4.1 现成字符集：先确认本机有没有

hashcat 官方的 `charsets/` 只按西方语言分目录（`standard/Russian`、`special/German`……），**没有中文**。早期记录里用的 `charsets/chinese/ci1000zi.hcchr`（1000 常用字）来自中文打包版，换台机器先 `dir charsets\chinese` 确认，没有就自己造一份单行字符集文件。

```powershell
.\hashcat.exe -a 3 -m 11600 target.hash -3 charsets\chinese\ci1000zi.hcchr ?3?3?3?3
```

注意 `.hcchr` 是**按字节**读的单行文件：UTF-8 多字节汉字写进去会被当成一个个字节，只有「按字节比对」的哈希（MD5 / SHA1 这类）才等价于按字猜。真正通用的写法是下面这个。

### 4.2 `--hex-charset`：按 UTF-8 字节类拼掩码

常用汉字在 UTF-8 里固定 3 字节：首字节 `E4`–`E9`，后两字节都是 `80`–`BF`。把三类字节写成三个自定义字符集，一个汉字就占 3 个掩码位：

```powershell
.\hashcat.exe --potfile-disable --outfile-autohex-disable -m 0 -a 3 target.hash `
  --hex-charset `
  -1 e4e5e6e7e8e9 `
  -2 808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9fa0a1a2a3a4a5a6a7a8a9aaabacadaeafb0b1b2b3b4b5b6b7b8b9babbbcbdbebf `
  -3 808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9fa0a1a2a3a4a5a6a7a8a9aaabacadaeafb0b1b2b3b4b5b6b7b8b9babbbcbdbebf `
  -i ?1?2?3?1?2?3
```

- `--hex-charset` 之后，`-1/-2/-3` 里的值被当作**十六进制字节**，不再是字面字符
- `-i` 从短到长递增；这里的起手就是两个字（单个汉字不成词）
- `--outfile-autohex-disable` 让结果以明文显示，否则中文口令会以 `$HEX[...]` 形式输出

值不值得跑，先算：一档汉字（6 × 64 × 64）≈ 2.5×10⁴ 个候选。

| 汉字数 | 掩码 | 候选量 | MD5（≈30 GH/s） | 7-Zip（≈26 kH/s） |
| ---: | --- | ---: | ---: | ---: |
| 2 | `?1?2?3?1?2?3` | ≈ 6.0×10⁸ | 秒级 | ≈ 6.4 小时 |
| 3 | 再加 `?1?2?3` | ≈ 1.5×10¹³ | ≈ 8 分钟 | 放弃 |
| 4 | 再加 | ≈ 3.6×10¹⁷ | 放弃 | 放弃 |

::: warning 掩码只有 20 个位置
hashcat 的掩码上限是 20 位，一个汉字吃 3 位，所以这套写法**最多猜 6 个汉字**。更长的中文口令只能靠字典 + 规则命中，掩码帮不上忙。
:::

### 4.3 7-Zip 这条路走不通，别耗在上面

`-m 11600` 的模块对每条候选做「每字节插一个 `0x00`」的朴素 UTF-16 转换，对 `> 0xFF` 的字符是硬限制 —— 加 `--encoding-to` 也只是在朴素转换前再转一次，纯与 `-O` 内核都失败。CJK 口令的 7z 要转 John 的 CPU `--format=7z`，机制和实测数据在 [hashcat 实战复盘](./hashcat实战复盘.md)。

## 5. 跑起来常见的报错

| 现象 | 原因 / 处置 |
| --- | --- |
| `Device #1: CUDA SDK Toolkit not installed … Falling back to OpenCL runtime` | 正常回退，结果不受影响；想用 CUDA 就装官方 toolkit |
| `nvmlDeviceGetFanSpeed(): Not Supported` | 读不到风扇转速（笔记本 / 虚拟机常见），纯警告 |
| `./OpenCL/: No such file or directory` | 没在 hashcat 自己的目录里运行 |
| `Token length exception` / `No hashes loaded` | hash 文件混了文件名前缀、空行或别的格式 |
| `Exhausted 0/1` 但口令确定正确 | 先去掉 `-O` 重跑；仍不中基本是模块硬限制（[§4.3](#_4-3-7-zip-这条路走不通-别耗在上面)） |

## 参考

- hashcat 下载与 wiki：<https://hashcat.net/hashcat/>、<https://hashcat.net/wiki/>
- 示例哈希表（按格式查 `-m`）：<https://hashcat.net/wiki/doku.php?id=example_hashes>
- 掩码语法与内置字符集：<https://hashcat.net/wiki/doku.php?id=mask_attack>
- John the Ripper（`*2john` 系列）：<https://www.openwall.com/john/>
- UTF-8 汉字编码范围（`E4`–`E9` 那套推导）：<http://ibillxia.github.io/blog/2010/08/21/utf8-chinese-coding/>
- 预算与止损：[压缩包口令破解的优先级](./压缩包破解优先级.md) · 踩坑实录：[hashcat 实战复盘](./hashcat实战复盘.md)
