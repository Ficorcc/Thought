import { getRelativeLocaleUrl } from "astro:i18n";
import config from "$config";
import i18nit from "$i18n";
import Time from "$lib/time";

export interface FeedPageItem {
	title: string;
	link: string;
	timestamp: Date;
	tags?: string[];
}

const PAGE_SIZE = 10;

/** Escape HTML special characters in plain text */
function escapeHtml(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Render a human-readable subscription page for the feed,
 * served to browsers in place of the raw XML
 * @param options.site Site base URL
 * @param options.language Current locale
 * @param options.items Feed entries, newest first
 * @returns HTML document string
 */
export default function renderFeedPage({ site, language, items }: { site: URL; language: string; items: FeedPageItem[] }): string {
	const t = i18nit(language);

	const homeUrl = new URL(getRelativeLocaleUrl(language, "/"), site).toString();
	const feedUrl = new URL(getRelativeLocaleUrl(language, "/feed"), site).toString();
	const updated = items.length ? Time.toString(items[0].timestamp) : Time.toString();

	const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));

	const list = items
		.map((item, index) => {
			const page = Math.floor(index / PAGE_SIZE) + 1;
			const hidden = page > 1 ? ' style="display:none"' : "";
			const tags = (item.tags ?? []).map(tag => `<span class="posts-tag">#${escapeHtml(tag)}</span>`).join("");

			return `<li class="posts-item" data-feed-page="${page}"${hidden}><div class="posts-item-left"><a class="posts-title" href="${escapeHtml(item.link)}">${escapeHtml(item.title)}</a><time class="posts-date" datetime="${item.timestamp.toISOString()}">${Time.toString(item.timestamp)}</time></div><div class="posts-item-right" aria-label="tags">${tags}</div></li>`;
		})
		.join("");

	const pager =
		pages > 1
			? `<ol class="posts-pager" data-feed-total-page="${pages}"><li class="prev is-disabled" data-feed-nav="prev"><span aria-disabled="true" tabindex="-1" aria-label="${t("feed.page.previous")}"><span class="posts-pager-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg></span></span></li>${Array.from(
					{ length: pages },
					(_, i) => `<li${i === 0 ? ' class="current"' : ""}><a href="#page=${i + 1}" data-feed-page-link="${i + 1}">${i + 1}</a></li>`
				).join(
					""
				)}<li class="next" data-feed-nav="next"><a href="#page=2" data-feed-page-link="2" aria-label="${t("feed.page.next")}"><span class="posts-pager-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></span></a></li></ol>`
			: "";

	const script =
		pages > 1
			? `<script>(function(){var pager=document.querySelector(".posts-pager");if(!pager)return;var items=Array.prototype.slice.call(document.querySelectorAll(".posts-item"));var total=parseInt(pager.getAttribute("data-feed-total-page"),10)||1;var current=1;function show(page){current=Math.min(Math.max(page,1),total);items.forEach(function(item){item.style.display=item.getAttribute("data-feed-page")==String(current)?"":"none"});pager.querySelectorAll("li[data-feed-page-link],li:has(> a[data-feed-page-link])").forEach(function(li){li.classList.remove("current")});pager.querySelectorAll("a[data-feed-page-link]").forEach(function(a){if(a.parentElement&&a.getAttribute("data-feed-page-link")==String(current)&&!a.parentElement.hasAttribute("data-feed-nav"))a.parentElement.classList.add("current")});var prev=pager.querySelector('[data-feed-nav="prev"]');var next=pager.querySelector('[data-feed-nav="next"]');if(prev){prev.classList.toggle("is-disabled",current===1);var p=prev.querySelector("a");if(current===1&&p){var s=document.createElement("span");s.innerHTML=p.innerHTML;prev.replaceChild(s,p)}else if(current>1&&!prev.querySelector("a")){var a=document.createElement("a");a.href="#page="+(current-1);a.setAttribute("data-feed-page-link",String(current-1));a.innerHTML=prev.querySelector("span").innerHTML;prev.replaceChild(a,prev.querySelector("span"))}}if(next){next.classList.toggle("is-disabled",current===total);var n=next.querySelector("a");if(current===total&&n){var s2=document.createElement("span");s2.innerHTML=n.innerHTML;next.replaceChild(s2,n)}else if(current<total&&!next.querySelector("a")){var a2=document.createElement("a");a2.href="#page="+(current+1);a2.setAttribute("data-feed-page-link",String(current+1));a2.innerHTML=next.querySelector("span").innerHTML;next.replaceChild(a2,next.querySelector("span"))}}}pager.addEventListener("click",function(e){var link=e.target.closest?e.target.closest("a[data-feed-page-link]"):null;if(!link)return;e.preventDefault();show(parseInt(link.getAttribute("data-feed-page-link"),10))});var m=location.hash.match(/page=(\\d+)/);if(m)show(parseInt(m[1],10))})();</script>`
			: "";

	return `<!DOCTYPE html>
<html lang="${escapeHtml(language)}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(config.title)} · ${t("feed.page.name")}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/atom+xml" title="${escapeHtml(config.title)}" href="${escapeHtml(feedUrl)}">
<style>
:root{--text:#2a2a28;--muted:#757575;--line:rgba(117,117,117,.22);--bg:#fffffd;--accent:#2a2a28;--pager-line:rgba(42,42,40,.38);--font-serif:"Noto Serif",Georgia,"Times New Roman",serif;--font-mono:"Maple Mono NF CN","Maple Mono",Consolas,Monaco,"Cascadia Code","Courier New",monospace}
[lang="zh-cn"]{--font-serif:"Noto Serif SC","Source Han Serif SC",STSong,"Songti SC",SimSun,serif}
@media (prefers-color-scheme:dark){:root{--text:#dddddb;--muted:#a5a5a5;--line:rgba(165,165,165,.22);--bg:#0e0e0c;--accent:#dddddb;--pager-line:rgba(221,221,219,.34)}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font-serif),var(--font-mono);line-height:1.75}
a{color:inherit;text-decoration:none}
.feed-page{width:clamp(50%,calc(50% + 1176px - 84vw),86%);margin:0 auto;padding:1.1rem .8rem 1.8rem}
.feed-head{margin-bottom:.75rem}
.feed-head h1{margin:0 0 .3rem;font-size:clamp(1.38rem,2.7vw,2rem);line-height:1.25}
.feed-head h1 a{color:var(--text)}
.feed-head h1 a:hover{text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:.12em}
.feed-head p{margin:0;color:var(--muted)}
.feed-note-card{margin:0 0 1rem;padding:0 0 0 .75rem;border-left:2px solid var(--line);background:transparent;border-radius:0}
.feed-note-card p{margin:0;font-size:clamp(.8rem,.95vw,.9rem);line-height:1.56}
.feed-note-title{color:var(--muted);font-size:.76rem;font-weight:600;letter-spacing:.06em}
.feed-note-desc{margin-top:.36rem}
.feed-note-url{margin-top:.4rem;display:flex;flex-wrap:wrap;align-items:center;gap:.35rem .42rem;color:var(--muted)}
.feed-note-url code{display:inline-flex;align-items:center;max-width:min(100%,56ch);padding:.08rem .42rem;border-radius:4px;border:1px solid var(--line);background:transparent;color:var(--muted);font-family:var(--font-mono);font-size:.74rem;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:middle}
.posts-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1.4rem}
.posts-item{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:1.2rem;row-gap:0;align-items:start}
.posts-item-left{display:contents}
.posts-item .posts-title{grid-column:1/2;grid-row:1;min-width:0;justify-self:start;width:fit-content;max-width:100%}
.posts-item .posts-item-right{grid-column:2/3;grid-row:1}
.posts-item .posts-date{grid-column:1/-1;grid-row:2}
.posts-title{display:inline-flex;align-items:center;gap:.36rem;font-size:1.0625rem;line-height:1.42;letter-spacing:.01em;font-weight:400;color:var(--text);overflow-wrap:anywhere;width:fit-content}
.posts-title:hover,.posts-title:focus-visible{text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:.12em}
.posts-date{display:block;margin-top:-.08rem;font-size:.74rem;line-height:1.25;color:var(--muted);letter-spacing:.02em}
.posts-item-right{min-width:0;width:fit-content;max-width:100%;justify-self:end;display:flex;flex-wrap:wrap;align-items:baseline;gap:.6rem;padding-top:.25rem;line-height:1.25;color:var(--muted)}
.posts-tag{font-size:.74rem;line-height:1.25;white-space:nowrap}
.posts-pager{list-style:none;margin:1.1rem 0 .55rem;padding:0;display:flex;align-items:flex-end;justify-content:center;gap:.7rem;flex-wrap:wrap;font-size:.94rem}
.posts-pager li{margin:0;padding:0}
.posts-pager a,.posts-pager span{position:relative;display:inline-flex;align-items:center;justify-content:center;min-width:2rem;height:2rem;padding:0 .28rem .28rem;border:none;border-radius:0;background:transparent;line-height:1;color:var(--muted);text-decoration:none}
.posts-pager a:after,.posts-pager span:after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;background:var(--pager-line)}
.posts-pager li.current a{color:var(--accent)}
.posts-pager li.current a:after{background:var(--accent)}
.posts-pager a:hover,.posts-pager a:focus-visible{color:var(--accent);outline:none}
.posts-pager li.is-disabled span{opacity:.38;cursor:default;user-select:none}
.posts-pager-icon{display:inline-flex;align-items:center;justify-content:center;width:1.05em;height:1.05em}
.posts-pager-icon svg{width:100%;height:100%;display:block}
.feed-foot{margin-top:1.1rem;font-size:.84rem;color:var(--muted)}
.feed-foot p{margin:.22rem 0}
.feed-foot a{text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:.12em}
@media (max-width:640px){.feed-page{width:100%;padding:1rem .6rem 1.35rem}.feed-note-url code{max-width:100%}.posts-item{display:flex;flex-direction:column;gap:.22rem}.posts-item .posts-title,.posts-item .posts-item-right,.posts-item .posts-date{grid-column:auto;grid-row:auto}.posts-item .posts-title{order:1;width:100%}.posts-item .posts-item-right{order:2;justify-self:start;padding-top:0;gap:.35rem .75rem}.posts-item .posts-date{order:3;margin-top:0}.posts-pager{flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;scrollbar-width:none}.posts-pager::-webkit-scrollbar{display:none}}
</style>
</head>
<body>
<main class="feed-page" role="main">
<div class="feed-head">
<h1><a href="${escapeHtml(homeUrl)}">${escapeHtml(config.title)}</a></h1>
<p>${escapeHtml(config.description)}</p>
</div>
<blockquote class="feed-note-card">
<p class="feed-note-title">${t("feed.page.note")}</p>
<p class="feed-note-desc">${t("feed.page.description")}</p>
<p class="feed-note-url">${t("feed.page.url")} <code id="feed-url">${escapeHtml(feedUrl)}</code></p>
</blockquote>
<ul class="posts-list" aria-label="${t("feed.page.articles")}">
${list}
</ul>
${pager}
<footer class="feed-foot">
<p>${t("feed.page.footer", { link: `<a href="${escapeHtml(homeUrl)}">${escapeHtml(config.title)}</a>` })}</p>
<p>${t("feed.page.updated", { time: updated })}</p>
</footer>
</main>
${script}
</body>
</html>`;
}
