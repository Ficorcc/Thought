import type { APIRoute } from "astro";
import { requireAdmin } from "$lib/admin/auth";
import { readJsonContent, writeJsonContent } from "$lib/admin/content";

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
	const subscriptions = await readJsonContent("zh-cn/subscriptions.json", []);
	const items = await readJsonContent("zh-cn/feed-cache.json", []);
	return Response.json({ subscriptions, items });
};
