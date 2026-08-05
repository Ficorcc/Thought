import type { APIRoute } from "astro";
import { adminGithubUrl, adminSession, verifyAdminSecret } from "$lib/admin/auth";

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies }) => {
	const session = await adminSession(request, cookies);
	return Response.json({ ...session, githubUrl: adminGithubUrl("/admin") });
};

export const POST: APIRoute = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as { secret?: string };
	if (!verifyAdminSecret(body.secret)) return Response.json({ error: "Admin secret is invalid." }, { status: 401 });
	return Response.json({ authorized: true, method: "password" });
};
