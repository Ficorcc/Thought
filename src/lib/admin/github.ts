import { env } from "cloudflare:workers";

type AdminGithubEnv = typeof env & Record<string, string | undefined>;

const runtimeEnv = env as AdminGithubEnv;

function envValue(key: string) {
	return runtimeEnv[key]?.trim();
}
const allowedRoots = ["src/content/note/", "src/content/guide/", "src/content/jotting/", "src/content/preface/", "src/content/information/"];

export function safeRepoPath(input: string) {
	const path = String(input || "")
		.replace(/\\/g, "/")
		.replace(/^\/+/, "");
	if (!path || path.includes("\0")) throw new Error("Invalid path.");
	if (path.split("/").some(part => part === ".." || part === "")) throw new Error("Path escapes repository root.");
	if (!allowedRoots.some(root => path.startsWith(root))) throw new Error("Path is not allowed for admin writes.");
	return path;
}

function githubConfig() {
	const token = envValue("GITHUB_TOKEN");
	const repo = envValue("GITHUB_REPO");
	const branch = envValue("GITHUB_BRANCH") || "cloudflare";
	if (!token || !repo) throw new Error("GitHub 内容写入未配置：需要 GITHUB_TOKEN 和 GITHUB_REPO。");
	return { token, repo, branch };
}

async function github(path: string, init: RequestInit = {}) {
	const config = githubConfig();
	const headers = new Headers(init.headers);
	headers.set("Accept", "application/vnd.github+json");
	headers.set("Authorization", `Bearer ${config.token}`);
	headers.set("Content-Type", "application/json");
	headers.set("User-Agent", "ThoughtAdmin/1.0");
	headers.set("X-GitHub-Api-Version", "2022-11-28");
	const response = await fetch(`https://api.github.com/repos/${config.repo}${path}`, {
		...init,
		headers
	});
	const text = await response.text();
	let data: any = {};
	try {
		data = text ? JSON.parse(text) : {};
	} catch {
		data = { message: text };
	}
	if (!response.ok) throw new Error(data.message || `GitHub API ${response.status}`);
	return data;
}

async function currentFile(path: string) {
	const config = githubConfig();
	try {
		return await github(`/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${encodeURIComponent(config.branch)}`);
	} catch (error) {
		if (error instanceof Error && /Not Found/i.test(error.message)) return null;
		throw error;
	}
}

function encodeBase64(content: string) {
	return Buffer.from(content, "utf-8").toString("base64");
}

export async function writeRepoFile(pathInput: string, content: string, message: string) {
	const path = safeRepoPath(pathInput);
	const config = githubConfig();
	const current = await currentFile(path);
	await github(`/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}`, {
		method: "PUT",
		body: JSON.stringify({
			message,
			content: encodeBase64(content),
			branch: config.branch,
			sha: current?.sha
		})
	});
	return { path, branch: config.branch };
}

export async function deleteRepoFile(pathInput: string, message: string) {
	const path = safeRepoPath(pathInput);
	const config = githubConfig();
	const current = await currentFile(path);
	if (!current?.sha) throw new Error("File not found in GitHub repository.");
	await github(`/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}`, {
		method: "DELETE",
		body: JSON.stringify({
			message,
			branch: config.branch,
			sha: current.sha
		})
	});
	return { path, branch: config.branch };
}

export function githubStatus() {
	const tokenConfigured = Boolean(envValue("GITHUB_TOKEN"));
	const repo = envValue("GITHUB_REPO") || "";
	return {
		configured: Boolean(tokenConfigured && repo),
		tokenConfigured,
		repo,
		branch: envValue("GITHUB_BRANCH") || "cloudflare"
	};
}
