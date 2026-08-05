import type { APIRoute } from "astro";
import { requireAdmin } from "$lib/admin/auth";
import { buildTaxonomy, deployStatus, listArticles, listLocales, listPrefaces, readJsonContent, readLinkroll } from "$lib/admin/content";
import { countAdminComments } from "$lib/admin/comments";

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies }) => {
	const denied = await requireAdmin(request, cookies);
	if (denied) return denied;
	const [articles, links, subscriptions, feedItems, prefaces, comments] = await Promise.all([
		listArticles(),
		readLinkroll("zh-cn"),
		readJsonContent("zh-cn/subscriptions.json", []),
		readJsonContent("zh-cn/feed-cache.json", []),
		listPrefaces("zh-cn"),
		countAdminComments()
	]);
	return Response.json({
		articles,
		taxonomy: buildTaxonomy(articles),
		locales: listLocales("note"),
		links,
		subscriptions,
		feedItems,
		prefaces,
		comments,
		deploy: deployStatus()
	});
};
