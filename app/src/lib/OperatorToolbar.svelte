<script lang="ts">
	import type { Snippet } from 'svelte';
	import ToolButton from './ui/ToolButton.svelte';
	import { t } from './i18n';
	import { isRunning, options, sessionStartedAt, sessionState } from './stores';
	import type { SessionState } from './types';

	/** The window's one bar: the session's actions on the left, its state and the settings on
	 *  the right. Windows already prints the app's name in the frame above it, so this bar spends
	 *  its width on the controls instead. */
	let {
		elapsed,
		settingsOpen,
		onOpenSettings,
		actions
	}: {
		/** The running session's clock, already formatted. */
		elapsed: string;
		settingsOpen: boolean;
		onOpenSettings: () => void;
		/** Start and Rehearse, or Stop: in the same bar as the status they change. */
		actions: Snippet;
	} = $props();

	// Not from the catalog: these are CSS class names, not words.
	const stateTone: Record<SessionState, string> = {
		idle: 'neutral',
		connecting: 'warn',
		running: 'live',
		reconnecting: 'warn',
		paused: 'warn',
		error: 'bad'
	};
</script>

<header class="toolbar">
	<!-- The app icon's mark (src-tauri/icons/source.svg), cropped to its middle and drawn
	     heavier so it survives 18 px. -->
	<span class="brand" aria-hidden="true">
		<svg
			width="18"
			height="18"
			viewBox="128 128 768 768"
			fill="none"
			stroke-width="84"
			stroke-linecap="round"
			stroke-linejoin="round"
			><path
				class="wave"
				d="M184 496 C222 496 232 344 280 344 C330 344 340 648 390 648 C436 648 444 428 486 428 C524 428 530 544 562 544 C586 544 592 496 620 496 L840 496"
			/><path class="line" d="M500 680 L840 680" /></svg
		>
	</span>
	<!-- The window's one h1, which every heading in either column sits under. The frame
	     already shows the name, so it is here for heading navigation only. -->
	<h1 class="sr-only">{$t.app.name}</h1>
	{@render actions()}
	<div class="pill {stateTone[$sessionState]}">
		<span class="pill-dot" aria-hidden="true"></span>
		<span class="pill-label"
			>{$sessionState === 'running' && $options.provider === 'ondevice'
				? $t.state.demo
				: $t.state[$sessionState]}</span
		>
		{#if $isRunning && $sessionStartedAt !== null}
			<span class="pill-time">{elapsed}</span>
		{/if}
	</div>
	<!-- Persistent access to caption, reading, history and app preferences: the one control in
	     the bar whose place never depends on what the session is doing. -->
	<ToolButton
		class="icon"
		aria-haspopup="dialog"
		aria-expanded={settingsOpen}
		aria-label={$t.settings.openLabel}
		onclick={onOpenSettings}
	>
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.75"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="3" />
			<path
				d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
			/>
		</svg>
	</ToolButton>
</header>

<style>
	/* Sized by its content, not a slot: at 225% the buttons are twice as tall, and when the
	   bar no longer fits on one line it wraps, keeping the status and the gear at the right. */
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-5);
		background: var(--surface-1);
	}
	/* The app icon in miniature, so it rounds by the icon's own proportion (224 of 1024) rather
	   than by a step of the radius scale, and the two read as one shape. */
	.brand {
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 21.875%;
		background: linear-gradient(var(--surface-2), var(--surface-0));
		border: 1px solid var(--line-strong);
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 0 0 auto;
	}
	.brand .wave {
		stroke: var(--accent);
	}
	.brand .line {
		stroke: var(--text-body);
	}
	/* Pushed to the far end, and kept there with the gear when the bar wraps. */
	.pill {
		display: flex;
		align-items: center;
		margin-left: auto;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2) var(--space-1) var(--space-2);
		border-radius: var(--radius-pill);
		flex: 0 0 auto;
	}
	.pill-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
	}
	/* One weight in every state: a pill that drops to 500 when it is paused or in error reads as
	   less urgent at exactly the moment it is more so. */
	.pill-label {
		font-size: var(--type-caption);
		font-weight: 600;
		line-height: 1;
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
	}
	.pill-time {
		font-family: var(--font-mono);
		font-size: var(--type-caption);
		font-weight: 500;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}
	.pill.neutral {
		background: var(--surface-2);
		border: 1px solid var(--line-strong);
	}
	.pill.neutral .pill-dot {
		background: var(--faint);
	}
	.pill.neutral .pill-label {
		color: var(--text-muted);
	}
	.pill.live {
		background: var(--accent-wash);
		border: 1px solid var(--accent-border);
	}
	.pill.live .pill-dot {
		background: var(--accent);
		box-shadow: 0 0 8px var(--accent);
		animation: breathe 2.4s ease-in-out infinite;
	}
	.pill.live .pill-label,
	.pill.live .pill-time {
		color: var(--accent-soft);
	}
	.pill.live .pill-time {
		font-weight: 600;
	}
	.pill.warn {
		background: var(--warn-wash);
		border: 1px solid var(--warn-border);
	}
	.pill.warn .pill-dot {
		background: var(--warn);
		animation: breathe 2.4s ease-in-out infinite;
	}
	.pill.warn .pill-label {
		color: var(--warn-soft);
	}
	.pill.bad {
		background: var(--danger-wash);
		border: 1px solid var(--danger-border);
	}
	.pill.bad .pill-dot {
		background: var(--danger);
	}
	.pill.bad .pill-label {
		color: var(--danger-soft);
	}

	@media (prefers-reduced-motion: reduce) {
		.pill-dot {
			animation: none;
		}
	}

	/* Live/idle/error is a dot colour plus a word; only the word survives a contrast theme, so
	   the dot stops pretending to carry state and the pill keeps a visible edge. */
	@media (forced-colors: active) {
		.pill {
			border: 1px solid CanvasText;
		}
		.pill-dot {
			display: none;
		}
	}
</style>
