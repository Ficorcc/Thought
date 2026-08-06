import { env } from "cloudflare:workers";
import { email as staticEmail, oauth as staticOauth, push as staticPush, turnstile as staticTurnstile } from "$config";

const runtimeEnv = env as typeof env & Record<string, string | undefined>;

function hasStaticProvider(name: string) {
	return staticOauth.some(provider => provider.name === name);
}

export function runtimeOauth() {
	const providers: Array<{ name: string; logo: string }> = [];
	if ((runtimeEnv.GITHUB_CLIENT_ID && runtimeEnv.GITHUB_CLIENT_SECRET) || hasStaticProvider("GitHub")) {
		providers.push({ name: "GitHub", logo: "simple-icons--github" });
	}
	if ((runtimeEnv.GOOGLE_CLIENT_ID && runtimeEnv.GOOGLE_CLIENT_SECRET) || hasStaticProvider("Google")) {
		providers.push({ name: "Google", logo: "simple-icons--google" });
	}
	return providers;
}

export function runtimeTurnstile() {
	return runtimeEnv.CLOUDFLARE_TURNSTILE_SITE_KEY || staticTurnstile || undefined;
}

export function runtimePush() {
	return runtimeEnv.VAPID_PUBLIC_KEY || staticPush || undefined;
}

export function runtimeEmail() {
	return Boolean(runtimeEnv.EMAIL_FROM || staticEmail);
}

export function runtimeCommentConfig() {
	return {
		oauth: runtimeOauth(),
		turnstile: runtimeTurnstile(),
		push: runtimePush(),
		email: runtimeEmail()
	};
}
