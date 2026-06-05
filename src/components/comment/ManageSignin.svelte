<script lang="ts">
import { onMount } from "svelte";
import Icon from "$components/Icon.svelte";
import Modal from "$components/Modal.svelte";
import i18nit from "$i18n";

let {
	locale,
	oauth,
	reachBase = "https://panjinye.com/@/reach/",
	signedIn = false
}: {
	locale: string;
	oauth: Array<{ name: string; logo: string }>;
	reachBase?: string;
	signedIn?: boolean;
} = $props();

let translate = $derived(i18nit(locale));

let open = $state(false);

function reachHref(provider: string) {
	const referrer = `${location.pathname}${location.search}${location.hash}`;
	return `${reachBase}${provider}?referrer=${encodeURIComponent(referrer)}`;
}

onMount(() => {
	open = true;
});
</script>

<Modal bind:open>
	<div class="flex flex-col items-center gap-5">
		<h2>{translate("comment.manage.title")}</h2>
		<p class="max-w-72 text-center text-secondary text-sm">
			{signedIn ? translate("comment.manage.switchDescription") : translate("comment.manage.signinDescription")}
		</p>

		{#if signedIn}
			<a href="/@/depart" class="form-button">{translate("drifter.signout")}</a>
		{/if}

		{#if oauth.length}
			<div class="flex flex-col items-center gap-2 w-full">
				{#each oauth as provider}
					<a href={reachHref(provider.name)} class="flex items-center justify-center gap-2 w-full border-2 border-secondary py-1 px-2 rounded">
						<Icon size="0.95rem" name={provider.logo} />
						<span class="font-bold text-sm">{translate("oauth.signin", { provider: provider.name })}</span>
					</a>
				{/each}
			</div>
		{/if}

		<button class="form-button" onclick={() => (open = false)}>{translate("cancel")}</button>
	</div>
</Modal>

<section class="py-[18vh] text-center flex flex-col items-center gap-3">
	<h2>{translate("comment.manage.title")}</h2>
	<p class="text-secondary max-w-lg">
		{signedIn ? translate("comment.manage.switchDescription") : translate("comment.manage.signinDescription")}
	</p>
	{#if signedIn}
		<a href="/@/depart" class="form-button">{translate("drifter.signout")}</a>
	{/if}
	{#if oauth.length}
		<button class="form-button" onclick={() => (open = true)}>{translate("drifter.signin")}</button>
	{/if}
</section>
