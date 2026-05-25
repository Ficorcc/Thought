import type { APIRoute } from "astro";
import { generateCodeVerifier } from "arctic";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { OAuth, type OAuthAccount } from "$lib/oauth";
import { AESEncryption, random, Token } from "$lib/token";
import { Drifter, Email } from "$db/schema";

export const prerender = false;

type OAuthState = {
	codeVerifier: string;
	referrer: string;
	expires: number;
};

function encodeState(state: OAuthState) {
	const encrypted = AESEncryption.encrypt(new TextEncoder().encode(JSON.stringify(state)));
	if (!encrypted) throw new Error("Failed to encrypt OAuth state");
	return Buffer.from(encrypted).toString("base64url");
}

function decodeState(state: string | null): OAuthState | null {
	if (!state) return null;

	try {
		const decrypted = AESEncryption.decrypt(Buffer.from(state, "base64url"));
		if (!decrypted) return null;

		const result = JSON.parse(new TextDecoder().decode(decrypted)) as OAuthState;
		if (result.expires < Date.now()) return null;

		return result;
	} catch (_) {
		return null;
	}
}

export const GET: APIRoute = async ({ cookies, params, url, locals, redirect, request }) => {
	const { provider } = params;

	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	const errorStatus = url.searchParams.get("error");

	// Prefer stateless encrypted OAuth state; fall back to the legacy escort
	// cookie so in-flight login attempts from an older deployment still work.
	const escort = decodeState(state) ?? (await Token.check(cookies, "escort", false));
	await Token.revoke("escort", cookies);

	if (code) {
		// Validate state parameter to prevent CSRF attacks
		if (!escort || ("state" in escort && escort.state !== state)) return new Response("Unauthorized", { status: 401 });

		// Exchange authorization code for user account information
		const user: OAuthAccount = await new OAuth(provider).validate(code, escort.codeVerifier);

		const db = drizzle(locals.runtime.env.DB);
		// Insert or update user account in database with conflict resolution
		const drifter = await db
			.insert(Drifter)
			.values({
				id: random(16),
				provider: user.provider,
				account: user.account,
				refresh: user.refresh,
				access: user.access,
				expire: user.expire?.getTime(),
				handle: user.handle,
				name: user.name,
				description: user.description,
				image: user.image
			})
			.onConflictDoUpdate({
				// Update existing user if provider+account combination exists
				target: [Drifter.provider, Drifter.account],
				set: {
					access: sql`excluded.access`,
					expire: sql`excluded.expire`,
					handle: sql`excluded.handle`,
					name: sql`excluded.name`,
					description: sql`excluded.description`,
					image: sql`excluded.image`
				}
			})
			.returning({ id: Drifter.id })
			.get();

		// If email is available from OAuth provider, insert into Email table
		if (user.email) {
			await db.insert(Email).values({ drifter: drifter.id, address: user.email, state: "verified" }).onConflictDoNothing();
		}

		// Issue passport token with user visa for authentication
		await Token.issue(cookies, "passport", { visa: drifter.id });

		// Redirect to original page or home after successful authentication
		return redirect(escort.referrer ?? "/", 302);
	} else if (errorStatus) {
		// Handle OAuth errors from provider
		switch (errorStatus) {
			case "access_denied":
				// User denied access, redirect back to referrer
				return redirect(escort?.referrer ?? "/", 302);

			case "redirect_uri_mismatch":
			case "application_suspended":
				// OAuth configuration errors
				return new Response("Internal Server Error", { status: 500 });

			default:
				// Other OAuth errors
				return new Response("Unauthorized", { status: 401 });
		}
	} else {
		// Initialize OAuth flow with PKCE parameters
		const codeVerifier = generateCodeVerifier();
		const state = encodeState({ codeVerifier, referrer: request.headers.get("referer") ?? "/", expires: Date.now() + 5 * 60 * 1000 });

		// Store OAuth state and referrer in escort token as a temporary
		// compatibility fallback for browsers that already started a flow.
		await Token.issue(cookies, "escort", { state, codeVerifier, referrer: request.headers.get("referer") ?? "/" }, "5 minutes");

		// Generate OAuth authorization URL and redirect user
		const link: URL = new OAuth(provider).url(state, codeVerifier);
		return redirect(link.toString(), 302);
	}
};
