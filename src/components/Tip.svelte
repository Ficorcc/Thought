<script lang="ts" module>
import { writable } from "svelte/store";
import Icon from "$components/Icon.svelte";

/** Mapping of tip types to corresponding icon identifiers */
const icons = {
	information: "lucide--info",
	success: "lucide--check-circle",
	question: "lucide--help-circle",
	warning: "lucide--alert-triangle",
	error: "lucide--x-circle"
} as const;

/** Type definition for a tip object */
type Tip = { id: number; type: keyof typeof icons; content: string };

let nextTipId = 0;

/** Global reactive store containing array of active tips */
const tips = writable<Tip[]>([]);

/**
 * Remove a specific tip from the active tips list
 * @param tip - The tip object to remove
 */
const Close = (tip: Tip) => tips.update(list => list.filter(item => item.id !== tip.id));

/**
 * Public API function to display a new tip
 * This function can be imported and called from other components
 * @param type - Type of tip
 * @param content - Text content to display in the tip
 */
export function pushTip(type: keyof typeof icons, content: string): void {
	const tip = { id: nextTipId++, type, content };

	// Add tip to the reactive store (triggers UI update)
	tips.update(list => [...list, tip]);

	// Auto-remove tip after 2.5 seconds for better UX
	setTimeout(() => Close(tip), 2500);
}
</script>

<figure class="fixed top-0 start-0 w-full h-full flex flex-col pe-5 z-5000 pointer-events-none overflow-hidden">
	{#each $tips as tip (tip.id)}
		<section class="relative flex items-center gap-2 ms-auto mt-7 border-2 border-weak rounded-sm py-4 px-3 w-xs bg-background shadow-md pointer-events-auto">
			<Icon name={icons[tip.type]} />
			<p>{tip.content}</p>
			<span class="ms-auto"><button onclick={() => Close(tip)}><Icon name="lucide--x" /></button></span>
		</section>
	{/each}
</figure>
