type SubscriptionSource = {
	title?: string;
	siteUrl?: string;
	feedUrl?: string;
	url?: string;
	description?: string;
};

export type FeedCacheItem = {
	source: string;
	siteTitle?: string;
	title: string;
	url: string;
	date: string;
	summary: string;
};

export type FeedRefreshResult = {
	items: FeedCacheItem[];
	sources: number;
	errors: string[];
	updatedAt: string;
};

const DEFAULT_AGGREGATORS = [
	{ source: "lilog.cn", url: "https://lilog.cn/is/index.php?action=refresh_feeds&page=1", parser: "lilog" },
	{ source: "jh.3v.hk", url: "https://jh.3v.hk/index.php", parser: "jh" }
] as const;

function decodeHtml(value: string) {
	return String(value || "")
		.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body) => {
			const key = String(body).toLowerCase();
			if (key.startsWith("#x")) return String.fromCharCode(Number.parseInt(key.slice(2), 16));
			if (key.startsWith("#")) return String.fromCharCode(Number.parseInt(key.slice(1), 10));
			return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " } as Record<string, string>)[key] || entity;
		})
		.replace(/\s+/g, " ")
		.trim();
}

function attr(block: string, name: string) {
	const match = block.match(new RegExp(`${name}=["']([^"']+)["']`, "i"));
	return match ? decodeHtml(match[1]) : "";
}

function inner(block: string, tag: string, classPart?: string) {
	const classPattern = classPart ? `[^>]*class=["'][^"']*${classPart}[^"']*["'][^>]*` : "[^>]*";
	const match = block.match(new RegExp(`<${tag}${classPattern}>([\\s\\S]*?)<\\/${tag}>`, "i"));
	return match ? decodeHtml(match[1]) : "";
}

function hostName(value: string) {
	try {
		return new URL(value).hostname.replace(/^www\./, "");
	} catch {
		return "";
	}
}

function currentYear() {
	return new Date().getFullYear();
}

function normalizeDate(value: string) {
	const text = decodeHtml(value);
	if (!text) return "";
	const full = text.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}:\d{2}))?/);
	if (full) return `${full[1]}-${full[2].padStart(2, "0")}-${full[3].padStart(2, "0")}${full[4] ? ` ${full[4]}` : ""}`;
	const short = text.match(/(\d{1,2})[-/.](\d{1,2})(?:\s+(\d{1,2}:\d{2}))?/);
	if (short) return `${currentYear()}-${short[1].padStart(2, "0")}-${short[2].padStart(2, "0")}${short[3] ? ` ${short[3]}` : ""}`;
	const parsed = Date.parse(text);
	if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 16).replace("T", " ");
	return text;
}

function shorten(value: string, length = 240) {
	const text = decodeHtml(value);
	return text.length > length ? `${text.slice(0, length).trim()}...` : text;
}

function item(source: string, siteTitle: string, title: string, url: string, date: string, summary: string): FeedCacheItem | null {
	const cleanUrl = decodeHtml(url);
	const cleanTitle = decodeHtml(title);
	if (!cleanUrl || !cleanTitle) return null;
	return {
		source,
		siteTitle: decodeHtml(siteTitle) || hostName(cleanUrl),
		title: cleanTitle,
		url: cleanUrl,
		date: normalizeDate(date),
		summary: shorten(summary)
	};
}

function parseLilogHtml(html: string, source = "lilog.cn") {
	return html
		.split(/<article\b/gi)
		.slice(1)
		.map(block => {
			const card = `<article${block}`;
			const linkMatch = card.match(/<a\b[^>]*href=["']([^"']+)["'][\s\S]*?<h3\b[^>]*>([\s\S]*?)<\/h3>/i);
			const summary = inner(card, "p", "line-clamp");
			const siteTitle = inner(card, "span", "bg-gray-100") || attr(card.match(/site-favicon[\s\S]*?<\/span>/i)?.[0] || "", "title");
			const date = inner(card, "span", "shrink-0");
			return linkMatch ? item(source, siteTitle, linkMatch[2], linkMatch[1], date, summary) : null;
		})
		.filter(Boolean) as FeedCacheItem[];
}

function parseJhHtml(html: string, source = "jh.3v.hk") {
	return html
		.split(/<div class=["'][^"']*bg-white border-2 border-black rounded-xl/gi)
		.slice(1)
		.map(block => {
			const card = `<div class="bg-white border-2 border-black rounded-xl${block}`;
			const linkMatch = card.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*title=["']([^"']+)["'][^>]*>/i);
			const title = linkMatch?.[2] || inner(card, "h3");
			const summary = inner(card, "p", "line-clamp");
			const siteTitle = decodeHtml(card.match(/fa-rss[\s\S]*?<\/i>\s*([^<]+)<\/span>/i)?.[1] || "");
			const date = decodeHtml(card.match(/fa-calendar-alt[\s\S]*?<\/i>\s*([^<]+)<\/span>/i)?.[1] || "");
			return linkMatch ? item(source, siteTitle, title, linkMatch[1], date, summary) : null;
		})
		.filter(Boolean) as FeedCacheItem[];
}

function tag(block: string, name: string) {
	const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
	return match ? decodeHtml(match[1]) : "";
}

function cdata(value: string) {
	return value.replace(/<!\[CDATA\[([\s\S]*?)]]>/g, "$1");
}

function parseXmlFeed(xml: string, source: SubscriptionSource) {
	const text = cdata(xml);
	const siteTitle = source.title || tag(text, "title") || hostName(source.siteUrl || source.feedUrl || "");
	const blocks = text.match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi) || [];
	return blocks
		.map(block => {
			const atomLink = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1] || "";
			const url = tag(block, "link") || atomLink || tag(block, "guid");
			const date = tag(block, "pubDate") || tag(block, "published") || tag(block, "updated") || tag(block, "dc:date");
			return item(
				source.feedUrl || source.url || hostName(url),
				siteTitle,
				tag(block, "title"),
				url,
				date,
				tag(block, "description") || tag(block, "summary") || tag(block, "content:encoded") || tag(block, "content")
			);
		})
		.filter(Boolean) as FeedCacheItem[];
}

function parseJsonFeed(data: any, source: SubscriptionSource) {
	const siteTitle = source.title || data.title || hostName(source.siteUrl || source.feedUrl || "");
	const entries = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
	return entries
		.map((entry: any) =>
			item(
				source.feedUrl || source.url || entry.url || "",
				siteTitle,
				entry.title || entry.name || entry.content_text || "",
				entry.url || entry.external_url || entry.link || entry.id || "",
				entry.date_published || entry.date_modified || entry.published || entry.updated || entry.date || "",
				entry.summary || entry.content_text || entry.content_html || entry.description || ""
			)
		)
		.filter(Boolean) as FeedCacheItem[];
}

async function fetchText(url: string) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 15_000);
	try {
		const response = await fetch(url, {
			headers: {
				"User-Agent": "ThoughtAdminFeedRefresh/1.0",
				accept: "application/feed+json, application/json, application/rss+xml, application/atom+xml, text/html, */*"
			},
			signal: controller.signal
		});
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		return await response.text();
	} finally {
		clearTimeout(timeout);
	}
}

async function refreshAggregator(source: (typeof DEFAULT_AGGREGATORS)[number]) {
	const text = await fetchText(source.url);
	if (source.parser === "lilog") {
		const data = JSON.parse(text) as { html?: string };
		return parseLilogHtml(data.html || "", source.source);
	}
	return parseJhHtml(text, source.source);
}

async function refreshFeed(source: SubscriptionSource) {
	const url = source.feedUrl || source.url;
	if (!url) return [];
	const text = await fetchText(url);
	try {
		return parseJsonFeed(JSON.parse(text), source);
	} catch {
		return parseXmlFeed(text, source);
	}
}

function dedupe(items: FeedCacheItem[]) {
	const seen = new Set<string>();
	return items
		.filter(entry => {
			const key = entry.url || `${entry.source}:${entry.title}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.sort((a, b) => normalizeDate(b.date).localeCompare(normalizeDate(a.date)))
		.slice(0, 80);
}

export async function refreshFeedCache(subscriptions: SubscriptionSource[], fallback: FeedCacheItem[] = []): Promise<FeedRefreshResult> {
	const errors: string[] = [];
	const customSources = subscriptions.filter(source => source.feedUrl || source.url);
	const tasks = customSources.length
		? customSources.map(source => ({ label: source.title || source.feedUrl || source.url || "feed", run: () => refreshFeed(source) }))
		: DEFAULT_AGGREGATORS.map(source => ({ label: source.source, run: () => refreshAggregator(source) }));
	const results = await Promise.all(
		tasks.map(async task => {
			try {
				return await task.run();
			} catch (error) {
				errors.push(`${task.label}: ${error instanceof Error ? error.message : "刷新失败"}`);
				return [];
			}
		})
	);
	const items = dedupe(results.flat());
	return {
		items: items.length ? items : fallback,
		sources: tasks.length,
		errors,
		updatedAt: new Date().toISOString()
	};
}
