---
name: wx2md
description: 将微信公众号文章转换为自包含的 Markdown 文件（图片 Base64 内嵌，离线可看）。当用户提供微信公众号文章链接（mp.weixin.qq.com/s/...）或文章 ID 并希望提取/转换/保存为 Markdown、做成笔记时使用。零成本、纯本地运行，无需 Cloudflare 或任何付费服务。
---

# wx2md — 微信公众号文章转 Markdown

把微信公众号文章抓取并转换为 **自包含的 Markdown 文件**：用开源库 Turndown 做 HTML→Markdown，图片带防盗链 Referer 下载后转 Base64 内嵌，产出单个 `.md`（离线也能看图）。

## 何时使用

- 用户给出微信公众号文章链接（`https://mp.weixin.qq.com/s/...`）或裸文章 ID，并希望提取、转换、保存、做笔记。

## 如何运行

脚本和依赖已随 skill 自包含打包在 `scripts/` 下，**无需 npm install**，直接用 node 运行：

```bash
node ~/.claude/skills/wx2md/scripts/convert.mjs <文章URL或ID> [输出路径]
```

参数：
- 第 1 个参数：完整链接 `https://mp.weixin.qq.com/s/xxx` 或裸 ID `xxx`（必填）
- 第 2 个参数：输出文件路径（可选）

**保存位置规则**：
- 用户**未指定**第二个参数时，默认保存到系统**下载目录**：macOS / Linux 为 `~/Downloads`，Windows 为 `C:\Users\<用户>\Downloads`（目录不存在会自动创建）。
- 用户**指定**了第二个参数时，按其指定路径保存，例如 `~/Desktop/文章.md`。

脚本运行时会打印「保存位置」说明和最终文件的绝对路径，运行后务必把实际保存位置明确告诉用户。

### 示例

```bash
# 默认：在当前目录生成「<标题>.md」
node ~/.claude/skills/wx2md/scripts/convert.mjs https://mp.weixin.qq.com/s/Q-vMqcDEuYo0Xh0LPij-zg

# 裸 ID + 指定输出
node ~/.claude/skills/wx2md/scripts/convert.mjs Q-vMqcDEuYo0Xh0LPij-zg ~/Desktop/我的文章.md
```

脚本结尾会打印产出文件的**绝对路径**和**文件大小**，运行后把这个路径告诉用户。

## 注意事项

- 需要 Node.js 18+（用到全局 `fetch`）。
- 图片 Base64 内嵌会让 `.md` 偏大（图多的文章可能数 MB），这是为了"单文件离线可看"的取舍。
- 个别图片下载失败时脚本会在控制台告警，并在 Markdown 中保留原始 `qpic.cn` 链接（该链接有防盗链，外部打开可能 403），不会中断整体。
- 仅个人偶尔使用，不要批量爬取，避免触发微信风控。
- 微信对云厂商 IP 有访问限制，在本机（家用 IP）运行最稳。
