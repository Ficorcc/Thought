import type { APIRoute } from "astro";
import { requireAdmin } from "$lib/admin/auth";
import { deleteAdminComment, listAdminCommentHistory, listAdminComments, purgeAdminComment, restoreAdminComment } from "$lib/admin/comments";

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies, url }) => {
	const denied = await requireAdmin(request, cookies);
	if (denied) return denied;
	const history = url.searchParams.get("history");
	if (history) return Response.json({ source: "site", history: await listAdminCommentHistory(history) });
	const locale = url.searchParams.get("locale") || "zh-cn";
	const keyword = url.searchParams.get("keyword") || undefined;
	const section = (url.searchParams.get("section") || "all") as any;
	const state = (url.searchParams.get("state") || "all") as any;
	return Response.json({ source: "site", ...(await listAdminComments(locale, keyword, section, state)) });
};

export const POST: APIRoute = async ({ request, cookies }) => {
	const denied = await requireAdmin(request, cookies);
	if (denied) return denied;
	try {
		const input = (await request.json()) as { id?: string; action?: "delete" | "restore" | "purge"; locale?: string };
		if (!input.id) return Response.json({ error: "Missing comment id." }, { status: 400 });
		if (input.action === "purge") await purgeAdminComment(input.id);
		else if (input.action === "restore") await restoreAdminComment(input.id);
		else await deleteAdminComment(input.id);
		return Response.json({ source: "site", ...(await listAdminComments(input.locale || "zh-cn")) });
	} catch (error) {
		return Response.json({ error: error instanceof Error ? error.message : "评论操作失败" }, { status: 400 });
	}
};

export const DELETE = POST;
