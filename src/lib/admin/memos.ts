import { env } from "cloudflare:workers";

type MemosRuntimeEnv = typeof env & Record<string, string | undefined>;

const runtimeEnv = env as MemosRuntimeEnv;

export type MemoItem = {
	id: string;
	content: string;
	url?: string;
	createdAt?: string;
	updatedAt?: string;
	tags: string[];
};

function envValue(key: string) {
	return runtimeEnv[key]?.trim();
}

function memosConfig() {
	const siteUrl = envValue("MEMOS_SITE_URL") || "https://memos.ficor.net";
	const apiUrl = envValue("MEMOS_API_URL") || new URL("/api/v1/memos", siteUrl).toString();
	const token = envValue("MEMOS_API_TOKEN");
	if (!token) throw new Error("MEMOS_API_TOKEN is not configured.");
	return { siteUrl, apiUrl, token };
}

function normalizeMemo(raw: any, siteUrl: string): MemoItem {
	const id = raw?.name || raw?.id || raw?.uid || crypto.randomUUID();
	const content = raw?.content || raw?.text || raw?.snippet || "";
	const tags = Array.from(String(content).matchAll(/#([\p{L}\p{N}_-]+)/gu)).map(match => match[1]);
	return {
		id: String(id),
		content,
		url: raw?.name ? new URL(String(raw.name).replace(/^\/+/, ""), `${siteUrl.replace(/\/+$/, "")}/`).toString() : undefined,
		createdAt: raw?.createTime || raw?.createdTs || raw?.createdAt,
		updatedAt: raw?.updateTime || raw?.updatedTs || raw?.updatedAt,
		tags: [...new Set(tags)]
	};
}

function memosHeaders(token: string) {
	const headers = new Headers();
	headers.set("Authorization", `Bearer ${token}`);
	headers.set("Accept", "application/json");
	return headers;
}

function memoList(data: any) {
	if (Array.isArray(data)) return data;
	return data?.memos || data?.items || data?.data || [];
}

export async function fetchMemos() {
	const config = memosConfig();
	const response = await fetch(config.apiUrl, {
		headers: memosHeaders(config.token),
		cf: { cacheTtl: 0, cacheEverything: false }
	});
	if (!response.ok) throw new Error(`Memos API ${response.status}`);
	const data = await response.json();
	const list = memoList(data);
	return {
		siteUrl: config.siteUrl,
		apiUrl: config.apiUrl,
		memos: Array.isArray(list) ? list.map(item => normalizeMemo(item, config.siteUrl)) : []
	};
}
