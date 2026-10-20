<script lang="ts">
	/** A language as a pressable card: its code and its name. Used for the interface language
	 *  and for the built-in demo's script language. */
	let {
		code,
		name,
		selected,
		disabled = false,
		onclick
	}: {
		/** Shown as written, so the caller decides the case. */
		code: string;
		name: string;
		selected: boolean;
		disabled?: boolean;
		onclick: () => void;
	} = $props();
</script>

<button class="lang ui-card" {disabled} aria-pressed={selected} {onclick}>
	<span class="lang-code">{code}</span>
	<span class="lang-name">{name}</span>
</button>

<style>
	/* The border, the fill and the selected wash are the shared .ui-card's. */
	.lang {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-3);
	}
	.lang-code {
		font-family: var(--font-mono);
		font-size: var(--type-small);
		font-weight: 500;
		line-height: 1;
		color: var(--text-muted);
	}
	.lang[aria-pressed='true'] .lang-code {
		color: var(--accent-soft);
		font-weight: 600;
	}
	.lang-name {
		font-size: var(--type-body);
		font-weight: 500;
		line-height: 1;
		color: var(--text-secondary);
	}
	.lang[aria-pressed='true'] .lang-name {
		color: var(--text-body);
		font-weight: 600;
	}
</style>
