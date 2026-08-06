import { env } from "cloudflare:workers";

type AdminGithubEnv = typeof env & Record<string, string | undefined>;

const runtimeEnv = env as AdminGithubEnv;

function envValue(key: string) {
	return runtimeEnv[key]?.trim();
}

function configuredRepo() {
	return envValue("GITHUB_REPO") || "";
}

function configuredBranch() {
	return envValue("GITHUB_BRANCH") || "cloudflare";
}

function configuredRemoteName() {
	return envValue("GITHUB_REMOTE_NAME") || "origin";
}

function configuredRemoteUrl() {
	const repo = configuredRepo();
	return envValue("GITHUB_REMOTE_URL") || (repo ? `https://github.com/${repo}.git` : "");
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
	const repo = configuredRepo();
	const branch = configuredBranch();
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

export function normalizeGithubRepo(input: string) {
	const value = String(input || "").trim();
	if (!value) return "";
	let match = value.match(/^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/);
	if (match) return match[1];
	match = value.match(/^git@github\.com:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/i);
	if (match) return match[1];
	match = value.match(/^ssh:\/\/git@ssh\.github\.com(?::\d+)?\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/i);
	if (match) return match[1];
	match = value.match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i);
	if (match) return match[1];
	throw new Error("GitHub 仓库地址格式不正确。");
}

function refPath(branch: string) {
	return encodeURIComponent(branch).replace(/%2F/g, "/");
}

function commitMessage(input: unknown) {
	const text = String(input || "")
		.trim()
		.replace(/\s+/g, " ")
		.slice(0, 120);
	return text || `Deploy site ${new Date().toISOString()}`;
}

export async function triggerDeployCommit(message: unknown) {
	const config = githubConfig();
	const ref = await github(`/git/ref/heads/${refPath(config.branch)}`);
	const parentSha = ref.object?.sha;
	if (!parentSha) throw new Error("无法读取 GitHub 分支指针。");
	const parent = await github(`/git/commits/${parentSha}`);
	const treeSha = parent.tree?.sha;
	if (!treeSha) throw new Error("无法读取 GitHub 提交树。");
	const commit = await github("/git/commits", {
		method: "POST",
		body: JSON.stringify({
			message: commitMessage(message),
			tree: treeSha,
			parents: [parentSha]
		})
	});
	await github(`/git/refs/heads/${refPath(config.branch)}`, {
		method: "PATCH",
		body: JSON.stringify({
			sha: commit.sha,
			force: false
		})
	});
	return {
		branch: config.branch,
		sha: commit.sha,
		shortSha: String(commit.sha || "").slice(0, 7),
		url: commit.html_url || `https://github.com/${config.repo}/commit/${commit.sha}`
	};
}

export function githubStatus() {
	const tokenConfigured = Boolean(envValue("GITHUB_TOKEN"));
	const repo = configuredRepo();
	return {
		configured: Boolean(tokenConfigured && repo),
		tokenConfigured,
		repo,
		branch: configuredBranch(),
		remoteName: configuredRemoteName(),
		remoteUrl: configuredRemoteUrl()
	};
}
