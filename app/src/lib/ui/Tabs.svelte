<script lang="ts" generics="Id extends string">
	/**
	 * A tab list with a roving tab stop: Tab reaches only the selected tab, and Left/Right,
	 * Home and End move between tabs and select them. The panel is the caller's; each tab
	 * says it controls `panelId`, and the panel should be labelled by `tabId(selected)`.
	 */
	let {
		tabs,
		selected = $bindable(),
		label,
		idPrefix,
		panelId
	}: {
		tabs: readonly { id: Id; label: string }[];
		selected: Id;
		label: string;
		idPrefix: string;
		panelId: string;
	} = $props();

	const buttons: HTMLButtonElement[] = $state([]);

	function onkeydown(event: KeyboardEvent, index: number) {
		const last = tabs.length - 1;
		const next =
			event.key === 'ArrowRight'
				? index === last
					? 0
					: index + 1
				: event.key === 'ArrowLeft'
					? index === 0
						? last
						: index - 1
					: event.key === 'Home'
						? 0
						: event.key === 'End'
							? last
							: -1;
		if (next < 0) return;
		event.preventDefault();
		selected = tabs[next].id;
		buttons[next]?.focus();
	}
</script>

<div class="tabs" role="tablist" aria-label={label}>
	{#each tabs as tab, index (tab.id)}
		<button
			bind:this={buttons[index]}
			role="tab"
			id={`${idPrefix}-${tab.id}`}
			aria-selected={selected === tab.id}
			aria-controls={panelId}
			tabindex={selected === tab.id ? 0 : -1}
			onclick={() => (selected = tab.id)}
			onkeydown={(event) => onkeydown(event, index)}>{tab.label}</button
		>
	{/each}
</div>

<style>
	/* A Windows 11 selector bar: the selected tab is brighter text over a short accent
	   indicator, so it no longer looks like a pressed toggle or a chosen card. */
	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		border-bottom: 1px solid var(--line-strong);
	}
	.tabs button {
		position: relative;
		padding: var(--space-3) var(--space-4);
		border: 0;
		border-radius: var(--radius-control);
		background: transparent;
		color: var(--text-muted);
		font-size: var(--type-small);
		font-weight: 500;
		line-height: 1;
	}
	.tabs button:hover {
		background: var(--surface-2);
		color: var(--text-body);
	}
	.tabs button[aria-selected='true'] {
		color: var(--text-bright);
	}
	.tabs button[aria-selected='true']::after {
		content: '';
		position: absolute;
		left: 50%;
		bottom: -1px;
		width: 1rem;
		height: 3px;
		border-radius: var(--radius-pill);
		background: var(--accent);
		transform: translateX(-50%);
	}
	@media (forced-colors: active) {
		.tabs button[aria-selected='true'] {
			outline: 2px solid Highlight;
		}
		.tabs button[aria-selected='true']::after {
			background: Highlight;
			forced-color-adjust: none;
		}
	}
</style>
