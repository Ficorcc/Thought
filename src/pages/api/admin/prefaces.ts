import type { APIRoute } from "astro";
import { requireAdmin } from "$lib/admin/auth";
import { deletePreface, listPrefaces, savePreface } from "$lib/admin/content";

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies, url }) => {
	const denied = await requireAdmin(request, cookies);
	if (denied) return denied;
	return Response.json({ prefaces: await listPrefaces(url.searchParams.get("locale") || "zh-cn") });
};

export const POST: APIRoute = async ({ request, cookies }) => {
	const denied = await requireAdmin(request, cookies);
	if (denied) return denied;
	try {
		return Response.json({ preface: await savePreface(await request.json()) });
	} catch (error) {
		return Response.json({ error: error instanceof Error ? error.message : "保存序文失败" }, { status: 400 });
	}
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
	const denied = await requireAdmin(request, cookies);
	if (denied) return denied;
	try {
		const { path } = (await request.json()) as { path: string };
		return Response.json(await deletePreface(path));
	} catch (error) {
		return Response.json({ error: error instanceof Error ? error.message : "删除序文失败" }, { status: 400 });
	}
};
