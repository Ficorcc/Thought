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
	const status = deployStatus();
	const configured = Boolean(status.tokenConfigured && status.remotes && status.remotes !== "未配置");
	return Response.json({
		...status,
		ok: configured,
		log: configured
			? [
					"GitHub 内容写入已配置。",
					`仓库: ${status.remotes || "未配置"}`,
					`分支: ${status.branch || "未配置"}`,
					"",
					"Cloudflare 线上后台不执行本地 git/pnpm/wrangler 命令。",
					"文章、序文、友链、订阅等内容保存时会通过 GitHub API 直接提交到仓库，并由 Cloudflare 自动部署。"
				].join("\n")
			: ["GitHub 内容写入未配置。", `仓库: ${status.remotes || "未配置"}`, `分支: ${status.branch || "未配置"}`, "", status.status].join("\n")
	});
};
