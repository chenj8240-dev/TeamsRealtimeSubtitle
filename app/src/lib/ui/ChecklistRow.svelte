<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * One row of the pre-flight checklist: a mark saying whether the check has passed, a
	 * title and a sentence, and an optional action at the end of the row.
	 */
	let {
		status,
		glyph = '',
		title,
		titleFor,
		desc,
		descId,
		warn = false,
		pending = false,
		description,
		action
	}: {
		/** `ok` draws a tick, `wait` an amber dot, `neutral` the `glyph`. */
		status: 'ok' | 'wait' | 'neutral';
		glyph?: string;
		title: string;
		/** Render the title as the label of this field. */
		titleFor?: string;
		desc?: string;
		descId?: string;
		/** The sentence describes something that still needs doing. */
		warn?: boolean;
		/** The row holds a form that wraps: align to the top rather than a shifting centre. */
		pending?: boolean;
		/** Rich content in place of `desc`. */
		description?: Snippet;
		action?: Snippet;
	} = $props();
</script>

<div class="check-row" class:pending>
	{#if status === 'ok'}
		<span class="mark ok" aria-hidden="true">
			<svg
				width="12"
				height="12"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.6"
				stroke-linecap="round"
				aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" /></svg
			>
		</span>
	{:else if status === 'wait'}
		<span class="mark wait" aria-hidden="true"><span class="dot"></span></span>
	{:else}
		<span class="mark neutral" aria-hidden="true">{glyph}</span>
	{/if}
	<div class="check-body">
		{#if titleFor}
			<label class="check-title" for={titleFor}>{title}</label>
		{:else}
			<span class="check-title">{title}</span>
		{/if}
		<span class="check-desc" class:warn id={descId}>
			{#if description}{@render description()}{:else}{desc}{/if}
		</span>
	</div>
	{#if action}{@render action()}{:else}<span></span>{/if}
</div>

<style>
	.check-row {
		display: grid;
		grid-template-columns: 24px 1fr auto;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-4) 0;
		border-bottom: 1px solid var(--line);
	}
	.check-row.pending {
		align-items: start;
	}
	.mark {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.check-row.pending .mark {
		margin-top: 3px;
	}
	.mark.ok {
		background: var(--accent-chip);
		color: var(--accent);
	}
	.mark.wait {
		background: var(--warn-chip);
		color: var(--warn);
	}
	.mark.wait .dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
	}
	.mark.neutral {
		background: var(--surface-2);
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-size: var(--type-caption);
		font-weight: 500;
		line-height: 1;
	}
	.check-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.check-title {
		font-size: var(--type-label);
		font-weight: 500;
		line-height: var(--leading-tight);
	}
	.check-desc {
		font-size: var(--type-small);
		line-height: var(--leading-snug);
		color: var(--text-muted);
		/* At the window's minimum size and 225% text, German's "Anmeldeinformationsverwaltung"
		   alone is wider than the column. */
		overflow-wrap: anywhere;
	}
	.check-desc.warn {
		color: var(--warn);
	}
	/* The tighter checklist rhythm the stage adopts near the window's minimum height. */
	@media (max-height: 740px) {
		.check-row {
			padding: var(--space-3) 0;
		}
	}
</style>
