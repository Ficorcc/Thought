import type { APIRoute } from "astro";
import { requireAdmin } from "$lib/admin/auth";
import { fetchMemos } from "$lib/admin/memos";

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies }) => {
	const denied = await requireAdmin(request, cookies);
	if (denied) return denied;
	try {
		return Response.json(await fetchMemos());
	} catch (error) {
		return Response.json({ error: error instanceof Error ? error.message : "读取 Memos 失败" }, { status: 502 });
	}
};

export const POST: APIRoute = async ({ request, cookies }) => {
	const denied = await requireAdmin(request, cookies);
	if (denied) return denied;
	return Response.json({ error: "线上后台仅启用 Memos 只读刷新，未启用发布。" }, { status: 405 });
};
