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

## 说明

- 图片 Base64 内嵌会让 `.md` 偏大（图多的文章可能数 MB），换来单文件、离线可看。
- 个别图片下载失败时会告警并保留原始 `qpic.cn` 链接，不中断整体。
- 仅供个人偶尔使用，请勿批量爬取，避免触发微信风控。
- 仅供学习与交流，严禁用于非法用途。

## License

MIT
