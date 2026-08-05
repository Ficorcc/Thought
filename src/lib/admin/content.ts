import { deleteRepoFile, githubStatus, safeRepoPath, writeRepoFile } from "./github";

export type ArticleType = "note" | "guide" | "jotting";
export type Frontmatter = Record<string, string | number | boolean | string[] | undefined>;

const DEFAULT_LOCALE = "zh-cn";
const SITE_URL = "https://panjinye.com";
const articleTypes = ["note", "guide", "jotting"] as const;

const articleModules = {
	note: import.meta.glob<string>("/src/content/note/**/*.{md,mdx}", { query: "?raw", import: "default", eager: true }),
	guide: import.meta.glob<string>("/src/content/guide/**/*.{md,mdx}", { query: "?raw", import: "default", eager: true }),
	jotting: import.meta.glob<string>("/src/content/jotting/**/*.{md,mdx}", { query: "?raw", import: "default", eager: true })
};

const prefaceModules = import.meta.glob<string>("/src/content/preface/**/*.md", { query: "?raw", import: "default", eager: true });
const informationModules = import.meta.glob<string>("/src/content/information/**/*.{md,mdx,json}", { query: "?raw", import: "default", eager: true });

function sourcePath(path: string) {
	return path.replace(/^\/+/, "");
}

function localeAndId(type: ArticleType | "preface", path: string) {
	const clean = sourcePath(path);
	const prefix = `src/content/${type}/`;
	const rest = clean.slice(prefix.length);
	const [locale = DEFAULT_LOCALE, ...parts] = rest.split("/");
	let id = parts.join("/").replace(/\.mdx?$/, "");
	if (id.endsWith("/index")) id = id.slice(0, -"index".length - 1);
	return { locale, id };
}

function castValue(value: string): Frontmatter[string] {
	const trimmed = value.trim();
	if (!trimmed) return "";
	if (trimmed === "true") return true;
	if (trimmed === "false") return false;
	if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
	if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
		return trimmed
			.slice(1, -1)
			.split(",")
			.map(item => item.trim().replace(/^["']|["']$/g, ""))
			.filter(Boolean);
	}
	return trimmed.replace(/^["']|["']$/g, "");
}

export function parseMatter(markdown: string) {
	const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!match) return { frontmatter: {}, body: markdown };
	const frontmatter: Frontmatter = {};
	const lines = match[1].split(/\r?\n/);
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
		if (!keyMatch) continue;
		const [, key, raw] = keyMatch;
		if (raw.trim()) {
			frontmatter[key] = castValue(raw);
			continue;
		}
		const list: string[] = [];
		while (lines[index + 1]?.match(/^\s*-\s+/)) {
			index++;
			list.push(lines[index].replace(/^\s*-\s+/, "").replace(/^["']|["']$/g, ""));
		}
		frontmatter[key] = list;
	}
	return { frontmatter, body: markdown.slice(match[0].length) };
}

function yamlScalar(value: string | number | boolean, key?: string) {
	if (typeof value === "boolean" || typeof value === "number") return String(value);
	if (key === "timestamp" && /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(value)) return value;
	return JSON.stringify(value);
}

export function serializeMatter(frontmatter: Frontmatter, body: string) {
	const lines: string[] = [];
	for (const [key, value] of Object.entries(frontmatter)) {
		if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) continue;
		if (Array.isArray(value)) {
			lines.push(`${key}:`);
			for (const item of value) lines.push(`  - ${yamlScalar(item)}`);
		} else {
			lines.push(`${key}: ${yamlScalar(value, key)}`);
		}
	}
	return `---\n${lines.join("\n")}\n---\n\n${body.trim()}\n`;
}

function asString(value: Frontmatter[string], fallback = "") {
	return typeof value === "string" ? value : fallback;
}

function asArray(value: Frontmatter[string]) {
	return Array.isArray(value) ? value.filter(item => typeof item === "string") : [];
}

function asBoolean(value: Frontmatter[string]) {
	return typeof value === "boolean" ? value : false;
}

function asNumber(value: Frontmatter[string]) {
	return typeof value === "number" ? value : 0;
}

export function slugify(text: string) {
	const slug = text
		.toLowerCase()
		.normalize("NFKC")
		.replace(/[^\p{L}\p{N}\s-]+/gu, "")
		.trim()
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug || new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "-");
}

function cleanMarkdown(content: string) {
	return content
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/!\[[^\]]*]\([^)]*\)/g, " ")
		.replace(/\[[^\]]+]\([^)]*\)/g, "$1")
		.replace(/[#>*_`~|:[\]{}()\\]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function summarize(content: string, length = 120) {
	const paragraph =
		content
			.split(/\n{2,}/)
			.map(part => cleanMarkdown(part))
			.find(Boolean) ?? cleanMarkdown(content);
	return paragraph.length > length ? `${paragraph.slice(0, length).trim()}...` : paragraph;
}

export function suggestTags(title: string, content: string, existing: string[] = []) {
	const source = `${title}\n${cleanMarkdown(content)}`.toLowerCase();
	const stop = new Set(["the", "and", "for", "with", "this", "that", "from", "https", "http", "一个", "我们", "自己", "生活", "记录"]);
	const counts = new Map<string, number>();
	const words = source.match(/[\p{Script=Han}]{2,4}|[a-z0-9][a-z0-9-]{2,}/gu) ?? [];
	for (const word of words) {
		if (stop.has(word) || /^\d+$/.test(word)) continue;
		counts.set(word, (counts.get(word) ?? 0) + 1);
	}
	const generated = [...counts.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([word]) => word)
		.filter(word => !existing.includes(word))
		.slice(0, 6);
	return [...existing, ...generated].slice(0, 8);
}

function articleUrl(article: { type: string; locale: string; slug: string }) {
	const prefix = article.locale && article.locale !== DEFAULT_LOCALE ? `/${article.locale}` : "";
	return `${SITE_URL}${prefix}/${article.type}/${encodeURI(article.slug || "")}`;
}

function readArticle(path: string, raw: string, type: ArticleType) {
	const { locale, id } = localeAndId(type, path);
	const { frontmatter, body } = parseMatter(raw);
	const slug = id;
	const record = {
		type,
		locale,
		id,
		slug,
		path: sourcePath(path),
		title: asString(frontmatter.title, id),
		timestamp: asString(frontmatter.timestamp, ""),
		series: asString(frontmatter.series, undefined as unknown as string),
		tags: asArray(frontmatter.tags),
		description: asString(frontmatter.description, ""),
		draft: asBoolean(frontmatter.draft),
		toc: asBoolean(frontmatter.toc),
		top: asNumber(frontmatter.top),
		sensitive: asBoolean(frontmatter.sensitive),
		content: body,
		updated: "",
		url: ""
	};
	record.url = articleUrl(record);
	return record;
}

export async function listArticles() {
	const records = articleTypes.flatMap(type =>
		Object.entries(articleModules[type])
			.filter(([path]) => !path.split("/").some(part => part.startsWith("_") || part.startsWith("._")))
			.map(([path, raw]) => readArticle(path, raw, type))
	);
	return records.sort(
		(a, b) => Number(b.top) - Number(a.top) || String(b.timestamp).localeCompare(String(a.timestamp)) || a.title.localeCompare(b.title)
	);
}

export function buildTaxonomy(articles: Awaited<ReturnType<typeof listArticles>>) {
	const series = new Map<string, number>();
	const tags = new Map<string, number>();
	const directories = new Map<string, number>();
	for (const article of articles) {
		if (article.series) series.set(article.series, (series.get(article.series) ?? 0) + 1);
		for (const tag of article.tags) tags.set(tag, (tags.get(tag) ?? 0) + 1);
		const directory = article.path.split("/").slice(0, -1).join("/");
		directories.set(directory, (directories.get(directory) ?? 0) + 1);
	}
	const pack = (map: Map<string, number>) =>
		[...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count }));
	return { series: pack(series), tags: pack(tags), directories: pack(directories) };
}

export function localTimestamp(date = new Date()) {
	const offsetMinutes = -date.getTimezoneOffset();
	const sign = offsetMinutes >= 0 ? "+" : "-";
	const absolute = Math.abs(offsetMinutes);
	const offset = `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
	const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000).toISOString().slice(0, 19);
	return `${local}${offset}`;
}

function articleFilePath(type: ArticleType, locale: string, slug: string) {
	return `src/content/${type}/${locale}/${slugify(slug)}.md`;
}

export async function saveArticle(input: any) {
	const type = (input.type || "note") as ArticleType;
	const locale = input.locale || DEFAULT_LOCALE;
	const slug = slugify(input.slug || input.title || "untitled");
	const path = input.originalPath ? safeRepoPath(input.originalPath) : articleFilePath(type, locale, slug);
	const body = input.content ?? "";
	const frontmatter: Frontmatter = {
		title: input.title || slug,
		timestamp: input.timestamp || localTimestamp(),
		series: input.series,
		tags: Array.isArray(input.tags) && input.tags.length ? input.tags : suggestTags(input.title || slug, body),
		description: input.description?.trim() || summarize(body),
		sensitive: Boolean(input.sensitive),
		toc: type === "note" ? Boolean(input.toc) : undefined,
		top: input.top ? Number(input.top) : undefined,
		draft: Boolean(input.draft)
	};
	await writeRepoFile(path, serializeMatter(frontmatter, body), `Update ${type}: ${frontmatter.title}`);
	return { ...input, type, locale, slug, path, id: slug, url: articleUrl({ type, locale, slug }) };
}

export async function deleteArticle(path: string) {
	return deleteRepoFile(path, `Delete content: ${path}`);
}

export function listLocales(type: ArticleType | "preface") {
	const paths = type === "preface" ? Object.keys(prefaceModules) : Object.keys(articleModules[type]);
	return [...new Set(paths.map(path => localeAndId(type, path).locale))].sort();
}

export async function listPrefaces(locale = DEFAULT_LOCALE) {
	return Object.entries(prefaceModules)
		.map(([path, raw]) => {
			const info = localeAndId("preface", path);
			const { frontmatter, body } = parseMatter(raw);
			return {
				locale: info.locale,
				id: info.id,
				path: sourcePath(path),
				timestamp: asString(frontmatter.timestamp, ""),
				draft: asBoolean(frontmatter.draft),
				content: body,
				updated: ""
			};
		})
		.filter(item => item.locale === locale)
		.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function savePreface(input: any) {
	const locale = input.locale || DEFAULT_LOCALE;
	const content = input.content || "";
	if (!content.trim()) throw new Error("序文内容不能为空。");
	const timestamp = input.timestamp || localTimestamp();
	const id = timestamp.slice(0, 19).replace(/[\s:]/g, "-");
	const path = input.originalPath ? safeRepoPath(input.originalPath) : `src/content/preface/${locale}/${id}.md`;
	await writeRepoFile(path, serializeMatter({ timestamp, draft: Boolean(input.draft) }, content), `Update preface: ${timestamp}`);
	return { locale, id, path, timestamp, draft: Boolean(input.draft), content, updated: "" };
}

export async function deletePreface(path: string) {
	return deleteRepoFile(path, `Delete preface: ${path}`);
}

function extractArrayModule(source: string) {
	const start = source.indexOf("export const links =");
	if (start < 0) return [];
	const arrayStart = source.indexOf("[", start);
	if (arrayStart < 0) return [];
	let depth = 0;
	let inString = false;
	let quote = "";
	let escaped = false;
	for (let index = arrayStart; index < source.length; index++) {
		const char = source[index];
		if (inString) {
			if (escaped) escaped = false;
			else if (char === "\\") escaped = true;
			else if (char === quote) inString = false;
			continue;
		}
		if (char === '"' || char === "'") {
			inString = true;
			quote = char;
			continue;
		}
		if (char === "[") depth++;
		if (char === "]") depth--;
		if (depth === 0) return JSON.parse(source.slice(arrayStart, index + 1));
	}
	return [];
}

function informationRaw(path: string) {
	return informationModules[`/src/content/information/${path}`] || "";
}

export async function readLinkroll(locale = DEFAULT_LOCALE) {
	return extractArrayModule(informationRaw(`${locale}/linkroll.mdx`));
}

export async function writeLinkroll(links: unknown[], locale = DEFAULT_LOCALE) {
	const path = `src/content/information/${locale}/linkroll.mdx`;
	const source =
		informationRaw(`${locale}/linkroll.mdx`) ||
		'import Linkroll from "$components/Linkroll.astro";\n\nexport const links = [];\n\n<Linkroll links={links} locale={props.locale} />\n';
	const serialized = JSON.stringify(links, null, "\t");
	const next = source.includes("export const links =")
		? source.replace(/export const links = \[[\s\S]*?\];/, `export const links = ${serialized};`)
		: `${source.trim()}\n\nexport const links = ${serialized};\n`;
	await writeRepoFile(path, next, "Update linkroll");
	return links;
}

export async function readJsonContent<T>(path: string, fallback: T): Promise<T> {
	const raw = informationRaw(path);
	if (!raw.trim()) return fallback;
	return JSON.parse(raw) as T;
}

export async function writeJsonContent(path: string, value: unknown) {
	await writeRepoFile(`src/content/information/${path}`, `${JSON.stringify(value, null, "\t")}\n`, `Update ${path}`);
	return value;
}

export function deployStatus() {
	const status = githubStatus();
	return {
		siteRoot: "Cloudflare Worker",
		branch: status.branch,
		status: status.configured
			? "GitHub 内容写入已配置"
			: status.repo
				? "未配置 GITHUB_TOKEN，内容保存会被拒绝"
				: "未配置 GITHUB_REPO/GITHUB_TOKEN，内容保存会被拒绝",
		remotes: status.repo || "未配置",
		tokenConfigured: status.tokenConfigured
	};
}
