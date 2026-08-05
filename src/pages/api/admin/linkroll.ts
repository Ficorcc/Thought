import type { APIRoute } from "astro";
import { requireAdmin } from "$lib/admin/auth";
import { readLinkroll, writeLinkroll } from "$lib/admin/content";

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies, url }) => {
	const denied = await requireAdmin(request, cookies);
	if (denied) return denied;
	return Response.json({ links: await readLinkroll(url.searchParams.get("locale") || "zh-cn") });
};

export const POST: APIRoute = async ({ request, cookies }) => {
	const denied = await requireAdmin(request, cookies);
	if (denied) return denied;
	try {
		const { links, locale } = (await request.json()) as { links: unknown[]; locale?: string };
		return Response.json({ links: await writeLinkroll(links, locale || "zh-cn") });
	} catch (error) {
		return Response.json({ error: error instanceof Error ? error.message : "保存友链失败" }, { status: 400 });
	}
};

export const PATCH: APIRoute = async ({ request, cookies }) => {
	const denied = await requireAdmin(request, cookies);
	if (denied) return denied;
	return Response.json({ links: await readLinkroll("zh-cn") });
};
