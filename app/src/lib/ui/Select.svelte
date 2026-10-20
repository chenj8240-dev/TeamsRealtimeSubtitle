<script lang="ts">
	import type { HTMLSelectAttributes } from 'svelte/elements';
	let { children, value = $bindable(), ...props }: HTMLSelectAttributes = $props();
</script>

<span class="ui-select">
	<select bind:value {...props}>{@render children?.()}</select>
	<svg
		width="12"
		height="12"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg
	>
</span>
