const state = {
	articles: [],
	links: [],
	subscriptions: [],
	feedItems: [],
	memos: [],
	prefaces: [],
	commentItems: [],
	commentSource: "local",
	taxonomy: { directories: [], series: [], tags: [] },
	comments: 0,
	deploy: {},
	selectedArticle: null,
	selectedLink: null,
	selectedPreface: null,
	selectedComment: null,
	articlePage: 1,
	locale: localStorage.getItem("thought-admin-locale") || "zh-cn",
	theme: localStorage.getItem("thought-admin-theme") || "light"
};

const ARTICLE_PAGE_SIZE = 16;
const SITE_URL = "https://panjinye.com";
const ADMIN_SECRET_STORAGE_KEY = "thought-admin-secret";
let adminSecretResolver = null;
let adminAuthorized = false;
let adminSessionPromise = null;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function toast(message) {
	const node = $("#toast");
	node.textContent = message;
	node.classList.add("show");
	window.setTimeout(() => node.classList.remove("show"), 2600);
}

async function adminSession(force = false) {
	if (adminSessionPromise && !force) return adminSessionPromise;
	adminSessionPromise = fetch("/api/admin/session", { credentials: "same-origin" })
		.then(response => response.json())
		.catch(() => ({ authorized: false }));
	const session = await adminSessionPromise;
	adminAuthorized = Boolean(session.authorized);
	const github = $("#admin-github-login");
	if (github && session.githubUrl) github.href = session.githubUrl;
	return session;
}

async function adminSecret(force = false) {
	await adminSession(force);
	if (adminAuthorized) return "";
	const secret = force ? "" : localStorage.getItem(ADMIN_SECRET_STORAGE_KEY) || "";
	if (secret) return secret;
	$("#admin-auth").classList.add("show");
	$("#admin-auth").setAttribute("aria-hidden", "false");
	$("#admin-secret-input").value = "";
	window.setTimeout(() => $("#admin-secret-input").focus(), 0);
	return new Promise(resolve => {
		adminSecretResolver = resolve;
	});
}

async function api(path, options = {}, retried = false) {
	const secret = await adminSecret();
	if (!secret && !adminAuthorized) throw new Error("需要后台访问密钥");
	const response = await fetch(path, {
		...options,
		credentials: "same-origin",
		headers: {
			"Content-Type": "application/json",
			...(secret ? { "X-Admin-Secret": secret } : {}),
			...(options.headers || {})
		}
	});
	if (response.status === 401 && !retried) {
		localStorage.removeItem(ADMIN_SECRET_STORAGE_KEY);
		adminAuthorized = false;
		adminSessionPromise = null;
		await adminSecret(true);
		return api(path, options, true);
	}
	const text = await response.text();
	let data = {};
	try {
		data = text ? JSON.parse(text) : {};
	} catch {
		data = {
			error: text
				.replace(/<[^>]+>/g, " ")
				.replace(/\s+/g, " ")
				.trim()
		};
	}
	if (!response.ok) throw new Error(data.error || response.statusText);
	return data;
}

function formData(form) {
	const data = Object.fromEntries(new FormData(form).entries());
	for (const checkbox of form.querySelectorAll("input[type=checkbox]")) data[checkbox.name] = checkbox.checked;
	return data;
}

function setForm(form, data) {
	for (const element of form.elements) {
		if (!element.name) continue;
		if (element.type === "checkbox") element.checked = Boolean(data[element.name]);
		else element.value = Array.isArray(data[element.name]) ? data[element.name].join(", ") : (data[element.name] ?? "");
	}
}

function splitTags(value) {
	return String(value || "")
		.split(/[,，]/)
		.map(item => item.trim())
		.filter(Boolean);
}

function escapeHtml(value) {
	return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function renderMarkdown(markdown) {
	const blocks = escapeHtml(markdown || "")
		.replace(/^### (.*)$/gm, "<h3>$1</h3>")
		.replace(/^## (.*)$/gm, "<h2>$1</h2>")
		.replace(/^# (.*)$/gm, "<h1>$1</h1>")
		.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
		.replace(/`([^`]+)`/g, "<code>$1</code>")
		.replace(/!\[([^\]]*)]\(([^)]+)\)/g, '<img alt="$1" src="$2" />')
		.replace(/\[([^\]]+)]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
	return blocks
		.split(/\n{2,}/)
		.map(block => (block.startsWith("<h") || block.startsWith("<img") ? block : `<p>${block.replace(/\n/g, "<br />")}</p>`))
		.join("");
}

function slugify(text) {
	return String(text || "")
		.toLowerCase()
		.normalize("NFKC")
		.replace(/[^\p{L}\p{N}\s-]+/gu, "")
		.trim()
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function timestampNow() {
	const date = new Date();
	const offsetMinutes = -date.getTimezoneOffset();
	const sign = offsetMinutes >= 0 ? "+" : "-";
	const absolute = Math.abs(offsetMinutes);
	const offset = `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
	const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000).toISOString().slice(0, 19);
	return `${local}${offset}`;
}

function dateOnly(value) {
	if (!value) return "";
	const parsed = new Date(value);
	if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
	return String(value).slice(0, 10);
}

function dateTime(value) {
	if (!value) return "";
	const parsed = new Date(value);
	if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 16).replace("T", " ");
	return String(value).slice(0, 16);
}

function dateMs(value) {
	if (!value) return 0;
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function currentArticles() {
	return state.articles.filter(article => article.locale === state.locale);
}

function currentPrefaces() {
	return state.prefaces.filter(preface => preface.locale === state.locale);
}

function buildTaxonomyFor(articles) {
	const series = new Set();
	const tags = new Set();
	for (const article of articles) {
		if (article.series) series.add(article.series);
		for (const tag of article.tags || []) tags.add(tag);
	}
	return { series, tags };
}

function applyLocale() {
	document.documentElement.lang = state.locale === "en" ? "en" : "zh-CN";
	$("#locale-toggle").textContent = state.locale === "zh-cn" ? "中文" : "English";
	$("#article-form [name=locale]").value = state.locale;
	$("#preface-form [name=locale]").value = state.locale;
}

function toggleLocale() {
	state.locale = state.locale === "zh-cn" ? "en" : "zh-cn";
	state.articlePage = 1;
	localStorage.setItem("thought-admin-locale", state.locale);
	closeEditors();
	applyLocale();
	newArticle(false);
	newPreface(false);
	renderAll();
}

function applyTheme() {
	document.documentElement.dataset.theme = state.theme;
	$("#theme-toggle").textContent = state.theme === "dark" ? "日间" : "夜间";
}

function toggleTheme() {
	state.theme = state.theme === "dark" ? "light" : "dark";
	localStorage.setItem("thought-admin-theme", state.theme);
	applyTheme();
}

function plainText(markdown, length = 180) {
	const text = String(markdown || "")
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/!\[[^\]]*]\([^)]*\)/g, " ")
		.replace(/\[[^\]]+]\([^)]*\)/g, "$1")
		.replace(/[#>*_`~|:[\]{}()\\]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return text.length > length ? `${text.slice(0, length).trim()}...` : text;
}

function articleUrl(article) {
	const prefix = article.locale && article.locale !== "zh-cn" ? `/${article.locale}` : "";
	return `${SITE_URL}${prefix}/${article.type}/${encodeURI(article.slug || article.id || "")}`;
}

function hostName(value) {
	try {
		return new URL(value).hostname.replace(/^www\./, "");
	} catch {
		return "";
	}
}

function setArticleEditorOpen(open) {
	$("#article-editor-panel").classList.toggle("open", open);
	$(".article-manager").classList.toggle("editing", open);
	syncModalState();
}

function setLinkEditorOpen(open) {
	$("#link-editor-panel").classList.toggle("open", open);
	$(".link-manager").classList.toggle("editing", open);
	syncModalState();
}

function setPrefaceEditorOpen(open) {
	$("#preface-editor-panel").classList.toggle("open", open);
	$(".preface-manager").classList.toggle("editing", open);
	syncModalState();
}

function setCommentEditorOpen(open) {
	$("#comment-editor-panel")?.classList.toggle("open", open);
	$(".comment-manager")?.classList.toggle("editing", open);
	syncModalState();
}

function syncModalState() {
	const open = Boolean(document.querySelector(".article-editor-panel.open, .side-editor-panel.open"));
	document.body.classList.toggle("modal-open", open);
}

function closeEditors() {
	setArticleEditorOpen(false);
	setLinkEditorOpen(false);
	setPrefaceEditorOpen(false);
	setCommentEditorOpen(false);
}

async function loadOverview() {
	const data = await api("/api/admin/overview.json");
	Object.assign(state, data);
	renderAll();
}

function renderAll() {
	$("#site-root").textContent = state.deploy.siteRoot || "未读取";
	renderOverview();
	renderRecent();
	renderArticles();
	renderTaxonomy();
	renderLinks();
	renderComments();
	renderSubscriptions();
	renderMemos();
	renderPrefaces();
	renderDeploy(state.deploy);
}

function setCount(id, value) {
	const node = $(`#${id}`);
	if (node) node.textContent = String(value ?? 0);
}

function renderOverview() {
	const articles = currentArticles();
	const taxonomy = buildTaxonomyFor(articles);
	setCount("overview-comments", state.comments || state.commentItems.length);
	setCount("overview-articles", articles.length);
	setCount("overview-prefaces", currentPrefaces().length);
	setCount("overview-links", state.links.length);
	setCount("overview-subscriptions", state.subscriptions.length + (state.links || []).filter(link => link.feed).length + 2);
	setCount("overview-tags", taxonomy.tags.size);
	setCount("overview-series", taxonomy.series.size);
}

function renderRecent() {
	if (!$("#recent-articles")) return;
	$("#recent-articles").innerHTML = state.articles
		.slice(0, 8)
		.map(
			article => `
		<button data-edit-article="${escapeHtml(article.path)}">
			<strong>${escapeHtml(article.title)}</strong>
			<span>${article.type} · ${article.locale} · ${escapeHtml(article.timestamp || article.updated)}</span>
		</button>
	`
		)
		.join("");
	if ($("#dashboard-git")) $("#dashboard-git").textContent = state.deploy.status || "工作区干净";
}

function renderArticles() {
	const query = $("#article-search").value.trim().toLowerCase();
	const type = $("#article-type-filter").value;
	const items = currentArticles()
		.filter(article => {
			const text = `${article.title} ${article.series || ""} ${article.tags.join(" ")}`.toLowerCase();
			return (!type || article.type === type) && (!query || text.includes(query));
		})
		.sort((a, b) => dateMs(b.timestamp || b.updated) - dateMs(a.timestamp || a.updated) || a.title.localeCompare(b.title));
	const totalPages = Math.max(1, Math.ceil(items.length / ARTICLE_PAGE_SIZE));
	state.articlePage = Math.min(Math.max(1, state.articlePage), totalPages);
	const pageItems = items.slice((state.articlePage - 1) * ARTICLE_PAGE_SIZE, state.articlePage * ARTICLE_PAGE_SIZE);
	$("#article-list").innerHTML = pageItems
		.map(
			article => `
		<article class="article-row ${state.selectedArticle?.path === article.path ? "active" : ""}">
			<div class="article-row-title">
				<a href="${articleUrl(article)}" target="_blank" rel="noreferrer">${escapeHtml(article.title)}</a>
				<small>${article.draft ? "草稿" : "已发布"} · ${escapeHtml(dateOnly(article.timestamp || article.updated))}</small>
			</div>
			<div class="article-series">${escapeHtml(article.series || "未分类")}</div>
			<div class="article-tags">${article.tags.length ? article.tags.map(escapeHtml).join("、") : "无标签"}</div>
			<div class="article-actions">
				<button type="button" data-edit-article="${escapeHtml(article.path)}">编辑</button>
				<button class="danger" type="button" data-delete-article="${escapeHtml(article.path)}">删除</button>
			</div>
		</article>
	`
		)
		.join("");
	renderArticlePagination(totalPages);
}

function renderArticlePagination(totalPages) {
	const pagination = $("#article-pagination");
	if (!pagination) return;
	pagination.innerHTML =
		totalPages > 1
			? Array.from({ length: totalPages }, (_, index) => {
					const page = index + 1;
					return `<button type="button" class="${page === state.articlePage ? "active" : ""}" data-article-page="${page}">${page}</button>`;
				}).join("")
			: "";
}

function editArticle(article) {
	if (!article) return;
	state.selectedArticle = article;
	setForm($("#article-form"), {
		...article,
		originalPath: article.path,
		tags: article.tags.join(", ")
	});
	$("#article-editor-mode").textContent = "编辑文章";
	$("#article-editor-title").textContent = article.title || "未命名文章";
	setArticleEditorOpen(true);
	updateArticlePreview();
	renderArticles();
}

function newArticle(open = true) {
	state.selectedArticle = null;
	setForm($("#article-form"), {
		type: "note",
		locale: state.locale,
		title: "",
		slug: "",
		timestamp: timestampNow(),
		series: "",
		tags: "",
		description: "",
		content: "",
		draft: true,
		toc: true,
		sensitive: false,
		top: 0,
		originalPath: ""
	});
	$("#article-editor-mode").textContent = "新建文章";
	$("#article-editor-title").textContent = "写一篇新的文章";
	setArticleEditorOpen(open);
	updateArticlePreview();
	renderArticles();
}

function articlePayload() {
	const data = formData($("#article-form"));
	return {
		...data,
		tags: splitTags(data.tags),
		top: Number(data.top || 0),
		slug: data.slug || slugify(data.title)
	};
}

function updateArticlePreview() {
	const data = articlePayload();
	$("#article-preview").innerHTML = `
		<h1>${escapeHtml(data.title || "未命名文章")}</h1>
		<p class="meta">${escapeHtml(data.type)} · ${escapeHtml(data.timestamp)} · ${splitTags(data.tags).map(escapeHtml).join(" / ")}</p>
		${renderMarkdown(data.content)}
	`;
}

async function saveArticle() {
	const payload = articlePayload();
	const data = await api("/api/admin/articles", { method: "POST", body: JSON.stringify(payload) });
	state.selectedArticle = data.article;
	await reloadArticles();
	toast("文章已保存");
}

async function reloadArticles() {
	const data = await api("/api/admin/articles");
	state.articles = data.articles;
	state.taxonomy = data.taxonomy;
	renderAll();
	if (state.selectedArticle) {
		const current = state.articles.find(article => article.path === state.selectedArticle.path) || state.selectedArticle;
		editArticle(current);
	}
}

async function deleteSelectedArticle() {
	if (!state.selectedArticle) return toast("没有选中文章");
	if (!confirm(`删除 ${state.selectedArticle.title}？`)) return;
	await api("/api/admin/articles", { method: "DELETE", body: JSON.stringify({ path: state.selectedArticle.path }) });
	state.selectedArticle = null;
	newArticle(false);
	setArticleEditorOpen(false);
	await reloadArticles();
	toast("文章已删除");
}

async function deleteArticleByPath(path) {
	const article = state.articles.find(item => item.path === path);
	if (!article) return;
	if (!confirm(`删除 ${article.title}？`)) return;
	await api("/api/admin/articles", { method: "DELETE", body: JSON.stringify({ path }) });
	if (state.selectedArticle?.path === path) {
		state.selectedArticle = null;
		setArticleEditorOpen(false);
	}
	await reloadArticles();
	toast("文章已删除");
}

async function setArticleDraft(path, draft) {
	const article = state.articles.find(item => item.path === path);
	if (!article) return;
	const saved = await api("/api/admin/articles", { method: "POST", body: JSON.stringify({ ...article, originalPath: article.path, draft }) });
	state.selectedArticle = saved.article;
	await reloadArticles();
	toast(draft ? "已设为草稿" : "已发布");
}

async function saveCurrentArticleAsDraft(draft) {
	$("#article-form [name=draft]").checked = draft;
	await saveArticle();
	toast(draft ? "已保存为草稿" : "文章已发布");
}

async function extractArticle(kind) {
	const data = articlePayload();
	const result = await api(`/api/admin/articles?title=${encodeURIComponent(data.title)}&content=${encodeURIComponent(data.content || "")}`);
	if (kind === "summary") $("#article-form [name=description]").value = result.description;
	if (kind === "tags") $("#article-form [name=tags]").value = result.tags.join(", ");
	updateArticlePreview();
}

function renderTaxonomy() {
	const articles = currentArticles();
	const directories = new Map();
	const series = new Map();
	const tags = new Map();
	for (const article of articles) {
		const directory = article.path.split("/").slice(0, -1).join("/");
		directories.set(directory, (directories.get(directory) || 0) + 1);
		if (article.series) series.set(article.series, (series.get(article.series) || 0) + 1);
		for (const tag of article.tags || []) tags.set(tag, (tags.get(tag) || 0) + 1);
	}
	const render = map =>
		[...map.entries()]
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
			.map(([name, count]) => `<span>${escapeHtml(name)} <b>${count}</b></span>`)
			.join("");
	$("#taxonomy-directories").innerHTML = render(directories);
	$("#taxonomy-series").innerHTML = render(series);
	$("#taxonomy-tags").innerHTML = render(tags);
}

function renderLinks() {
	$("#links-list").innerHTML = state.links
		.map(
			(link, index) => `
		<article class="link-card">
			<img src="${escapeHtml(link.image || "/favicon.svg")}" alt="" />
			<div class="link-card-main">
				<a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.title)}</a>
				<p>${escapeHtml(link.description || "暂无描述")}</p>
				<span class="link-status ${link.status && link.status < 400 ? "ok" : link.status ? "bad" : ""}">
					${link.status ? `状态 ${link.status}` : "未检测"}
				</span>
			</div>
			<div class="link-card-actions">
				<button type="button" data-edit-link="${index}">编辑</button>
				<button class="danger" type="button" data-delete-link="${index}">删除</button>
			</div>
		</article>
	`
		)
		.join("");
}

function renderSubscriptions() {
	const sourceName = new Map([
		...state.subscriptions.map(item => [item.feedUrl, item.title]),
		...state.links.filter(link => link.feed).map(link => [link.feed, link.title])
	]);
	const linkNameByHost = new Map(state.links.map(link => [hostName(link.url), link.title]).filter(([host]) => host));
	const siteLabel = item =>
		item.siteTitle ||
		sourceName.get(item.source) ||
		linkNameByHost.get(hostName(item.url)) ||
		hostName(item.url) ||
		hostName(item.source) ||
		"未知网站";
	const items = state.feedItems || [];
	$("#subscription-list").innerHTML = items.length
		? items
				.map(
					item => `
			<article class="feed-update-card">
				<div>
					<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a>
					<span class="feed-meta">${escapeHtml(siteLabel(item))} · 发布时间 ${escapeHtml(dateOnly(item.date) || "未知")}</span>
					<p>${escapeHtml(plainText(item.summary, 140) || "暂无摘要")}</p>
				</div>
			</article>
		`
				)
				.join("")
		: `<div class="empty-state">暂无订阅更新，点击“刷新订阅”获取新文章。</div>`;
}

function renderComments() {
	const list = $("#comment-list");
	if (!list) return;
	const query = $("#comment-search")?.value.trim().toLowerCase() || "";
	const section = $("#comment-section-filter")?.value || "all";
	const stateFilter = $("#comment-state-filter")?.value || "all";
	const comments = (state.commentItems || []).filter(comment => {
		const deleted = Boolean(comment.deleted);
		const text = [comment.title, comment.item, comment.content, comment.name, comment.nickname, comment.email, comment.section, comment.reply]
			.filter(Boolean)
			.join(" ")
			.toLowerCase();
		return (
			(section === "all" || comment.section === section) &&
			(stateFilter === "all" || (stateFilter === "deleted" ? deleted : !deleted)) &&
			(!query || text.includes(query))
		);
	});
	$("#comment-count").textContent = String(comments.length);
	$("#comment-loading").textContent = "";
	setCount("overview-comments", state.commentItems.length);
	list.innerHTML = comments.length
		? comments
				.map(comment => {
					const deleted = Boolean(comment.deleted);
					const name = displayCommentName(comment);
					return `
				<article class="comment-row ${state.selectedComment?.id === comment.id ? "active" : ""} ${deleted ? "deleted" : ""}" data-edit-comment="${escapeHtml(comment.id)}">
					<div class="comment-main">
						<div class="comment-meta">
							<span class="comment-section">${escapeHtml(commentSectionLabel(comment.section))}</span>
							${comment.author ? `<span class="comment-badge">笔者</span>` : ""}
							${deleted ? `<span class="comment-badge danger">已删除</span>` : ""}
							<a href="${escapeHtml(comment.url || "#")}" target="_blank" rel="noreferrer">${escapeHtml(comment.title || comment.item || "未命名内容")}</a>
						</div>
						<p>${escapeHtml(comment.content || "评论被删除")}</p>
						<small>
							${escapeHtml(name)}
							${comment.email ? ` · ${escapeHtml(comment.email)}` : ""}
							${comment.reply ? ` · 回复：${escapeHtml(comment.reply)}` : ""}
						</small>
					</div>
					<div class="comment-side">
						<time>${escapeHtml(dateTime(comment.timestamp || comment.createdAt))}</time>
						<div class="article-actions">
							<button type="button" data-edit-comment="${escapeHtml(comment.id)}">详情</button>
							<button class="danger" type="button" data-delete-comment="${escapeHtml(comment.id)}">删除</button>
							${deleted ? `<button class="danger" type="button" data-purge-comment="${escapeHtml(comment.id)}">彻底删除</button>` : ""}
						</div>
					</div>
				</article>
			`;
				})
				.join("")
		: renderCommentEmptyState(query, section, stateFilter);
	renderSelectedComment();
}

function renderCommentEmptyState(query, section, stateFilter) {
	const hasFilters = Boolean(query) || section !== "all" || stateFilter !== "all";
	if (state.commentItems.length && hasFilters) return `<div class="empty-state">没有匹配的评论。</div>`;
	return `
		<div class="comment-empty-state">
			<strong>这里还没有读到网站评论</strong>
			<p>点击上方“连接评论数据”从网站 Cloudflare D1 读取评论。</p>
		</div>
	`;
}

async function refreshComments(source = state.commentSource || "local") {
	$("#comment-loading").textContent = "载入中";
	const query = source === "site" ? `?source=site&locale=${encodeURIComponent(state.locale)}` : "";
	const data = await api(`/api/admin/comments${query}`);
	state.commentItems = data.comments || [];
	state.commentSource = data.source || source;
	state.comments = state.commentItems.length;
	renderComments();
	renderOverview();
	toast(state.commentItems.length ? `评论已刷新，读取 ${state.commentItems.length} 条` : "未读到评论数据");
}

async function connectSiteComments() {
	try {
		await refreshComments("site");
	} catch (error) {
		state.commentItems = [];
		state.commentSource = "site";
		renderComments();
		renderOverview();
		toast(error.message);
	}
}

function displayCommentName(comment) {
	return comment.name || comment.nickname || "归隐旅人";
}

function commentSectionLabel(section) {
	return { note: "文记", guide: "指南", jotting: "随笔", preface: "序文" }[section] || "未知分区";
}

function selectComment(id) {
	const comment = state.commentItems.find(item => item.id === id);
	if (!comment) return;
	state.selectedComment = comment;
	$("#comment-history-list").innerHTML = "";
	setCommentEditorOpen(true);
	renderComments();
}

function renderSelectedComment() {
	const comment = state.selectedComment;
	const detail = $("#comment-detail");
	if (!detail) return;
	if (!comment) {
		detail.innerHTML = `<div class="empty-state">选择一条评论查看详情。</div>`;
		$("#comment-editor-title").textContent = "选择一条评论";
		$("#comment-editor-mode").textContent = "评论详情";
		$("#restore-comment").disabled = true;
		$("#delete-comment").disabled = true;
		$("#purge-comment").disabled = true;
		return;
	}
	$("#comment-editor-title").textContent = comment.title || comment.item || comment.id;
	$("#comment-editor-mode").textContent = comment.deleted ? "已删除评论" : "评论详情";
	$("#restore-comment").disabled = !comment.deleted;
	$("#delete-comment").disabled = Boolean(comment.deleted);
	$("#purge-comment").disabled = !comment.deleted;
	detail.innerHTML = `
		<div class="comment-detail-card">
			<div class="comment-detail-meta">
				<span>${escapeHtml(commentSectionLabel(comment.section))}</span>
				<span>${escapeHtml(dateTime(comment.timestamp || comment.createdAt))}</span>
				${comment.updated ? `<span>已编辑</span>` : ""}
			</div>
			<h3><a href="${escapeHtml(comment.url || "#")}" target="_blank" rel="noreferrer">${escapeHtml(comment.title || "未命名内容")}</a></h3>
			<p class="comment-author">${escapeHtml(displayCommentName(comment))}${comment.email ? ` · ${escapeHtml(comment.email)}` : ""}</p>
			<blockquote>${escapeHtml(comment.content || "评论被删除")}</blockquote>
			<dl>
				<div><dt>评论 ID</dt><dd>${escapeHtml(comment.id)}</dd></div>
				<div><dt>内容 ID</dt><dd>${escapeHtml(comment.item || "")}</dd></div>
				<div><dt>回复</dt><dd>${escapeHtml(comment.reply || "无")}</dd></div>
				<div><dt>主页</dt><dd>${comment.homepage ? `<a href="${escapeHtml(comment.homepage)}" target="_blank" rel="noreferrer">${escapeHtml(comment.homepage)}</a>` : "无"}</dd></div>
			</dl>
		</div>
	`;
}

async function loadCommentHistory() {
	if (!state.selectedComment) return toast("没有选中评论");
	const historyList = $("#comment-history-list");
	historyList.innerHTML = `<div class="empty-state">载入中</div>`;
	const source = state.commentSource === "site" ? "&source=site" : "";
	const data = await api(`/api/admin/comments?history=${encodeURIComponent(state.selectedComment.id)}${source}`);
	const history = data.history || [];
	historyList.innerHTML = history.length
		? history
				.map(
					item => `
			<article class="comment-history-item">
				<time>${escapeHtml(dateTime(item.timestamp))}</time>
				<p>${escapeHtml(item.content || "")}</p>
			</article>
		`
				)
				.join("")
		: `<div class="empty-state">暂无编辑历史</div>`;
}

async function updateSelectedComment(action) {
	if (!state.selectedComment) return toast("没有选中评论");
	if (action === "delete" && !confirm("删除后评论会保留在回复树中，但正文会被隐藏。")) return;
	if (action === "purge" && !confirm("彻底删除只会移除当前这条已删除评论，原有回复会保留。")) return;
	const data = await api("/api/admin/comments", {
		method: "POST",
		body: JSON.stringify({ id: state.selectedComment.id, action, source: state.commentSource, locale: state.locale })
	});
	state.commentItems = data.comments || [];
	state.comments = state.commentItems.length;
	state.selectedComment = state.commentItems.find(item => item.id === state.selectedComment?.id) || null;
	if (!state.selectedComment) setCommentEditorOpen(false);
	renderComments();
	renderOverview();
	toast(action === "restore" ? "评论已恢复" : action === "purge" ? "评论已彻底删除" : "评论已删除");
}

function renderMemos() {
	const list = $("#memos-list");
	if (!list) return;
	list.innerHTML = state.memos.length
		? state.memos
				.map(
					memo => `
			<article class="feed-update-card memo-update-card">
				<div class="memo-update-main">
					<p>${escapeHtml(plainText(memo.content, 260) || "空白内容")}</p>
					<span>标签：${escapeHtml((memo.tags || []).join("、") || "无")} · 发布时间 ${escapeHtml(dateOnly(memo.createdAt || memo.updatedAt) || "未知")}</span>
				</div>
				<div class="memo-update-actions">
					<button type="button" data-publish-preface-memo="${escapeHtml(memo.id)}">发布到序文</button>
				</div>
			</article>
		`
				)
				.join("")
		: `<div class="empty-state">暂无 Memos 数据，点击“刷新 Memos”读取。</div>`;
}

function memoPrefaceContent(memo) {
	return String(memo?.content || "")
		.replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu, "$1")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

async function publishMemoToPreface(id) {
	const memo = state.memos.find(item => item.id === id);
	if (!memo) return toast("没有找到这条 Memos");
	const content = memoPrefaceContent(memo);
	if (!content) return toast("Memos 内容为空，无法发布序文");
	const data = await api("/api/admin/prefaces", {
		method: "POST",
		body: JSON.stringify({
			locale: state.locale,
			timestamp: memo.createdAt || memo.updatedAt || timestampNow(),
			draft: false,
			content
		})
	});
	state.selectedPreface = data.preface;
	const list = await api(`/api/admin/prefaces?locale=${encodeURIComponent(state.locale)}`);
	state.prefaces = [...state.prefaces.filter(preface => preface.locale !== state.locale), ...(list.prefaces || [])];
	renderPrefaces();
	renderOverview();
	toast("Memos 已发布到序文");
}

async function refreshMemos(silent = false) {
	const data = await api("/api/admin/memos");
	state.memos = data.memos || [];
	$("#memos-site-url").value = data.siteUrl || $("#memos-site-url").value;
	$("#memos-api-url").value = data.apiUrl || $("#memos-api-url").value;
	renderMemos();
	if (!silent) toast(`Memos 已刷新，读取 ${state.memos.length} 条`);
}

async function publishMemos() {
	const content = $("#memos-content").value.trim();
	if (!content) return toast("Memos 内容不能为空");
	const button = $("#publish-memos");
	button.disabled = true;
	try {
		await api("/api/admin/memos", { method: "POST", body: JSON.stringify({ content }) });
		$("#memos-content").value = "";
		await refreshMemos();
		toast("Memos 已发布");
	} finally {
		button.disabled = false;
	}
}

function editLink(index) {
	state.selectedLink = Number(index);
	setForm($("#link-form"), { index, ...state.links[index] });
	$("#link-editor-mode").textContent = "编辑友链";
	$("#link-editor-title").textContent = state.links[index]?.title || "填写网站信息";
	setLinkEditorOpen(true);
}

function newLink() {
	state.selectedLink = null;
	setForm($("#link-form"), { index: "", title: "", url: "", type: "lifestyle", image: "", feed: "", description: "" });
	$("#discover-input").value = "";
	$("#link-editor-mode").textContent = "添加友链";
	$("#link-editor-title").textContent = "填写网站信息";
	setLinkEditorOpen(true);
}

function linkPayload() {
	const data = formData($("#link-form"));
	return {
		title: data.title,
		url: data.url,
		type: data.type || "lifestyle",
		image: data.image,
		description: data.description,
		feed: data.feed
	};
}

async function discoverSite() {
	const input = $("#discover-input").value.trim();
	if (!input) return toast("先输入域名");
	const data = await api("/api/admin/discover", { method: "POST", body: JSON.stringify({ url: input }) });
	setForm($("#link-form"), { index: "", ...data.site });
	toast("站点信息已发现");
}

async function addLink() {
	const data = linkPayload();
	if (!data.title || !data.url) return toast("友链名称和网址不能为空");
	const index = $("#link-form [name=index]").value;
	if (index !== "") state.links[Number(index)] = data;
	else state.links.push(data);
	renderLinks();
}

async function saveLinks() {
	await addLink();
	await api("/api/admin/linkroll", { method: "POST", body: JSON.stringify({ links: state.links, locale: "zh-cn" }) });
	const data = await api("/api/admin/linkroll?locale=zh-cn");
	state.links = data.links || [];
	renderLinks();
	renderOverview();
	setLinkEditorOpen(false);
	toast("友链已保存");
}

async function deleteLink(index) {
	const link = state.links[Number(index)];
	if (!link) return;
	if (!confirm(`删除 ${link.title}？`)) return;
	state.links.splice(Number(index), 1);
	const data = await api("/api/admin/linkroll", { method: "POST", body: JSON.stringify({ links: state.links, locale: "zh-cn" }) });
	state.links = data.links;
	if (state.selectedLink === Number(index)) setLinkEditorOpen(false);
	renderLinks();
	toast("友链已删除");
}

function removeLink() {
	const index = $("#link-form [name=index]").value;
	if (index === "") return;
	deleteLink(Number(index)).catch(error => toast(error.message));
}

async function checkLinks() {
	const data = await api("/api/admin/linkroll", { method: "PATCH", body: JSON.stringify({ locale: "zh-cn" }) });
	state.links = data.links;
	renderLinks();
	toast("友链检测完成");
}

async function addSubscription() {
	const link = linkPayload();
	const feedUrl = link.feed || `${new URL(link.url).origin}/feed.xml`;
	state.subscriptions.push({
		title: link.title,
		siteUrl: link.url,
		feedUrl,
		image: link.image,
		description: link.description
	});
	await api("/api/admin/subscriptions", { method: "POST", body: JSON.stringify({ subscriptions: state.subscriptions, locale: "zh-cn" }) });
	renderSubscriptions();
	toast("订阅源已加入");
}

async function removeSubscription(index) {
	state.subscriptions.splice(Number(index), 1);
	await api("/api/admin/subscriptions", { method: "POST", body: JSON.stringify({ subscriptions: state.subscriptions, locale: "zh-cn" }) });
	renderSubscriptions();
}

async function refreshFeeds() {
	const button = $("#refresh-feeds");
	if (button) {
		button.disabled = true;
		button.textContent = "刷新中...";
	}
	try {
		const data = await api("/api/admin/subscriptions", { method: "PATCH", body: JSON.stringify({ locale: "zh-cn" }) });
		state.subscriptions = data.subscriptions;
		state.feedItems = data.items;
		renderSubscriptions();
		renderOverview();
		const failed = Array.isArray(data.errors) && data.errors.length ? `，${data.errors.length} 个源失败` : "";
		toast(`订阅已直接刷新，缓存 ${data.items.length} 条${failed}`);
	} finally {
		if (button) {
			button.disabled = false;
			button.textContent = "刷新订阅";
		}
	}
}

function renderPrefaces() {
	$("#preface-list").innerHTML = currentPrefaces()
		.map(
			preface => `
		<article class="preface-row ${state.selectedPreface?.path === preface.path ? "active" : ""}">
			<div class="preface-row-main">
				<p>${escapeHtml(plainText(preface.content, 260) || "空白内容")}</p>
				<time>${escapeHtml(dateOnly(preface.timestamp || preface.updated))}${preface.draft ? " · 草稿" : ""}</time>
			</div>
			<div class="article-actions">
				<button type="button" data-edit-preface="${escapeHtml(preface.path)}">编辑</button>
				<button class="danger" type="button" data-delete-preface="${escapeHtml(preface.path)}">删除</button>
			</div>
		</article>
	`
		)
		.join("");
}

function editPreface(preface) {
	if (!preface) return;
	state.selectedPreface = preface;
	setForm($("#preface-form"), { ...preface, originalPath: preface.path });
	$("#preface-editor-mode").textContent = "编辑序文";
	$("#preface-editor-title").textContent = dateOnly(preface.timestamp || preface.updated) || "序文内容";
	setPrefaceEditorOpen(true);
	$("#preface-preview").innerHTML = renderMarkdown(preface.content);
	renderPrefaces();
}

function newPreface(open = true) {
	state.selectedPreface = null;
	setForm($("#preface-form"), { originalPath: "", locale: state.locale, timestamp: timestampNow(), draft: false, content: "" });
	$("#preface-editor-mode").textContent = "新建序文";
	$("#preface-editor-title").textContent = "写一条新的序文";
	setPrefaceEditorOpen(open);
	$("#preface-preview").innerHTML = "";
	renderPrefaces();
}

async function savePreface() {
	const payload = formData($("#preface-form"));
	if (!String(payload.content || "").trim()) return toast("序文内容不能为空");
	const data = await api("/api/admin/prefaces", { method: "POST", body: JSON.stringify(payload) });
	state.selectedPreface = data.preface;
	const list = await api("/api/admin/prefaces");
	state.prefaces = list.prefaces;
	renderPrefaces();
	toast("序文已保存");
}

async function deletePreface() {
	if (!state.selectedPreface) return toast("没有选中序文");
	if (!confirm(`删除 ${state.selectedPreface.id}？`)) return;
	await api("/api/admin/prefaces", { method: "DELETE", body: JSON.stringify({ path: state.selectedPreface.path }) });
	const list = await api("/api/admin/prefaces");
	state.prefaces = list.prefaces;
	newPreface(false);
	setPrefaceEditorOpen(false);
	renderPrefaces();
	toast("序文已删除");
}

async function deletePrefaceByPath(path) {
	const preface = state.prefaces.find(item => item.path === path);
	if (!preface) return;
	if (!confirm(`删除 ${dateOnly(preface.timestamp || preface.updated)} 的序文？`)) return;
	await api("/api/admin/prefaces", { method: "DELETE", body: JSON.stringify({ path }) });
	const list = await api("/api/admin/prefaces");
	state.prefaces = list.prefaces;
	if (state.selectedPreface?.path === path) setPrefaceEditorOpen(false);
	renderPrefaces();
	toast("序文已删除");
}

async function setPrefaceDraft(path, draft) {
	const preface = state.prefaces.find(item => item.path === path);
	if (!preface) return;
	const data = await api("/api/admin/prefaces", { method: "POST", body: JSON.stringify({ ...preface, originalPath: preface.path, draft }) });
	state.selectedPreface = data.preface;
	const list = await api("/api/admin/prefaces");
	state.prefaces = list.prefaces;
	renderPrefaces();
	toast(draft ? "已设为草稿" : "已发布");
}

async function saveCurrentPrefaceAsDraft(draft) {
	$("#preface-form [name=draft]").checked = draft;
	await savePreface();
	toast(draft ? "已保存为草稿" : "序文已发布");
}

function renderDeploy(data) {
	const remoteName = data.remoteName || "origin";
	const remoteUrl = data.remoteUrl || (data.remotes && data.remotes !== "未配置" ? `https://github.com/${data.remotes}.git` : "");
	const remoteForm = $("#remote-form");
	if (remoteForm) setForm(remoteForm, { remoteName, remoteUrl });
	const publishForm = $("#publish-form");
	if (publishForm) setForm(publishForm, { ...formData(publishForm), remote: remoteName, branch: data.branch || "" });
	$("#deploy-log").textContent =
		data.log ||
		[
			`site: ${data.siteRoot || ""}`,
			`remote: ${remoteName}`,
			`repo: ${data.remotes || "无"}`,
			`url: ${remoteUrl || "无"}`,
			`branch: ${data.branch || ""}`,
			"",
			"status:",
			data.status || "工作区干净"
		].join("\n");
}

async function refreshDeploy() {
	const data = await api("/api/admin/deploy");
	state.deploy = data;
	renderDeploy(data);
}

async function setRemote() {
	const data = formData($("#remote-form"));
	state.deploy = await api("/api/admin/deploy", { method: "POST", body: JSON.stringify({ action: "remote", ...data }) });
	renderDeploy(state.deploy);
	toast(state.deploy.ok === false ? "GitHub 仓库链接未完成" : "GitHub 仓库链接已绑定");
}

async function publishSite() {
	const data = formData($("#publish-form"));
	$("#deploy-log").textContent = "正在提交并推送部署触发提交，Cloudflare 将通过 GitHub 自动构建部署...";
	const result = await api("/api/admin/deploy", { method: "POST", body: JSON.stringify({ action: "publish", ...data }) });
	state.deploy = result;
	renderDeploy(result);
	toast(result.ok === false ? "发布失败，请查看执行日志" : "发布流程已触发");
}

function bindEvents() {
	$("#admin-auth-form").addEventListener("submit", async event => {
		event.preventDefault();
		const secret = $("#admin-secret-input").value.trim();
		if (!secret) return toast("请输入后台访问密钥");
		const response = await fetch("/api/admin/session", {
			method: "POST",
			credentials: "same-origin",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ secret })
		});
		if (!response.ok) return toast("后台访问密钥不正确");
		localStorage.setItem(ADMIN_SECRET_STORAGE_KEY, secret);
		adminAuthorized = false;
		adminSessionPromise = null;
		$("#admin-auth").classList.remove("show");
		$("#admin-auth").setAttribute("aria-hidden", "true");
		adminSecretResolver?.(secret);
		adminSecretResolver = null;
	});
	$$(".nav button").forEach(button => {
		button.addEventListener("click", () => {
			closeEditors();
			$$(".nav button, .panel").forEach(node => {
				node.classList.remove("active");
			});
			button.classList.add("active");
			$(`#${button.dataset.panel}`).classList.add("active");
			if (button.dataset.panel === "dashboard") refreshMemos(true).catch(error => toast(error.message));
		});
	});
	$("#refresh-all").addEventListener("click", loadOverview);
	$("#locale-toggle").addEventListener("click", toggleLocale);
	$("#theme-toggle").addEventListener("click", toggleTheme);
	$("#refresh-memos").addEventListener("click", () => refreshMemos().catch(error => toast(error.message)));
	$("#publish-memos").addEventListener("click", () => publishMemos().catch(error => toast(error.message)));
	$("#refresh-comments").addEventListener("click", () => refreshComments("site").catch(error => toast(error.message)));
	$("#comment-login-link").addEventListener("click", () => connectSiteComments());
	$("#comment-manager-link").addEventListener("click", () => connectSiteComments());
	$("#comment-search").addEventListener("input", renderComments);
	$("#comment-section-filter").addEventListener("change", renderComments);
	$("#comment-state-filter").addEventListener("change", renderComments);
	$("#reset-comments").addEventListener("click", () => {
		$("#comment-search").value = "";
		$("#comment-section-filter").value = "all";
		$("#comment-state-filter").value = "all";
		renderComments();
	});
	$("#close-comment-editor").addEventListener("click", () => setCommentEditorOpen(false));
	$("#load-comment-history").addEventListener("click", () => loadCommentHistory().catch(error => toast(error.message)));
	$("#restore-comment").addEventListener("click", () => updateSelectedComment("restore").catch(error => toast(error.message)));
	$("#delete-comment").addEventListener("click", () => updateSelectedComment("delete").catch(error => toast(error.message)));
	$("#purge-comment").addEventListener("click", () => updateSelectedComment("purge").catch(error => toast(error.message)));
	$("#article-search").addEventListener("input", () => {
		state.articlePage = 1;
		renderArticles();
	});
	$("#article-type-filter").addEventListener("change", () => {
		state.articlePage = 1;
		renderArticles();
	});
	$("#new-article").addEventListener("click", newArticle);
	$("#save-article").addEventListener("click", () => saveArticle().catch(error => toast(error.message)));
	$("#save-draft-article").addEventListener("click", () => saveCurrentArticleAsDraft(true).catch(error => toast(error.message)));
	$("#publish-article").addEventListener("click", () => saveCurrentArticleAsDraft(false).catch(error => toast(error.message)));
	$("#close-article-editor").addEventListener("click", () => setArticleEditorOpen(false));
	$("#delete-article").addEventListener("click", () => deleteSelectedArticle().catch(error => toast(error.message)));
	$("#extract-summary").addEventListener("click", () => extractArticle("summary").catch(error => toast(error.message)));
	$("#extract-tags").addEventListener("click", () => extractArticle("tags").catch(error => toast(error.message)));
	$("#article-form").addEventListener("input", event => {
		if (event.target.name === "title" && !$("#article-form [name=originalPath]").value)
			$("#article-form [name=slug]").value = slugify(event.target.value);
		updateArticlePreview();
	});
	$("#new-link").addEventListener("click", newLink);
	$("#close-link-editor").addEventListener("click", () => setLinkEditorOpen(false));
	$("#discover-site").addEventListener("click", () => discoverSite().catch(error => toast(error.message)));
	$("#save-links").addEventListener("click", () => saveLinks().catch(error => toast(error.message)));
	$("#remove-link").addEventListener("click", removeLink);
	$("#check-links").addEventListener("click", () => checkLinks().catch(error => toast(error.message)));
	$("#add-subscription").addEventListener("click", () => addSubscription().catch(error => toast(error.message)));
	$("#refresh-feeds").addEventListener("click", () => refreshFeeds().catch(error => toast(error.message)));
	$("#new-preface").addEventListener("click", newPreface);
	$("#save-preface").addEventListener("click", () => savePreface().catch(error => toast(error.message)));
	$("#delete-preface").addEventListener("click", () => deletePreface().catch(error => toast(error.message)));
	$("#draft-preface").addEventListener("click", () => saveCurrentPrefaceAsDraft(true).catch(error => toast(error.message)));
	$("#publish-preface").addEventListener("click", () => saveCurrentPrefaceAsDraft(false).catch(error => toast(error.message)));
	$("#close-preface-editor").addEventListener("click", () => setPrefaceEditorOpen(false));
	$("#preface-form").addEventListener("input", () => {
		$("#preface-preview").innerHTML = renderMarkdown(formData($("#preface-form")).content);
	});
	$("#refresh-deploy").addEventListener("click", () => refreshDeploy().catch(error => toast(error.message)));
	$("#set-remote").addEventListener("click", () => setRemote().catch(error => toast(error.message)));
	$("#publish-site").addEventListener("click", () => publishSite().catch(error => toast(error.message)));
	document.addEventListener("click", event => {
		const articlePath = event.target.closest("[data-edit-article]")?.dataset.editArticle;
		if (articlePath) editArticle(currentArticles().find(article => article.path === articlePath));
		const articlePage = event.target.closest("[data-article-page]")?.dataset.articlePage;
		if (articlePage) {
			state.articlePage = Number(articlePage);
			renderArticles();
		}
		const deleteArticlePath = event.target.closest("[data-delete-article]")?.dataset.deleteArticle;
		if (deleteArticlePath) deleteArticleByPath(deleteArticlePath).catch(error => toast(error.message));
		const draftArticlePath = event.target.closest("[data-draft-article]")?.dataset.draftArticle;
		if (draftArticlePath) setArticleDraft(draftArticlePath, true).catch(error => toast(error.message));
		const publishArticlePath = event.target.closest("[data-publish-article]")?.dataset.publishArticle;
		if (publishArticlePath) setArticleDraft(publishArticlePath, false).catch(error => toast(error.message));
		const linkIndex = event.target.closest("[data-edit-link]")?.dataset.editLink;
		if (linkIndex !== undefined) editLink(Number(linkIndex));
		const deleteLinkIndex = event.target.closest("[data-delete-link]")?.dataset.deleteLink;
		if (deleteLinkIndex !== undefined) deleteLink(Number(deleteLinkIndex)).catch(error => toast(error.message));
		const subscriptionIndex = event.target.closest("[data-remove-subscription]")?.dataset.removeSubscription;
		if (subscriptionIndex !== undefined && confirm("移除此订阅源？"))
			removeSubscription(Number(subscriptionIndex)).catch(error => toast(error.message));
		const prefacePath = event.target.closest("[data-edit-preface]")?.dataset.editPreface;
		if (prefacePath) editPreface(currentPrefaces().find(preface => preface.path === prefacePath));
		const deletePrefacePath = event.target.closest("[data-delete-preface]")?.dataset.deletePreface;
		if (deletePrefacePath) deletePrefaceByPath(deletePrefacePath).catch(error => toast(error.message));
		const draftPrefacePath = event.target.closest("[data-draft-preface]")?.dataset.draftPreface;
		if (draftPrefacePath) setPrefaceDraft(draftPrefacePath, true).catch(error => toast(error.message));
		const publishPrefacePath = event.target.closest("[data-publish-preface]")?.dataset.publishPreface;
		if (publishPrefacePath) setPrefaceDraft(publishPrefacePath, false).catch(error => toast(error.message));
		const commentId = event.target.closest("[data-edit-comment]")?.dataset.editComment;
		if (commentId) selectComment(commentId);
		const deleteCommentId = event.target.closest("[data-delete-comment]")?.dataset.deleteComment;
		if (deleteCommentId) {
			selectComment(deleteCommentId);
			updateSelectedComment("delete").catch(error => toast(error.message));
		}
		const purgeCommentId = event.target.closest("[data-purge-comment]")?.dataset.purgeComment;
		if (purgeCommentId) {
			selectComment(purgeCommentId);
			updateSelectedComment("purge").catch(error => toast(error.message));
		}
		const memoId = event.target.closest("[data-publish-preface-memo]")?.dataset.publishPrefaceMemo;
		if (memoId) publishMemoToPreface(memoId).catch(error => toast(error.message));
	});
}

bindEvents();
const manualDeploy = $("#publish-form [name=manualDeploy]");
if (manualDeploy) manualDeploy.checked = false;
applyTheme();
applyLocale();
newArticle(false);
newLink();
setLinkEditorOpen(false);
newPreface(false);
loadOverview().catch(error => toast(error.message));
connectSiteComments();
refreshMemos(true).catch(error => toast(error.message));
