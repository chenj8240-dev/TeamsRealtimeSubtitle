<script lang="ts">
	import type { Snippet } from 'svelte';

	/** One of a set of mutually exclusive choices, drawn as a card with an icon, a title and a
	 *  sentence, and a tick on the chosen one. */
	let {
		selected,
		disabled = false,
		title,
		desc,
		icon,
		onclick
	}: {
		selected: boolean;
		disabled?: boolean;
		title: string;
		desc: string;
		icon: Snippet;
		onclick: () => void;
	} = $props();
</script>

<button class="card ui-card" {disabled} aria-pressed={selected} {onclick}>
	<span class="card-icon" aria-hidden="true">{@render icon()}</span>
	<span class="card-body">
		<span class="card-title">{title}</span>
		<span class="card-desc">{desc}</span>
	</span>
	{#if selected}
		<span class="card-check" aria-hidden="true">
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.2"
				stroke-linecap="round"><path d="M4 12.5l5 5L20 6.5" /></svg
			>
		</span>
	{/if}
</button>

<style>
	/* The border, the fill and the selected wash are the shared .ui-card's; what is set here is
	   the card's layout and how its icon plate and title follow the selection. */
	.card {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-3);
		width: 100%;
	}
	.card-icon {
		width: 30px;
		height: 30px;
		border-radius: var(--radius-control);
		background: var(--surface-2);
		color: var(--text-muted);
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 0 0 auto;
	}
	.card[aria-pressed='true'] .card-icon {
		background: var(--accent-chip);
		color: var(--accent-soft);
	}
	.card-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.card-title {
		font-size: var(--type-label);
		font-weight: 600;
		line-height: var(--leading-tight);
		color: var(--text-secondary);
	}
	.card[aria-pressed='true'] .card-title {
		color: var(--text-body);
	}
	.card-desc {
		font-size: var(--type-small);
		line-height: var(--leading-snug);
		color: var(--text-muted);
		text-wrap: pretty;
	}
	.card-check {
		color: var(--accent);
		margin-left: auto;
		flex: 0 0 auto;
		display: flex;
	}
</style>
