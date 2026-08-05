import type { APIRoute } from "astro";
import { requireAdmin } from "$lib/admin/auth";
import { deployStatus } from "$lib/admin/content";

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies }) => {
	const denied = await requireAdmin(request, cookies);
	if (denied) return denied;
	return Response.json(deployStatus());
};

export const POST: APIRoute = async ({ request, cookies }) => {
	const denied = await requireAdmin(request, cookies);
	if (denied) return denied;
	return Response.json({
		ok: false,
		log: "Cloudflare 线上后台不执行本地 git/pnpm/wrangler 命令。内容保存通过 GitHub API 提交；如需启用，请配置 GITHUB_TOKEN、GITHUB_REPO 和 GITHUB_BRANCH。"
	});
};
