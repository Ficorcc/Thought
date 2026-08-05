import type { APIRoute } from "astro";
import { requireAdmin } from "$lib/admin/auth";

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies }) => {
	const denied = await requireAdmin(request, cookies);
	if (denied) return denied;
	return Response.json({
		siteUrl: "",
		apiUrl: "",
		memos: [],
		error: "线上后台暂未启用 Memos API。"
	});
};

export const POST: APIRoute = async ({ request, cookies }) => {
	const denied = await requireAdmin(request, cookies);
	if (denied) return denied;
	return Response.json({ error: "线上后台暂未启用 Memos 发布。" }, { status: 400 });
};
