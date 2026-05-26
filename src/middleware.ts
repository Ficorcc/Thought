import { defineMiddleware } from "astro:middleware";

const PRIMARY_HOST = "linglingtu.com";
const LEGACY_HOST = "thought.ficor.workers.dev";

export const onRequest = defineMiddleware((context, next) => {
	const { hostname, pathname, search } = context.url;

	if (hostname === LEGACY_HOST) {
		return Response.redirect(`https://${PRIMARY_HOST}${pathname}${search}`, 301);
	}

	return next();
});
