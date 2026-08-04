declare module "cloudflare:workers" {
	export const env: Env;
	export function waitUntil(promise: Promise<unknown>): void;
}
