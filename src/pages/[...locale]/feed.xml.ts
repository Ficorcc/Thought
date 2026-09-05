import type { APIRoute } from "astro";
import { getRelativeLocaleUrl } from "astro:i18n";
import config from "$config";

export const prerender = false;

/**
 * Legacy feed URL — permanently redirect existing subscribers to /feed
 */
export const GET: APIRoute = async ({ params, url, redirect }) => {
	const { locale: language = config.i18n.defaultLocale } = params;

	return redirect(`${getRelativeLocaleUrl(language, "/feed")}${url.search}`, 301);
};
