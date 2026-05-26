<script lang="ts">
import { actions } from "astro:actions";
import { onMount } from "svelte";
import Icon from "$components/Icon.svelte";
import Modal from "$components/Modal.svelte";
import { pushTip } from "$components/Tip.svelte";
import Time from "$lib/time";
import i18nit from "$i18n";

type CommentRecord = {
	id: string;
	section: "note" | "guide" | "jotting" | "preface";
	item: string;
	reply: string | null;
	drifter: string | null;
	timestamp: string | Date;
	updated: string | Date | null;
	deleted: boolean | null;
	content: string | null;
	nickname: string | null;
	email: string | null;
	homepage: string | null;
	name: string | null;
	description: string | null;
	image: string | null;
	author: number;
	title: string;
	url: string;
	locale: string;
};

type CommentHistory = {
	id: number;
	comment: string;
	timestamp: string | Date;
	content: string;
};

let { locale }: { locale: string } = $props();

const t = i18nit(locale);

let query = $state("");
let section = $state<"all" | "note" | "guide" | "jotting" | "preface">("all");
let state = $state<"all" | "active" | "deleted">("all");
let loading = $state(true);
let count = $state(0);
let comments = $state<CommentRecord[]>([]);

let historyView = $state(false);
let historyLoading = $state(false);
let histories = $state<CommentHistory[]>([]);
let focusComment = $state<CommentRecord | null>(null);

let deleteView = $state(false);
let deleting = $state(false);
let purgeView = $state(false);
let purging = $state(false);

function displayName(comment: CommentRecord) {
	return comment.name || comment.nickname || t("drifter.deactivate.done");
}

function sectionLabel(name: CommentRecord["section"]) {
	if (name === "preface") return t("navigation.preface");
	return t(`navigation.${name}`);
}

async function refresh() {
	loading = true;
	const { data, error } = await actions.comment.manage({
		locale,
		keyword: query.trim() || undefined,
		section,
		state
	});
	loading = false;

	if (error) {
		pushTip("error", t("comment.manage.fetch.failure"));
		return;
	}

	comments = data.comments as CommentRecord[];
	count = data.count;
}

async function showHistory(comment: CommentRecord) {
	focusComment = comment;
	historyView = true;
	historyLoading = true;

	const { data, error } = await actions.comment.history(comment.id);
	historyLoading = false;

	if (error) {
		pushTip("error", t("comment.manage.history.failure"));
		histories = [];
		return;
	}

	histories = data as CommentHistory[];
}

async function remove() {
	if (!focusComment) return;

	deleting = true;
	const { error } = await actions.comment.delete(focusComment.id);
	deleting = false;

	if (error) {
		pushTip("error", t("comment.manage.delete.failure"));
		return;
	}

	pushTip("success", t("comment.remove.success"));
	deleteView = false;
	await refresh();
}

async function purge() {
	if (!focusComment) return;

	purging = true;
	const { error } = await actions.comment.purge(focusComment.id);
	purging = false;

	if (error) {
		pushTip("error", t("comment.manage.purge.failure"));
		return;
	}

	pushTip("success", t("comment.manage.purge.success"));
	purgeView = false;
	await refresh();
}

function reset() {
	query = "";
	section = "all";
	state = "all";
	refresh();
}

onMount(refresh);
</script>

<Modal bind:open={historyView}>
	<div class="flex flex-col gap-4 min-w-[min(42rem,80vw)] max-w-[80vw]">
		<header class="flex items-start justify-between gap-4">
			<div class="flex flex-col gap-1">
				<h2>{t("comment.manage.history.title")}</h2>
				{#if focusComment}
					<a href={focusComment.url} target="_blank" rel="noopener noreferrer" class="text-secondary underline">{focusComment.title}</a>
				{/if}
			</div>
			<button onclick={() => (historyView = false)}><Icon name="lucide--x" title={t("cancel")} /></button>
		</header>

		{#if historyLoading}
			<div class="py-8 flex items-center justify-center text-secondary"><Icon name="svg-spinners--ring-resize" /></div>
		{:else if histories.length}
			<ul class="flex flex-col gap-4 max-h-[60vh] overflow-auto pe-1">
				{#each histories as history (history.id)}
					<li class="border border-weak rounded-sm p-4 flex flex-col gap-2">
						<time class="font-mono text-xs text-secondary">{Time.toString(new Date(history.timestamp), true).replace("-", " ")}</time>
						<div class="markdown comment whitespace-pre-wrap break-words">{history.content}</div>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="py-8 text-center text-secondary">{t("comment.manage.history.empty")}</p>
		{/if}
	</div>
</Modal>

<Modal bind:open={deleteView}>
	<div class="flex flex-col gap-5 min-w-[min(30rem,80vw)] max-w-[80vw]">
		<div class="flex flex-col gap-2">
			<h2>{t("comment.manage.delete.title")}</h2>
			<p>{t("comment.manage.delete.description")}</p>
			{#if focusComment}
				<div class="border border-weak rounded-sm p-3 text-sm">
					<p class="font-bold">{displayName(focusComment)} · {focusComment.title}</p>
					<p class="mt-2 text-secondary break-words">{focusComment.content || t("comment.removed")}</p>
				</div>
			{/if}
		</div>

		<div class="self-end flex gap-4">
			<button class="form-button" onclick={() => (deleteView = false)}>{t("cancel")}</button>
			<button class="form-button bg-red-500 text-white" disabled={deleting} onclick={remove}>{t("confirm")}</button>
		</div>
	</div>
</Modal>

<Modal bind:open={purgeView}>
	<div class="flex flex-col gap-5 min-w-[min(30rem,80vw)] max-w-[80vw]">
		<div class="flex flex-col gap-2">
			<h2>{t("comment.manage.purge.title")}</h2>
			<p>{t("comment.manage.purge.description")}</p>
			{#if focusComment}
				<div class="border border-weak rounded-sm p-3 text-sm">
					<p class="font-bold">{displayName(focusComment)} · {focusComment.title}</p>
					<p class="mt-2 text-secondary break-words">{focusComment.content || t("comment.removed")}</p>
				</div>
			{/if}
		</div>

		<div class="self-end flex gap-4">
			<button class="form-button" onclick={() => (purgeView = false)}>{t("cancel")}</button>
			<button class="form-button bg-red-500 text-white" disabled={purging} onclick={purge}>{t("confirm")}</button>
		</div>
	</div>
</Modal>

<main class="flex flex-col gap-6 grow">
	<section class="flex flex-col gap-4 border border-weak rounded-sm p-4">
		<div class="flex flex-col gap-1">
			<h2>{t("comment.manage.title")}</h2>
			<p class="text-secondary">{t("comment.manage.description")}</p>
		</div>

		<div class="grid gap-3 sm:grid-cols-[minmax(0,1.75fr)_repeat(2,minmax(0,0.8fr))_auto] items-end">
			<label class="flex flex-col gap-1">
				<span class="text-sm text-secondary">{t("comment.manage.search")}</span>
				<input bind:value={query} class="input border-b border-weak bg-transparent py-1" placeholder={t("comment.manage.searchPlaceholder")} />
			</label>

			<label class="flex flex-col gap-1">
				<span class="text-sm text-secondary">{t("comment.manage.section")}</span>
				<select bind:value={section} class="border-b border-weak bg-transparent py-1">
					<option value="all">{t("comment.manage.sections.all")}</option>
					<option value="note">{t("navigation.note")}</option>
					<option value="guide">{t("navigation.guide")}</option>
					<option value="jotting">{t("navigation.jotting")}</option>
					<option value="preface">{t("navigation.preface")}</option>
				</select>
			</label>

			<label class="flex flex-col gap-1">
				<span class="text-sm text-secondary">{t("comment.manage.state")}</span>
				<select bind:value={state} class="border-b border-weak bg-transparent py-1">
					<option value="all">{t("comment.manage.states.all")}</option>
					<option value="active">{t("comment.manage.states.active")}</option>
					<option value="deleted">{t("comment.manage.states.deleted")}</option>
				</select>
			</label>

			<div class="flex gap-3 justify-end">
				<button class="form-button" onclick={reset}>{t("comment.manage.reset")}</button>
				<button class="form-button" onclick={refresh}>{t("comment.reload.name")}</button>
			</div>
		</div>
	</section>

	<section class="flex items-center justify-between">
		<p><b>{t("comment.name")}</b> · {count}</p>
		{#if loading}
			<span class="text-secondary inline-flex items-center gap-2"><Icon name="svg-spinners--ring-resize" />{t("comment.manage.loading")}</span>
		{/if}
	</section>

	{#if comments.length}
		<ul class="flex flex-col gap-4">
			{#each comments as comment (comment.id)}
				<li class="border border-weak rounded-sm p-4 flex flex-col gap-3">
					<header class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
						<div class="flex flex-col gap-2 min-w-0">
							<div class="flex flex-wrap items-center gap-2">
								<span class="text-xs font-mono text-secondary uppercase">{sectionLabel(comment.section)}</span>
								{#if comment.author}<span class="text-xs px-2 py-0.5 border border-weak rounded-sm">{t("comment.author")}</span>{/if}
								{#if comment.deleted}<span class="text-xs px-2 py-0.5 border border-red-400 text-red-500 rounded-sm">{t("comment.manage.states.deleted")}</span>{/if}
							</div>
							<a href={comment.url} target="_blank" rel="noopener noreferrer" class="font-bold break-words underline">{comment.title}</a>
							<p class="text-sm text-secondary break-words">
								{displayName(comment)}
								{#if comment.email} · {comment.email}{/if}
								{#if comment.reply} · {t("comment.manage.replyTo")}: {comment.reply}{/if}
							</p>
						</div>

						<time class="font-mono text-xs text-secondary shrink-0">{Time.toString(new Date(comment.timestamp), true).replace("-", " ")}</time>
					</header>

					<div class="border-s-2 border-weak ps-3 whitespace-pre-wrap break-words">
						{comment.content || t("comment.removed")}
					</div>

					<footer class="flex flex-wrap items-center justify-between gap-3 text-sm">
						<div class="flex flex-wrap gap-3 text-secondary">
							<span>{t("comment.manage.id")}: {comment.id}</span>
							<span>{t("comment.manage.item")}: {comment.item}</span>
							{#if comment.updated}<span>{t("comment.edit.name")}</span>{/if}
						</div>

						<div class="flex gap-4">
							<button onclick={() => showHistory(comment)}><Icon name="lucide--history" title={t("comment.manage.history.title")} /></button>
							<button onclick={() => ((focusComment = comment), (deleteView = true))}><Icon name="lucide--trash" title={t("comment.manage.delete.title")} /></button>
							<button onclick={() => ((focusComment = comment), (purgeView = true))}><Icon name="lucide--trash-2" title={t("comment.manage.purge.title")} /></button>
						</div>
					</footer>
				</li>
			{/each}
		</ul>
	{:else if !loading}
		<div class="py-[12vh] text-center text-secondary font-bold">{t("comment.manage.empty")}</div>
	{/if}
</main>
