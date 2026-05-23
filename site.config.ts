import siteConfig, { providers } from "./src/lib/config";

const env = import.meta.env ?? {};

const config = siteConfig({
	title: "Ficor's Blog",
	prologue: "在路上的思绪与脚印",
	author: {
		name: "Ficor",
		email: "ficor@qq.com",
		link: "https://thought.ficor.workers.dev"
	},
	description: "在路上的思绪与脚印",
	copyright: {
		type: "CC BY-NC-ND 4.0",
		year: "2026"
	},
	timezone: "Asia/Shanghai",
	i18n: {
		locales: ["en", "zh-cn"],
		defaultLocale: "zh-cn"
	},
	pagination: {
		note: 10,
		jotting: 24
	},
	heatmap: {
		unit: "day",
		weeks: 20
	},
	feed: {
		section: "*",
		limit: 20
	},
	comment: {
		"max-length": 500,
		"hide-deleted": true,
		history: true
	},
	latest: "*"
});

const monolocale = Number(config.i18n.locales.length) === 1;

const turnstile = env.CLOUDFLARE_TURNSTILE_SECRET_KEY ? env.CLOUDFLARE_TURNSTILE_SITE_KEY : undefined;

const push = env.VAPID_PRIVATE_KEY ? env.VAPID_PUBLIC_KEY : undefined;

const email = Boolean(env.EMAIL_FROM);

const oauth = providers([
	{ name: "GitHub", logo: "simple-icons--github", clientID: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET },
	{ name: "Google", logo: "simple-icons--google", clientID: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
]);

export { turnstile, oauth, monolocale, push, email };

export default config;
