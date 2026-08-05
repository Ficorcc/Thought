import type { APIRoute } from "astro";
import { requireAdmin } from "$lib/admin/auth";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
	const denied = await requireAdmin(request, cookies);
	if (denied) return denied;
	try {
		const { url: input } = (await request.json()) as { url?: string };
		if (!input) return Response.json({ error: "url is required" }, { status: 400 });
		const url = new URL(input.startsWith("http") ? input : `https://${input}`);
		return Response.json({
			site: {
				title: url.hostname.replace(/^www\./, ""),
				url: url.toString(),
				type: "lifestyle",
				image: `${url.origin}/favicon.ico`,
				description: "",
				feed: `${url.origin}/feed.xml`,
				status: 0
			}
		});
	} catch {
		return Response.json({ error: "网址格式不正确" }, { status: 400 });
	}
};
