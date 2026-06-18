# wx2md-skill

一个 [Claude Code](https://claude.com/claude-code) Skill：将**微信公众号文章**转换为**自包含的 Markdown 文件**（图片 Base64 内嵌，离线可看）。

零成本、纯本地运行，用开源库 [Turndown](https://github.com/mixmark-io/turndown) 做 HTML→Markdown，图片带防盗链 `Referer` 下载后转 Base64 内嵌，产出单个 `.md`。

## 安装

把本仓库克隆到 Claude Code 的 skills 目录即可：

```bash
git clone git@github.com:YusenHou519/wx2md-skill.git ~/.claude/skills/wx2md
```

依赖（`turndown`、`node-html-parser`）已随仓库打包在 `scripts/node_modules/`，**无需 `npm install`**，开箱即用。需要 Node.js 18+。

> 安装后重启一次 Claude Code 会话，技能即被加载。

## 使用

在 Claude Code 里直接说「提取这篇公众号文章 \<链接\>」，或用 `/wx2md` 触发。

也可手动运行脚本：

```bash
# 默认保存到系统下载目录（macOS/Linux: ~/Downloads，Windows: C:\Users\<用户>\Downloads）
node ~/.claude/skills/wx2md/scripts/convert.mjs https://mp.weixin.qq.com/s/xxxxxx

# 裸文章 ID + 指定输出路径
node ~/.claude/skills/wx2md/scripts/convert.mjs xxxxxx ~/Desktop/我的文章.md
```

## 依赖的开源模块

本 skill 基于以下开源模块构建（已随 `scripts/node_modules/` 一起打包），在此致谢：

**直接依赖**

| 模块 | 版本 | License | 用途 |
|------|------|---------|------|
| [turndown](https://github.com/mixmark-io/turndown) | 7.2.4 | MIT | HTML → Markdown 转换（替代 Cloudflare Workers AI） |
| [node-html-parser](https://github.com/taoqf/node-html-parser) | 6.1.13 | MIT | 解析 HTML、隔离公众号正文 `#js_content` |

**传递依赖**

| 模块 | License | 来源 |
|------|---------|------|
| @mixmark-io/domino | BSD-2-Clause | turndown |
| css-select / css-what / nth-check | BSD-2-Clause | node-html-parser |
| domhandler / domutils / dom-serializer / domelementtype / entities | BSD-2-Clause | node-html-parser |
| he | MIT | node-html-parser |
| boolbase | ISC | node-html-parser |

以上模块均采用 MIT / BSD-2-Clause / ISC 等宽松许可证。各模块版权归其原作者所有，完整许可条款见各自 `scripts/node_modules/<模块>/LICENSE`。

> 此外，转换流程中的若干实现思路（懒加载图片还原、标题提取、微信图片防盗链下载、图片 URL 替换等）参考并移植自 MIT 许可的 [wx2md-worker](https://github.com/loadchange/wx2md-worker) 项目。

## 说明

- 图片 Base64 内嵌会让 `.md` 偏大（图多的文章可能数 MB），换来单文件、离线可看。
- 个别图片下载失败时会告警并保留原始 `qpic.cn` 链接，不中断整体。
- 仅供个人偶尔使用，请勿批量爬取，避免触发微信风控。
- 仅供学习与交流，严禁用于非法用途。

## License

MIT
