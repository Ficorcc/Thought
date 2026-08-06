import type { APIRoute } from "astro";
import { requireAdmin } from "$lib/admin/auth";
import { deployStatus } from "$lib/admin/content";
import { normalizeGithubRepo, triggerDeployCommit } from "$lib/admin/github";

export const prerender = false;

function isConfigured(status: ReturnType<typeof deployStatus>) {
	return Boolean(status.tokenConfigured && status.remotes && status.remotes !== "未配置");
}

function repoFromStatus(status: ReturnType<typeof deployStatus>) {
	return status.remotes && status.remotes !== "未配置" ? normalizeGithubRepo(status.remotes) : "";
}

function baseLog(status: ReturnType<typeof deployStatus>) {
	return [
		isConfigured(status) ? "GitHub 内容写入已配置。" : "GitHub 内容写入未配置。",
		`remote: ${status.remoteName || "origin"}`,
		`仓库: ${status.remotes || "未配置"}`,
		`地址: ${status.remoteUrl || "未配置"}`,
		`分支: ${status.branch || "未配置"}`
	];
}

async function jsonBody(request: Request) {
	try {
		return (await request.json()) as Record<string, unknown>;
	} catch {
		return {};
	}
}

function text(value: unknown) {
	return String(value || "").trim();
}

async function bindRemote(body: Record<string, unknown>) {
	const status = deployStatus();
	const remoteName = text(body.remoteName) || status.remoteName || "origin";
	const requestedUrl = text(body.remoteUrl) || status.remoteUrl || status.remotes;
	const requestedRepo = requestedUrl && requestedUrl !== "未配置" ? normalizeGithubRepo(requestedUrl) : "";
	const configuredRepo = repoFromStatus(status);
	const ok = isConfigured(status) && Boolean(configuredRepo) && (!requestedRepo || requestedRepo.toLowerCase() === configuredRepo.toLowerCase());
	return Response.json({
		...status,
		remoteName,
		remoteUrl: requestedUrl || status.remoteUrl,
		ok,
		status: ok ? "GitHub 仓库链接已绑定" : status.status,
		log: ok
			? [
					"GitHub 仓库链接已绑定。",
					`remote: ${remoteName}`,
					`仓库: ${configuredRepo}`,
					`地址: ${requestedUrl || status.remoteUrl}`,
					`分支: ${status.branch}`,
					"",
					"线上后台将通过 GitHub API 写入并提交到该分支。"
				].join("\n")
			: [
					"GitHub 仓库链接未完成。",
					...baseLog(status),
					requestedRepo && configuredRepo && requestedRepo.toLowerCase() !== configuredRepo.toLowerCase()
						? `表单仓库 ${requestedRepo} 与 Cloudflare 变量 GITHUB_REPO=${configuredRepo} 不一致。`
						: "请在 Cloudflare Worker 中配置 GITHUB_TOKEN、GITHUB_REPO 和 GITHUB_BRANCH。"
				].join("\n")
	});
}

async function publish(body: Record<string, unknown>) {
	const status = deployStatus();
	if (!isConfigured(status)) {
		return Response.json({
			...status,
			ok: false,
			log: ["发布失败：GitHub 内容写入未配置。", ...baseLog(status), "", "请先配置 GITHUB_TOKEN、GITHUB_REPO 和 GITHUB_BRANCH。"].join("\n")
		});
	}
	const requestedBranch = text(body.branch);
	if (requestedBranch && requestedBranch !== status.branch) {
		return Response.json({
			...status,
			ok: false,
			log: [
				"发布失败：表单分支与线上配置不一致。",
				...baseLog(status),
				`表单分支: ${requestedBranch}`,
				"",
				"Cloudflare 线上后台使用 GITHUB_BRANCH 指定的分支，不能在请求里临时切换。"
			].join("\n")
		});
	}
	try {
		const commit = await triggerDeployCommit(body.message);
		const nextStatus = deployStatus();
		return Response.json({
			...nextStatus,
			ok: true,
			commit,
			status: "已提交 GitHub，等待 Cloudflare 自动部署",
			log: [
				"部署流程已触发。",
				`remote: ${nextStatus.remoteName || "origin"}`,
				`仓库: ${nextStatus.remotes}`,
				`分支: ${commit.branch}`,
				`提交: ${commit.shortSha}`,
				`链接: ${commit.url}`,
				"",
				"流程：",
				"1. 后台配置检查完成。",
				"2. 已通过 GitHub API 创建部署触发提交。",
				"3. 已将分支指针推送到 GitHub。",
				"4. Cloudflare 将从 GitHub 自动构建并部署。",
				"",
				"说明：Cloudflare 线上后台不会执行本地 git/pnpm/wrangler 命令；实际构建由 Cloudflare 在 GitHub 提交后完成。"
			].join("\n")
		});
	} catch (error) {
		return Response.json({
			...status,
			ok: false,
			log: ["发布失败。", ...baseLog(status), "", error instanceof Error ? error.message : "未知错误"].join("\n")
		});
	}
}

export const GET: APIRoute = async ({ request, cookies }) => {
	const denied = await requireAdmin(request, cookies);
	if (denied) return denied;
	return Response.json(deployStatus());
};

export const POST: APIRoute = async ({ request, cookies }) => {
	const denied = await requireAdmin(request, cookies);
	if (denied) return denied;
	const body = await jsonBody(request);
	const action = text(body.action);
	if (action === "remote") return bindRemote(body);
	if (action === "publish") return publish(body);
	const status = deployStatus();
	return Response.json({
		...status,
		ok: isConfigured(status),
		log: baseLog(status).join("\n")
	});
};
