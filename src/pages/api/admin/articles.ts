import type { APIRoute } from "astro";
import { requireAdmin } from "$lib/admin/auth";
import { buildTaxonomy, deleteArticle, listArticles, saveArticle, slugify, summarize, suggestTags } from "$lib/admin/content";

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies, url }) => {
	const denied = await requireAdmin(request, cookies);
	if (denied) return denied;
	const articles = await listArticles();
	return Response.json({
		articles,
		taxonomy: buildTaxonomy(articles),
		slug: slugify(url.searchParams.get("title") ?? ""),
		description: summarize(url.searchParams.get("content") ?? ""),
		tags: suggestTags(url.searchParams.get("title") ?? "", url.searchParams.get("content") ?? "")
	});
};

export const POST: APIRoute = async ({ request, cookies }) => {
	const denied = await requireAdmin(request, cookies);
	if (denied) return denied;
	try {
		const article = await saveArticle(await request.json());
		return Response.json({ article });
	} catch (error) {
		return Response.json({ error: error instanceof Error ? error.message : "保存文章失败" }, { status: 400 });
	}
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
	const denied = await requireAdmin(request, cookies);
	if (denied) return denied;
	try {
		const { path } = (await request.json()) as { path: string };
		return Response.json(await deleteArticle(path));
	} catch (error) {
		return Response.json({ error: error instanceof Error ? error.message : "删除文章失败" }, { status: 400 });
	}
};
