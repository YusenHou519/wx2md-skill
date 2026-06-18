#!/usr/bin/env node
/**
 * 本地版微信公众号文章转 Markdown 脚本
 *
 * 用法:
 *   node convert.mjs <文章URL或ID> [输出路径]
 *
 * 示例:
 *   node convert.mjs https://mp.weixin.qq.com/s/MhzcF7u_p3UHZ9qR6hptww
 *   node convert.mjs MhzcF7u_p3UHZ9qR6hptww my-article.md
 *
 * 特点:
 *   - 纯本地、零成本（用开源库 Turndown 替代 Cloudflare AI）
 *   - 图片带防盗链 Referer 下载后转 Base64 内嵌，产出自包含的 .md（离线可看）
 *   - 大量逻辑移植自现有 wx2md-worker（utils.ts / r2-images.ts）
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { parse } from 'node-html-parser';
import TurndownService from 'turndown';

/** 微信公众号文章 URL 前缀（参照 wx2md-worker/src/index.ts:17） */
const WECHAT_URL_PREFIX = 'https://mp.weixin.qq.com/';

/** 浏览器 UA，模拟正常访问 */
const BROWSER_UA =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * 带重试功能的 fetch（移植自 utils.ts:10 fetchWithRetry）
 */
async function fetchWithRetry(url, retries = 3, delay = 1000, customReferer) {
	const urlObj = new URL(url);
	const defaultReferer = `${urlObj.protocol}//${urlObj.hostname}`;

	const headers = {
		'User-Agent': BROWSER_UA,
		Accept: 'text/html,application/xhtml+xml,application/xml',
		'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
		'Cache-Control': 'no-cache',
		Pragma: 'no-cache',
		Referer: customReferer || defaultReferer,
	};

	for (let i = 0; i < retries; i++) {
		try {
			return await fetch(url, { headers });
		} catch (error) {
			if (i === retries - 1) throw error;
			const msg = error instanceof Error ? error.message : String(error);
			console.log(`请求失败 (${i + 1}/${retries})，${delay}ms 后重试: ${msg}`);
			await new Promise((r) => setTimeout(r, delay));
			delay *= 1.5;
		}
	}
	throw new Error('超过最大重试次数');
}

/**
 * HTML 属性值转义（移植自 utils.ts:87 escapeHtmlAttr）
 */
function escapeHtmlAttr(unsafe) {
	return unsafe.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * 预处理懒加载图片：data-src → src（移植自 utils.ts:98 preprocessHtml）
 * 公众号图片真实地址存在 data-src 中
 */
function preprocessHtml(html) {
	return html.replace(/<img\s+([^>]*?)data-src=["']([^"']+)["']([^>]*)>/gi, (match, before, dataSrc, after) => {
		const otherAttrs = before + after;
		const srcMatch = otherAttrs.match(/src=["']([^"']*)["']/i);
		const srcValue = srcMatch ? srcMatch[1] : '';

		if (!srcValue || srcValue.startsWith('data:')) {
			const cleanedBefore = before.replace(/src=["'][^"']*["']\s*/gi, '');
			const cleanedAfter = after.replace(/src=["'][^"']*["']\s*/gi, '');
			const safeSrc = escapeHtmlAttr(dataSrc);
			return `<img ${cleanedBefore}src="${safeSrc}" data-src="${safeSrc}"${cleanedAfter}>`;
		}
		return match;
	});
}

/**
 * 从 HTML 提取文章标题（移植自 utils.ts:46 getArticleTitle）
 * 优先 og:title → twitter:title → title，并做文件名安全化
 */
function getArticleTitle(html, fallbackId) {
	const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']\s*\/?>/i);
	const twitterTitleMatch = html.match(/<meta\s+property=["']twitter:title["']\s+content=["'](.*?)["']\s*\/?>/i);
	const titleTagMatch = html.match(/<title>(.*?)<\/title>/i);

	let title = '';
	if (ogTitleMatch && ogTitleMatch[1]) {
		title = ogTitleMatch[1].trim();
	} else if (twitterTitleMatch && twitterTitleMatch[1]) {
		title = twitterTitleMatch[1].trim();
	} else if (titleTagMatch && titleTagMatch[1]) {
		title = titleTagMatch[1].trim();
	} else {
		title = `wechat-article-${fallbackId}`;
	}

	return title
		.replace(/\s+/g, '_')
		.replace(/[\\/:*?"<>|]/g, '')
		.replace(/[^\w一-龥_\-.]/g, '')
		.substring(0, 100);
}

/**
 * 提取微信图片 URL（移植自 r2-images.ts:64 extractWechatImageUrls）
 */
function extractWechatImageUrls(html, markdown) {
	const regex = /https?:\/\/mmbiz\.q(?:pic|logo)\.cn\/[^?\s"'<>)\]]+(?:\?[^&\s"'<>)\]]+)?/gi;
	const htmlMatches = html.match(regex) || [];
	const mdMatches = markdown.match(regex) || [];
	const allUrls = [...new Set([...htmlMatches, ...mdMatches])];
	return allUrls.map((url) => url.replace(/[,.)\]]+$/, ''));
}

/**
 * 下载微信图片并绕过防盗链（移植自 r2-images.ts:82 downloadWechatImage）
 * 关键：Referer 设为微信域名
 */
async function downloadWechatImage(url) {
	try {
		const response = await fetch(url, {
			headers: {
				'User-Agent': BROWSER_UA,
				Accept: 'image/webp,image/avif,image/jxl,image/heic,image/heic-sequence,video/*;q=0.9,*/*;q=0.8',
				'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
				Referer: WECHAT_URL_PREFIX,
			},
		});
		if (!response.ok) {
			console.error(`  ✗ 下载失败: ${url} (状态码 ${response.status})`);
			return null;
		}
		const contentType = response.headers.get('content-type') || 'image/jpeg';
		const data = Buffer.from(await response.arrayBuffer());
		return { data, contentType };
	} catch (error) {
		console.error(`  ✗ 下载异常: ${url}`, error instanceof Error ? error.message : error);
		return null;
	}
}

/**
 * 把原始链接转义成可用于 RegExp 的字符串，并匹配其后续 & / &amp; 查询参数
 * （移植自 r2-images.ts:152-161 的替换思路）
 */
function buildUrlRegexes(originalUrl) {
	const escaped = originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const htmlEscaped = escaped.replace(/&/g, '&amp;');
	return [
		new RegExp(htmlEscaped + '(?:&amp;[^)\\s"\'<>\\]]+)*', 'g'),
		new RegExp(escaped + '(?:&[^)\\s"\'<>\\]]+)*', 'g'),
	];
}

/**
 * 并发执行（限制并发数），移植自 r2-images.ts:187 的分块思路
 */
async function runWithConcurrency(items, limit, worker) {
	const results = [];
	for (let i = 0; i < items.length; i += limit) {
		const chunk = items.slice(i, i + limit);
		const chunkResults = await Promise.all(chunk.map(worker));
		results.push(...chunkResults);
	}
	return results;
}

/** 把 CLI 输入解析为完整微信文章 URL + fallback id */
function resolveArticleUrl(input) {
	if (/^https?:\/\//i.test(input)) {
		const u = new URL(input);
		const id = u.pathname.replace(/^\/s\//, '').replace(/\.html$/, '') || u.pathname;
		return { url: input, id };
	}
	// 裸 ID（参照 index.ts:107 拼前缀）
	const id = input.replace(/\.html$/, '');
	return { url: `${WECHAT_URL_PREFIX}s/${id}`, id };
}

async function main() {
	const [, , inputArg, outputArg] = process.argv;

	if (!inputArg) {
		console.error('用法: node convert.mjs <文章URL或ID> [输出路径]');
		console.error('示例: node convert.mjs https://mp.weixin.qq.com/s/MhzcF7u_p3UHZ9qR6hptww');
		process.exit(1);
	}

	const { url, id } = resolveArticleUrl(inputArg);
	console.log(`📥 抓取文章: ${url}`);

	// 1. 抓取 HTML
	const response = await fetchWithRetry(url);
	if (!response.ok) {
		console.error(`无法获取网页内容，状态码: ${response.status}`);
		process.exit(1);
	}
	const rawHtml = await response.text();

	// 2. 预处理懒加载图
	const processedHtml = preprocessHtml(rawHtml);

	// 3. 提取标题
	const title = getArticleTitle(processedHtml, id);
	console.log(`📄 标题: ${title}`);

	// 4. 隔离正文：优先 #js_content，回退 body
	const root = parse(processedHtml);
	const contentNode = root.querySelector('#js_content') || root.querySelector('body') || root;
	const contentHtml = contentNode.innerHTML;

	// 5. HTML → Markdown
	const turndown = new TurndownService({
		headingStyle: 'atx',
		codeBlockStyle: 'fenced',
		bulletListMarker: '-',
	});
	let markdown = turndown.turndown(contentHtml);

	// 6. 图片转 Base64 内嵌
	const imageUrls = extractWechatImageUrls(contentHtml, markdown);
	console.log(`🖼️  发现 ${imageUrls.length} 张图片，开始下载内嵌...`);

	let successCount = 0;
	let failCount = 0;

	const downloaded = await runWithConcurrency(imageUrls, 5, async (originalUrl) => {
		const img = await downloadWechatImage(originalUrl);
		return { originalUrl, img };
	});

	for (const { originalUrl, img } of downloaded) {
		if (!img) {
			failCount++;
			continue; // 失败保留原链
		}
		const dataUri = `data:${img.contentType};base64,${img.data.toString('base64')}`;
		for (const re of buildUrlRegexes(originalUrl)) {
			markdown = markdown.replace(re, dataUri);
		}
		successCount++;
	}

	console.log(`✅ 图片内嵌完成: 成功 ${successCount}, 失败 ${failCount}, 总计 ${imageUrls.length}`);

	// 7. 加 frontmatter + 写文件
	const frontmatter = [
		'---',
		`title: "${title.replace(/"/g, '\\"')}"`,
		`source: ${url}`,
		`fetched_at: ${new Date().toISOString()}`,
		'---',
		'',
	].join('\n');

	const finalContent = `${frontmatter}# ${title}\n\n${markdown}\n`;

	let outputPath;
	if (outputArg) {
		// 用户指定了路径：按其指定保存
		outputPath = resolve(outputArg);
		console.log(`📁 保存位置: 按你指定的路径`);
	} else {
		// 未指定：默认保存到用户下载目录
		// macOS / Linux 为 ~/Downloads；Windows 为 C:\Users\<用户>\Downloads
		const downloadsDir = join(homedir(), 'Downloads');
		await mkdir(downloadsDir, { recursive: true });
		outputPath = join(downloadsDir, `${title}.md`);
		console.log(`📁 保存位置: 默认下载目录 (${downloadsDir})`);
	}

	await writeFile(outputPath, finalContent, 'utf-8');

	const sizeKB = (Buffer.byteLength(finalContent, 'utf-8') / 1024).toFixed(1);
	console.log(`💾 已写入: ${outputPath}`);
	console.log(`📦 文件大小: ${sizeKB} KB${sizeKB > 1024 ? ' (图片 Base64 内嵌会显著增大体积)' : ''}`);
}

main().catch((error) => {
	console.error('处理失败:', error);
	process.exit(1);
});
