import type { AstroCookies } from "astro";
import { site } from "astro:config/server";
import { env } from "cloudflare:workers";
import { oauth } from "$config";
import { Token } from "$lib/token";

type AdminRuntimeEnv = typeof env & Record<string, string | undefined>;

const runtimeEnv = env as AdminRuntimeEnv;

function envValue(key: string) {
	return runtimeEnv[key]?.trim();
}

export function adminGithubUrl(referrer = "/admin") {
	const provider = oauth.find(item => item.name === "GitHub") ?? oauth[0];
	if (!provider) return "";
	const base = new URL("/@/reach/", site ?? "https://panjinye.com");
	return `${new URL(provider.name, base).toString()}?referrer=${encodeURIComponent(referrer)}`;
}

export async function adminSession(request: Request, cookies: AstroCookies) {
	const configured = envValue("ADMIN_SECRET");
	const provided = request.headers.get("x-admin-secret")?.trim();
	if (configured && provided && provided === configured) return { authorized: true, method: "password" };

	const authorId = env.AUTHOR_ID ?? null;
	const passport = await Token.check(cookies, "passport", false);
	if (authorId && passport?.visa === authorId) return { authorized: true, method: "github" };

	return { authorized: false, method: "" };
}

export async function requireAdmin(request: Request, cookies: AstroCookies) {
	const session = await adminSession(request, cookies);
	if (session.authorized) return null;
	return Response.json({ error: "Admin authorization required." }, { status: 401 });
}

export function verifyAdminSecret(secret?: string) {
	const configured = envValue("ADMIN_SECRET");
	return Boolean(configured && secret?.trim() === configured);
}
