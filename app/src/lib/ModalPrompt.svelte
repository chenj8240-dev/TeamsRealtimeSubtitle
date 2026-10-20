<script module lang="ts">
	// Open dialogs, oldest first. Each one listens on the window, so only the newest may act on
	// a key: a quit prompt can open over Settings, and with two listeners one Escape closed both
	// while the two focus cycles pulled Tab back and forth until Discard was out of reach.
	const openDialogs: symbol[] = [];
</script>

<script lang="ts">
	// Shared modal chrome: the focus cycle, the Escape key and the return of focus to whatever
	// opened it are written once here, because those are the parts an accessible dialog is
	// judged on and three separate implementations would drift.
	//
	// It carries the two decisions the operator must not miss — an unsaved transcript at quit,
	// and a recovery spool found at launch — and the settings panel, which is not a decision at
	// all but needs the same chrome and a wider box.

	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import ToolButton from './ui/ToolButton.svelte';

	interface Props {
		/** Used as the dialog's accessible name. */
		title: string;
		/** Escape, so a dialog is never a trap. Omit for one that has no safe dismissal. */
		onDismiss?: () => void;
		/** Names an × in the top corner that calls `onDismiss`. Only for a panel whose exit is
		 *  harmless (settings); the decision prompts keep their explicit verbs and stay bare,
		 *  so an anonymous × can never stand in for an answer. */
		dismissLabel?: string;
		/** A roomier box, for a panel of controls rather than a paragraph and three buttons.
		 *  The narrow default is a measure chosen for reading; controls are not read. */
		wide?: boolean;
		/** Keep tabbed panels stationary while their body scrolls independently. */
		stableHeight?: boolean;
		children: Snippet;
	}

	let {
		title,
		onDismiss,
		dismissLabel,
		wide = false,
		stableHeight = false,
		children
	}: Props = $props();

	const titleId = $props.id();

	let prompt = $state<HTMLDivElement | null>(null);
	const token = Symbol('dialog');

	// Answering the dialog puts focus back where it was taken from. Captured before the callers
	// focus their own default button, which they do from their own `onMount`.
	onMount(() => {
		openDialogs.push(token);
		const opener = document.activeElement as HTMLElement | null;
		prompt?.querySelector<HTMLElement>('button, input, select')?.focus();
		return () => {
			openDialogs.splice(openDialogs.indexOf(token), 1);
			opener?.focus?.();
		};
	});

	// `aria-modal` tells a screen reader to ignore what is behind the dialog, but nothing stops
	// the Tab key from walking into it — a keyboard operator would be typing into a session
	// they can no longer see. The cycle stays inside until the dialog answers.
	function focusable(): HTMLElement[] {
		if (!prompt) return [];
		return Array.from(
			prompt.querySelectorAll<HTMLElement>(
				'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
			)
		).filter((element) => element.tabIndex >= 0);
	}

	function onKeydown(event: KeyboardEvent) {
		if (openDialogs.at(-1) !== token) return;
		if (event.key === 'Escape' && onDismiss) {
			event.preventDefault();
			onDismiss();
			return;
		}
		if (event.key !== 'Tab') return;
		const stops = focusable();
		if (!stops.length) return;
		const first = stops[0];
		const last = stops[stops.length - 1];
		const active = document.activeElement as HTMLElement | null;
		// Focus that has already escaped the dialog — or has not entered it yet — is pulled
		// back to the end or the start of the cycle, whichever way Tab was going.
		if (!prompt?.contains(active)) {
			event.preventDefault();
			(event.shiftKey ? last : first).focus();
		} else if (event.shiftKey && active === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && active === last) {
			event.preventDefault();
			first.focus();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="scrim">
	<div
		class="prompt"
		class:wide
		class:stableHeight
		bind:this={prompt}
		role="dialog"
		aria-modal="true"
		aria-labelledby={titleId}
	>
		<div class="header">
			<h2 id={titleId}>{title}</h2>
			{#if onDismiss && dismissLabel}
				<ToolButton class="icon dismiss" aria-label={dismissLabel} onclick={onDismiss}>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.75"
						stroke-linecap="round"
						aria-hidden="true"
					>
						<path d="M5.5 5.5l13 13M18.5 5.5l-13 13" />
					</svg>
				</ToolButton>
			{/if}
		</div>
		{@render children()}
	</div>
</div>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: grid;
		place-items: center;
		padding: var(--space-5);
		background: var(--modal-scrim);
	}
	.prompt {
		/* 460px at 100%. In `em` because what makes this readable is its measure, and a
		   fixed pixel box at 225% is two words a line. */
		width: min(28.75em, 100%);
		/* The panels inside ask this box, not the window, how much room they have. */
		container: dialog / inline-size;
		max-height: 100%;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-5);
		/* A top-level surface, so it rounds by 8px where the controls inside it round by 4px,
		   and it casts the one flyout shadow the move-mode toolbar casts too. */
		border-radius: var(--radius-overlay);
		border: 1px solid var(--line-strong);
		background: var(--surface-1);
		box-shadow: var(--shadow-flyout);
	}
	/* 832px at 100%, and in `em` for the same reason as the narrow box: at 225% text scaling a
	   fixed pixel width turns a two-column row of controls into a column of clipped ones. */
	.prompt.wide {
		width: min(52em, 100%);
	}
	.prompt.stableHeight {
		height: min(48rem, calc(100dvh - 48px));
		overflow: hidden;
	}
	.prompt.stableHeight > :global(*) {
		flex-shrink: 0;
	}
	.header {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
	}
	h2 {
		flex: 1;
		margin: 0;
		font-size: var(--type-title);
		font-weight: 600;
		line-height: var(--leading-tight);
		color: var(--text-bright);
		text-wrap: balance;
	}
	/* The shared icon button, the same one as the toolbar's gear. Pulled into the corner
	   without inflating the header row. */
	.header :global(.dismiss) {
		margin: -4px -6px 0 0;
	}

	/* The bodies live in the caller's snippet, so their rules have to reach into it. */
	.prompt :global(p) {
		margin: 0;
		font-size: var(--type-body);
		line-height: var(--leading-body);
		color: var(--text-secondary);
		text-wrap: pretty;
	}
	/* The rule above outranks app.css's `.hint`, so a hint inside a dialog (the settings panel
	   has several) is given its small, muted face back here. */
	.prompt :global(p.note),
	.prompt :global(p.hint) {
		font-size: var(--type-small);
		color: var(--text-muted);
	}
	.prompt :global(p.error) {
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-control);
		border: 1px solid var(--danger-border);
		background: var(--danger-wash);
		color: var(--danger-soft);
		font-size: var(--type-body);
		word-break: break-word;
	}
	.prompt :global(code) {
		font-family: var(--font-mono);
		font-size: var(--type-caption);
		word-break: break-all;
	}
	.prompt :global(.actions) {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: 2px;
	}
	/* The answers are ToolButtons; the safe one takes the spare width. */
	.prompt :global(.actions .primary) {
		flex: 1 1 auto;
	}
</style>
