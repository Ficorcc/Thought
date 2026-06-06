import type { APIRoute } from "astro";

export const prerender = false;

type Frontmatter = Record<string, any>;
type ContentSection = "note" | "guide" | "jotting";
type LinkrollItem = {
	title: string;
	url: string;
	type?: string;
	image?: string;
	description?: string;
	feed?: string;
	status?: number | string;
	source?: string;
};

const CONTENT_ROOT = "src/content";
const ARTICLE_SECTIONS = ["note", "guide", "jotting"] as const;

function json(data: unknown, init: ResponseInit = {}) {
	return new Response(JSON.stringify(data), {
		...init,
		headers: {
			"content-type": "application/json; charset=utf-8",
			...init.headers
		}
	});
}

function unavailable() {
	return json(
		{
			ok: false,
			error: "后台写文件、Git 和部署能力只在本地开发环境可用。线上 Cloudflare Worker 不提供本地文件系统。"
		},
		{ status: 403 }
	);
}

function isLocalRequest(request: Request) {
	const url = new URL(request.url);
	return import.meta.env.DEV || url.hostname === "localhost" || url.hostname === "127.0.0.1";
}

function isLocalAdminRuntime() {
	const env = (globalThis as any).process?.env;
	return import.meta.env.DEV && (env?.LOCAL_ADMIN === "1" || env?.LOCAL_ADMIN === "true");
}

function requireLocalAdminRuntime() {
	return json(
		{
			ok: false,
			error: "后台管理需要本地文件系统，请使用 `pnpm admin:dev --host 127.0.0.1 --port 4322` 启动。普通 `pnpm dev` 仍保留 Cloudflare 评论/D1 调试环境。"
		},
		{ status: 409 }
	);
}

function root() {
	return (globalThis as any).process?.cwd?.() as string | undefined;
}

async function nodeDeps() {
	const cwd = root();
	if (!cwd) throw new Error("Cannot resolve project root");
	const fs = await import(/* @vite-ignore */ "node:fs/promises");
	const path = await import(/* @vite-ignore */ "node:path");
	const childProcess = await import(/* @vite-ignore */ "node:child_process");
	const util = await import(/* @vite-ignore */ "node:util");
	return { cwd, fs, path, execFile: util.promisify(childProcess.execFile) };
}

function normalizeSlashes(value: string) {
	return value.replaceAll("\\", "/");
}

function stripMarkdown(value: string) {
	return value
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/!\[[^\]]*]\([^)]*\)/g, " ")
		.replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
		.replace(/[#>*_`~\-|]/g, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function autoDescription(markdown: string) {
	return stripMarkdown(markdown).slice(0, 140);
}

function autoTags(markdown: string) {
	const text = stripMarkdown(markdown);
	const source = Array.from(new Set(text.match(/[A-Za-z][A-Za-z0-9+#.-]{1,24}|[\u4e00-\u9fa5]{2,6}/g) ?? []));
	return source
		.filter(word => !["这个", "一个", "可以", "自己", "现在", "就是", "还是", "没有", "因为", "所以"].includes(word.toLowerCase()))
		.slice(0, 8);
}

function slugify(input: string) {
	const slug = input
		.trim()
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s_-]+/gu, "")
		.replace(/[\s_]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	return slug || `post-${Date.now()}`;
}

function parseScalar(value: string) {
	const trimmed = value.trim();
	if (!trimmed) return "";
	if (trimmed === "true") return true;
	if (trimmed === "false") return false;
	if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
	if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
		return trimmed
			.slice(1, -1)
			.split(",")
			.map(item => item.trim().replace(/^["']|["']$/g, ""))
			.filter(Boolean);
	}
	return trimmed.replace(/^["']|["']$/g, "");
}

function parseFrontmatter(raw: string): { data: Frontmatter; body: string } {
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!match) return { data: {}, body: raw };
	const lines = match[1].split(/\r?\n/);
	const data: Frontmatter = {};
	let key: string | null = null;

	for (const line of lines) {
		const listItem = line.match(/^\s*-\s+(.+)$/);
		if (listItem && key) {
			if (!Array.isArray(data[key])) data[key] = [];
			data[key].push(parseScalar(listItem[1]));
			continue;
		}

		const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
		if (!pair) continue;
		key = pair[1];
		data[key] = pair[2] ? parseScalar(pair[2]) : [];
	}

	return { data, body: match[2] };
}

function frontmatter(data: Frontmatter) {
	const lines = ["---"];
	for (const [key, value] of Object.entries(data)) {
		if (value === undefined || value === null || value === "") continue;
		if (Array.isArray(value)) {
			lines.push(`${key}:`);
			for (const item of value) lines.push(`  - ${String(item)}`);
		} else {
			lines.push(`${key}: ${String(value)}`);
		}
	}
	lines.push("---");
	return `${lines.join("\n")}\n`;
}

function headings(markdown: string) {
	return markdown
		.split(/\r?\n/)
		.map(line => line.match(/^(#{1,6})\s+(.+)$/))
		.filter(Boolean)
		.map(match => ({ level: match![1].length, text: match![2].replace(/[#*_`]/g, "").trim() }));
}

async function walkMarkdown(base: string) {
	const { fs, path } = await nodeDeps();
	const out: string[] = [];
	async function walk(dir: string) {
		let entries: any[] = [];
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch (_) {
			return;
		}
		for (const entry of entries) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				await walk(full);
			} else if (entry.isFile() && entry.name.endsWith(".md") && !entry.name.startsWith("_")) {
				out.push(full);
			}
		}
	}
	await walk(base);
	return out;
}

async function readArticles() {
	const { cwd, fs, path } = await nodeDeps();
	const items = [];
	for (const section of ARTICLE_SECTIONS) {
		const base = path.join(cwd, CONTENT_ROOT, section);
		for (const file of await walkMarkdown(base)) {
			const raw = await fs.readFile(file, "utf-8");
			const parsed = parseFrontmatter(raw);
			const rel = normalizeSlashes(path.relative(cwd, file));
			const locale = normalizeSlashes(path.relative(base, file)).split("/")[0] || "zh-cn";
			items.push({
				section,
				locale,
				path: rel,
				slug: path.basename(file, ".md"),
				title: parsed.data.title ?? path.basename(file, ".md"),
				timestamp: parsed.data.timestamp ?? "",
				series: parsed.data.series ?? "",
				tags: parsed.data.tags ?? [],
				description: parsed.data.description ?? autoDescription(parsed.body),
				draft: Boolean(parsed.data.draft),
				headings: headings(parsed.body),
				words: stripMarkdown(parsed.body).length
			});
		}
	}
	items.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
	return items;
}

async function readPrefaces() {
	const { cwd, fs, path } = await nodeDeps();
	const base = path.join(cwd, CONTENT_ROOT, "preface");
	const files = await walkMarkdown(base);
	const items = [];
	for (const file of files) {
		const raw = await fs.readFile(file, "utf-8");
		const parsed = parseFrontmatter(raw);
		const rel = normalizeSlashes(path.relative(cwd, file));
		const locale = normalizeSlashes(path.relative(base, file)).split("/")[0] || "zh-cn";
		items.push({
			locale,
			path: rel,
			timestamp: parsed.data.timestamp ?? "",
			text: stripMarkdown(parsed.body).slice(0, 160)
		});
	}
	items.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
	return items;
}

async function readChronicle() {
	const { cwd, fs, path } = await nodeDeps();
	const file = path.join(cwd, CONTENT_ROOT, "information", "zh-cn", "chronicle.yaml");
	try {
		const raw = await fs.readFile(file, "utf-8");
		const items: Array<{ date: string; text: string; source: string }> = [];
		let date = "";
		for (const line of raw.split(/\r?\n/)) {
			const dateMatch = line.match(/^(\d{4}-\d{2}-\d{2}):/);
			if (dateMatch) date = dateMatch[1];
			const eventMatch = line.match(/^\s*-\s+(.+)$/);
			if (date && eventMatch) items.push({ date, text: eventMatch[1], source: "local" });
		}
		return items;
	} catch (_) {
		return [];
	}
}

function findLinksArraySource(raw: string) {
	const start = raw.indexOf("export const links =");
	if (start < 0) throw new Error("Cannot find links export");
	const arrayStart = raw.indexOf("[", start);
	if (arrayStart < 0) throw new Error("Cannot find links array");
	let depth = 0;
	for (let index = arrayStart; index < raw.length; index++) {
		const char = raw[index];
		if (char === "[") depth++;
		if (char === "]") depth--;
		if (depth === 0) return { before: raw.slice(0, arrayStart), array: raw.slice(arrayStart, index + 1), after: raw.slice(index + 1) };
	}
	throw new Error("Cannot parse links array");
}

async function readLinkroll() {
	const { cwd, fs, path } = await nodeDeps();
	const file = path.join(cwd, CONTENT_ROOT, "information", "zh-cn", "linkroll.mdx");
	const raw = await fs.readFile(file, "utf-8");
	const source = findLinksArraySource(raw);
	return JSON.parse(source.array) as LinkrollItem[];
}

async function writeLinkroll(links: LinkrollItem[]) {
	const { cwd, fs, path } = await nodeDeps();
	const file = path.join(cwd, CONTENT_ROOT, "information", "zh-cn", "linkroll.mdx");
	const raw = await fs.readFile(file, "utf-8");
	const source = findLinksArraySource(raw);
	const next = `${source.before}${JSON.stringify(links, null, "\t")}${source.after}`;
	await fs.writeFile(file, next);
}

async function readExternalJson(url?: string, token?: string) {
	if (!url) return [];
	try {
		const response = await fetch(url, {
			headers: token ? { authorization: `Bearer ${token}` } : undefined,
			signal: AbortSignal.timeout(10000)
		});
		if (!response.ok) return [];
		const json = await response.json();
		return Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : Array.isArray(json?.items) ? json.items : [];
	} catch (_) {
		return [];
	}
}

async function listData() {
	const articles = await readArticles();
	const prefaces = await readPrefaces();
	const links = await readLinkroll();
	const chronicle = await readChronicle();
	const memoApi = await readExternalJson(import.meta.env.MEMOS_API_URL, import.meta.env.MEMOS_TOKEN);
	const feedApi = await readExternalJson(import.meta.env.FEED_API_URL, import.meta.env.FEED_API_TOKEN);
	const tags = [...new Set(articles.flatMap(item => item.tags ?? []))].sort();
	const series = [...new Set(articles.map(item => item.series).filter(Boolean))].sort();
	return {
		ok: true,
		articles,
		prefaces,
		links,
		chronicle: [
			...chronicle,
			...memoApi.map((item: any) => ({
				date: item.createdTs || item.createTime || item.createdAt || item.date || "",
				text: item.content || item.text || item.title || JSON.stringify(item).slice(0, 120),
				source: "api"
			}))
		],
		feeds: feedApi.map((item: any) => ({
			title: item.title,
			url: item.url || item.link,
			date: item.date || item.published || item.pubDate,
			source: "api"
		})),
		tags,
		series,
		counts: {
			articles: articles.length,
			prefaces: prefaces.length,
			links: links.length,
			tags: tags.length,
			series: series.length
		},
		env: {
			memosApi: Boolean(import.meta.env.MEMOS_API_URL),
			feedApi: Boolean(import.meta.env.FEED_API_URL)
		}
	};
}

async function saveArticle(payload: any) {
	const { cwd, fs, path } = await nodeDeps();
	const section = ARTICLE_SECTIONS.includes(payload.section) ? (payload.section as ContentSection) : "note";
	const locale = payload.locale || "zh-cn";
	const title = String(payload.title || "未命名");
	const body = String(payload.body || "");
	const slug = slugify(payload.slug || title);
	const data: Frontmatter = {
		title,
		timestamp: payload.timestamp || new Date().toISOString(),
		series: payload.series || undefined,
		tags: Array.isArray(payload.tags) ? payload.tags : String(payload.tags || "").split(/[,，\s]+/).filter(Boolean),
		description: payload.description || autoDescription(body),
		toc: payload.toc ? true : undefined,
		draft: payload.draft ? true : undefined
	};
	if (!data.tags.length) data.tags = autoTags(body);
	const dir = path.join(cwd, CONTENT_ROOT, section, locale);
	await fs.mkdir(dir, { recursive: true });
	const file = path.join(dir, `${slug}.md`);
	await fs.writeFile(file, `${frontmatter(data)}${body.trim()}\n`);
	return { ok: true, path: normalizeSlashes(path.relative(cwd, file)), slug, description: data.description, tags: data.tags };
}

async function savePreface(payload: any) {
	const { cwd, fs, path } = await nodeDeps();
	const locale = payload.locale || "zh-cn";
	const body = String(payload.body || "");
	const timestamp = payload.timestamp || new Date().toISOString();
	const slug = String(timestamp)
		.replace(/[TZ:+]/g, "-")
		.replace(/\.\d+/, "")
		.replace(/-+$/g, "");
	const dir = path.join(cwd, CONTENT_ROOT, "preface", locale);
	await fs.mkdir(dir, { recursive: true });
	const file = path.join(dir, `${slug}.md`);
	await fs.writeFile(file, `${frontmatter({ timestamp })}${body.trim()}\n`);
	return { ok: true, path: normalizeSlashes(path.relative(cwd, file)) };
}

function absolutize(base: string, href: string | null | undefined) {
	if (!href) return undefined;
	try {
		return new URL(href, base).toString();
	} catch (_) {
		return undefined;
	}
}

function htmlAttr(html: string, selector: RegExp) {
	return html.match(selector)?.[1]?.trim();
}

async function discoverSite(payload: any) {
	const input = String(payload.url || payload.domain || "").trim();
	const target = input.startsWith("http") ? input : `https://${input}`;
	const response = await fetch(target, { signal: AbortSignal.timeout(12000), redirect: "follow" });
	const html = await response.text();
	const finalUrl = response.url || target;
	const title =
		htmlAttr(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
		htmlAttr(html, /<title[^>]*>([\s\S]*?)<\/title>/i)?.replace(/\s+/g, " ") ||
		new URL(finalUrl).hostname;
	const description =
		htmlAttr(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
		htmlAttr(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
		"";
	const icon =
		absolutize(finalUrl, htmlAttr(html, /<link[^>]+rel=["'][^"']*(?:icon|apple-touch-icon)[^"']*["'][^>]+href=["']([^"']+)["']/i)) ||
		absolutize(finalUrl, "/favicon.ico");
	const feed =
		absolutize(finalUrl, htmlAttr(html, /<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]+href=["']([^"']+)["']/i)) ||
		absolutize(finalUrl, htmlAttr(html, /<link[^>]+rel=["']alternate["'][^>]+href=["']([^"']+)["']/i)) ||
		absolutize(finalUrl, "/feed.xml");
	return { ok: true, title, url: finalUrl, description, image: icon, feed };
}

async function addLink(payload: any) {
	const links = await readLinkroll();
	const item: LinkrollItem = {
		title: String(payload.title || payload.url || "未命名"),
		url: String(payload.url),
		type: payload.type || "lifestyle",
		image: payload.image || "",
		description: payload.description || "",
		feed: payload.feed || undefined
	};
	const index = links.findIndex(link => link.url === item.url);
	if (index >= 0) links[index] = { ...links[index], ...item };
	else links.push(item);
	await writeLinkroll(links);
	return { ok: true, item, count: links.length };
}

async function checkLinks() {
	const links = await readLinkroll();
	const results = [];
	for (const link of links) {
		try {
			const response = await fetch(link.url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(8000) });
			results.push({ url: link.url, title: link.title, status: response.status, ok: response.ok });
		} catch (error: any) {
			results.push({ url: link.url, title: link.title, status: error?.message ?? "failed", ok: false });
		}
	}
	return { ok: true, results };
}

function parseFeedItems(xml: string, source: string) {
	const chunks = xml.match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi) ?? [];
	return chunks.slice(0, 8).map(chunk => ({
		title: htmlAttr(chunk, /<title[^>]*><!\[CDATA\[([\s\S]*?)]]><\/title>/i) || htmlAttr(chunk, /<title[^>]*>([\s\S]*?)<\/title>/i) || "Untitled",
		url: htmlAttr(chunk, /<link[^>]*href=["']([^"']+)["'][^>]*>/i) || htmlAttr(chunk, /<link[^>]*>([\s\S]*?)<\/link>/i) || source,
		date: htmlAttr(chunk, /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || htmlAttr(chunk, /<updated[^>]*>([\s\S]*?)<\/updated>/i) || "",
		source
	}));
}

async function refreshFeeds() {
	const links = await readLinkroll();
	const feeds = links.map(link => link.feed).filter(Boolean) as string[];
	const results = [];
	for (const feed of feeds) {
		try {
			const response = await fetch(feed, { signal: AbortSignal.timeout(10000) });
			const xml = await response.text();
			results.push(...parseFeedItems(xml, feed));
		} catch (_) {
			results.push({ title: "订阅源读取失败", url: feed, date: "", source: feed });
		}
	}
	const apiItems = await readExternalJson(import.meta.env.FEED_API_URL, import.meta.env.FEED_API_TOKEN);
	return {
		ok: true,
		items: [
			...results,
			...apiItems.map((item: any) => ({
				title: item.title,
				url: item.url || item.link,
				date: item.date || item.published || item.pubDate,
				source: "api"
			}))
		]
	};
}

async function run(command: string, args: string[]) {
	const { cwd, execFile } = await nodeDeps();
	const result = await execFile(command, args, { cwd, timeout: 120000, maxBuffer: 1024 * 1024 * 4 });
	return `${result.stdout || ""}${result.stderr || ""}`.trim();
}

async function deployAction(payload: any) {
	const mode = payload.mode || "status";
	const message = String(payload.message || "Update content from admin");
	const steps: Array<{ step: string; output: string }> = [];
	if (mode === "status") {
		steps.push({ step: "git status", output: await run("git", ["status", "--short"]) });
		return { ok: true, steps };
	}
	if (mode === "commit" || mode === "all") {
		steps.push({ step: "git add", output: await run("git", ["add", "-A"]) });
		try {
			steps.push({ step: "git commit", output: await run("git", ["commit", "-m", message]) });
		} catch (error: any) {
			steps.push({ step: "git commit", output: error?.stdout || error?.stderr || error?.message || "No changes" });
		}
	}
	if (mode === "push" || mode === "all") {
		const branch = (await run("git", ["branch", "--show-current"])).trim() || "cloudflare";
		steps.push({ step: "git push", output: await run("git", ["push", "origin", branch]) });
	}
	if (mode === "deploy" || mode === "all") {
		steps.push({ step: "astro build", output: await run("pnpm", ["run", "build"]) });
		steps.push({ step: "wrangler deploy", output: await run("pnpm", ["run", "deploy"]) });
	}
	return { ok: true, steps };
}

async function readBody(request: Request) {
	try {
		return await request.json();
	} catch (_) {
		return {};
	}
}

async function handle(action: string, request: Request) {
	const body = await readBody(request);
	switch (action) {
		case "list":
			return json(await listData());
		case "save-article":
			return json(await saveArticle(body));
		case "save-preface":
			return json(await savePreface(body));
		case "discover-site":
			return json(await discoverSite(body));
		case "add-link":
			return json(await addLink(body));
		case "check-links":
			return json(await checkLinks());
		case "refresh-feeds":
			return json(await refreshFeeds());
		case "deploy":
			return json(await deployAction(body));
		default:
			return json({ ok: false, error: `Unknown admin action: ${action}` }, { status: 404 });
	}
}

export const GET: APIRoute = async ({ params, request }) => {
	if (!isLocalRequest(request)) return unavailable();
	if (!isLocalAdminRuntime()) return requireLocalAdminRuntime();
	const action = params.path || "list";
	try {
		return await handle(action, request);
	} catch (error: any) {
		return json({ ok: false, error: error?.message ?? String(error) }, { status: 500 });
	}
};

export const POST: APIRoute = async ({ params, request }) => {
	if (!isLocalRequest(request)) return unavailable();
	if (!isLocalAdminRuntime()) return requireLocalAdminRuntime();
	const action = params.path || "list";
	try {
		return await handle(action, request);
	} catch (error: any) {
		return json({ ok: false, error: error?.message ?? String(error) }, { status: 500 });
	}
};
