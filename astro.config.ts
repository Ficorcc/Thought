// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import yaml from "@rollup/plugin-yaml";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import svelte from "@astrojs/svelte";
import tailwindcss from "@tailwindcss/vite";

import GFM from "remark-gfm";
import ins from "remark-ins";
import mark from "remark-flexible-markers";
import spoiler from "@tuyuritio/remark-spoiler";
import CJK from "remark-cjk-friendly";
import CJKStrikethrough from "remark-cjk-friendly-gfm-strikethrough";
import ruby from "@tuyuritio/remark-ruby";
import attr from "@tuyuritio/remark-attribute";
import math from "remark-math";
import gemoji from "remark-gemoji";
import footnote from "remark-footnotes-extra";
import abbr from "@tuyuritio/remark-abbreviation";
import { remarkExtendedTable as table, extendedTableHandlers as tableHandler } from "remark-extended-table";
import alerts from "@tuyuritio/remark-github-alert";
import { rehypeHeadingIds as ids, unified } from "@astrojs/markdown-remark";
import anchor from "rehype-autolink-headings";
import links from "rehype-external-links";
import katex from "rehype-katex";
import figure from "@tuyuritio/rehype-image-figure";
import wrapper from "@tuyuritio/rehype-table-wrapper";
import sectionize from "@hbsnow/rehype-sectionize";
import copy from "@tuyuritio/shiki-code-copy";

import reading from "./src/lib/reading";

import siteConfig from "./site.config";

const site = process.env.SITE ?? "https://panjinye.com";

// https://astro.build/config
export default defineConfig({
	adapter: cloudflare({
		inspectorPort: false,
		imageService: "compile",
		prerenderEnvironment: "node"
	}),
	site,
	trailingSlash: "never",
	i18n: {
		...siteConfig.i18n,
		routing: {
			redirectToDefaultLocale: false,
			prefixDefaultLocale: false
		}
	},
	markdown: {
		processor: unified({
			remarkPlugins: [
				[GFM, { singleTilde: false }],
				ins,
				mark,
				spoiler,
				CJK,
				[CJKStrikethrough, { singleTilde: false }],
				ruby,
				attr,
				math,
				gemoji,
				footnote,
				abbr,
				[table, { colspanWithEmpty: true }],
				[alerts, { typeFormat: "capitalize" }],
				reading
			],
			remarkRehype: {
				footnoteLabel: null,
				footnoteLabelTagName: "p",
				footnoteLabelProperties: {
					className: ["hidden"]
				},
				handlers: {
					...tableHandler
				}
			},
			rehypePlugins: [
				ids,
				[anchor, { behavior: "wrap" }],
				[links, { target: "_blank", rel: ["nofollow", "noopener", "noreferrer"] }],
				katex,
				figure,
				wrapper,
				sectionize
			],
			smartypants: false
		}),
		shikiConfig: {
			themes: {
				light: "github-light",
				dark: "dark-plus"
			},
			transformers: [copy({ duration: 1500 })]
		}
	},
	vite: {
		plugins: [yaml(), tailwindcss()],
		optimizeDeps: {
			exclude: [
				"@astrojs/cloudflare/entrypoints/server",
				"astro/actions/runtime/entrypoints/client.js",
				"astro/actions/runtime/entrypoints/route.js",
				"astro/actions/runtime/entrypoints/server.js",
				"astro/env/runtime",
				"arctic",
				"drizzle-orm",
				"drizzle-orm/d1",
				"drizzle-orm/sqlite-core"
			]
		},
		ssr: {
			optimizeDeps: {
				exclude: [
					"@astrojs/cloudflare/entrypoints/server",
					"astro/actions/runtime/entrypoints/client.js",
					"astro/actions/runtime/entrypoints/route.js",
					"astro/actions/runtime/entrypoints/server.js",
					// Lazily discovered on demand - prebundling them mid-session
					// rewrites deps_ssr and breaks the running workerd process
					"astro/container",
					"@block65/webcrypto-web-push",
					"astro/env/runtime",
					"arctic",
					"drizzle-orm",
					"drizzle-orm/d1",
					"drizzle-orm/sqlite-core"
				]
			}
		}
	},
	integrations: [svelte(), mdx(), sitemap()]
});
