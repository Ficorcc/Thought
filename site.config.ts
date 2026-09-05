import siteConfig, { providers } from "./src/lib/config";

const env = { ...(typeof process === "undefined" ? {} : (process.env ?? {})), ...(import.meta.env ?? {}) };

const config = siteConfig({
	title: "Ficor's Blog",
	prologue: "一个重新站起来，准备出发的人\nDo one Thing at a Time，and Do Well.",
	author: {
		name: "Ficor",
		email: "ficor@qq.com",
		link: "https://panjinye.com"
	},
	description: "在路上的思绪与脚印",
	copyright: {
		type: "CC BY-NC-ND 4.0",
		year: "2008"
	},
	timezone: "Asia/Shanghai",
	i18n: {
		locales: ["en", "zh-cn"],
		defaultLocale: "zh-cn"
	},
	pagination: {
		note: 16,
		guide: 16,
		jotting: 24
	},
	header: {
		launcher: {
			label: {
				en: "Quick links",
				"zh-cn": "快捷入口"
			},
			icon: "lucide--rocket",
			links: [
				{
					label: "BLOGS·CN",
					url: "https://blogscn.fun/random.html"
				},
				{
					label: { en: "Blog Quest", "zh-cn": "空间穿梭" },
					url: "https://blogs.quest"
				},
				{
					label: { en: "Forever Blog", "zh-cn": "十年之约" },
					url: "https://www.foreverblog.cn/go.html"
				},
				{
					label: { en: "Travellings", "zh-cn": "开往" },
					url: "https://www.travellings.cn/go.html"
				},
				{
					label: { en: "Store Web", "zh-cn": "个站商店" },
					url: "https://storeweb.cn/s/2456"
				},
				{
					label: { en: "Blog Inc", "zh-cn": "博客集" },
					url: "https://bloginc.cn/"
				}
			]
		}
	},
	footer: {
		socials: [
			{ label: "GitHub", icon: "simple-icons--github", url: "https://github.com/Ficorcc" },
			{ label: "Mastodon", icon: "simple-icons--mastodon", url: "https://mastodon.social/@ficor" },
			{ label: "Email", icon: "lucide--mail", url: "mailto:ficor@qq.com" },
			{ label: "316160777", icon: "simple-icons--qq", url: "https://qm.qq.com/" },
			{ label: "ficorcc", icon: "simple-icons--wechat", url: "weixin://" }
		]
	},
	home: {
		widgets: ["latest", "heatmap"]
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
	latest: {
		sections: "*",
		limit: 2
	}
});

const monolocale = Number(config.i18n.locales.length) === 1;

const TEST_TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
const turnstile = env.DEV ? TEST_TURNSTILE_SITE_KEY : env.CLOUDFLARE_TURNSTILE_SITE_KEY;

const push = env.VAPID_PUBLIC_KEY;

const email = Boolean(env.EMAIL_FROM);

const oauth = providers([
	{ name: "GitHub", logo: "simple-icons--github", enabled: Boolean(env.GITHUB_CLIENT_ID) },
	{ name: "Google", logo: "simple-icons--google", enabled: Boolean(env.GOOGLE_CLIENT_ID) }
]);

export { turnstile, oauth, monolocale, push, email };

export default config;
