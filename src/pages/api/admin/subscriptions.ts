import type { APIRoute } from "astro";
import { requireAdmin } from "$lib/admin/auth";
import { readJsonContent, writeJsonContent } from "$lib/admin/content";
import { refreshFeedCache } from "$lib/admin/feed-refresh";

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies, url }) => {
	const denied = await requireAdmin(request, cookies);
	if (denied) return denied;
	const locale = url.searchParams.get("locale") || "zh-cn";
	return Response.json({
		subscriptions: await readJsonContent(`${locale}/subscriptions.json`, []),
		items: await readJsonContent(`${locale}/feed-cache.json`, [])
	});
};

export const POST: APIRoute = async ({ request, cookies }) => {
	const denied = await requireAdmin(request, cookies);
	if (denied) return denied;
	try {
		const { subscriptions, locale } = (await request.json()) as { subscriptions: unknown[]; locale?: string };
		return Response.json({ subscriptions: await writeJsonContent(`${locale || "zh-cn"}/subscriptions.json`, subscriptions || []) });
	} catch (error) {
		return Response.json({ error: error instanceof Error ? error.message : "保存订阅失败" }, { status: 400 });
	}
};

export const PATCH: APIRoute = async ({ request, cookies }) => {
	const denied = await requireAdmin(request, cookies);
	if (denied) return denied;
	let locale = "zh-cn";
	try {
		const body = (await request.json()) as { locale?: string };
		if (body.locale) locale = body.locale;
	} catch {}
	const subscriptions = await readJsonContent<unknown[]>(`${locale}/subscriptions.json`, []);
	const fallback = await readJsonContent<unknown[]>(`${locale}/feed-cache.json`, []);
	const refreshed = await refreshFeedCache(subscriptions as any[], fallback as any[]);
	if (refreshed.items.length) await writeJsonContent(`${locale}/feed-cache.json`, refreshed.items);
	return Response.json({
		subscriptions,
		items: refreshed.items,
		refreshedAt: refreshed.updatedAt,
		sources: refreshed.sources,
		errors: refreshed.errors
	});
};
