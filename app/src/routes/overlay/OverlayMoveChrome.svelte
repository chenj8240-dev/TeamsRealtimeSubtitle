<script lang="ts">
	import { t } from '#lib/i18n/index.js';
	import { OVERLAY_FONT_MAX, OVERLAY_FONT_MIN } from '#lib/appearance.js';
	import Stepper from '#lib/ui/Stepper.svelte';
	import ToolButton from '#lib/ui/ToolButton.svelte';

	/** Move mode's placement chrome. The overlay window *is* the caption region, so the chrome
	 *  hugs the window edges rather than being drawn inside a larger screen. Everything here is
	 *  pointer-events:none except the toolbar, so the stage behind stays the drag region. */
	let {
		fontSize,
		width,
		height,
		onBump,
		onSnap,
		onLock
	}: {
		fontSize: number;
		/** The window's own size, which is the caption region's. */
		width: number;
		height: number;
		onBump: (delta: number) => void;
		onSnap: () => void;
		onLock: () => void;
	} = $props();
</script>

<div class="region" aria-hidden="true">
	<span class="handle tl"></span>
	<span class="handle tr"></span>
	<span class="handle bl"></span>
	<span class="handle br"></span>
	<span class="edge top"></span>
	<span class="edge bottom"></span>
</div>

<!-- Dropped in a short region: there the chrome fills the window and the placeholder would
     run under the toolbar, which reads worse than no placeholder at all. -->
{#if height >= 340}
	<div class="placeholder">
		<p>{$t.overlay.placeholder(fontSize)}</p>
	</div>
{/if}

<div class="chrome">
	<div class="drag-pill">
		<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<circle cx="9" cy="6" r="1.6" />
			<circle cx="15" cy="6" r="1.6" />
			<circle cx="9" cy="12" r="1.6" />
			<circle cx="15" cy="12" r="1.6" />
			<circle cx="9" cy="18" r="1.6" />
			<circle cx="15" cy="18" r="1.6" />
		</svg>
		<span class="drag-label">{$t.overlay.dragToPlace}</span>
		<span class="drag-size">{width} × {height}</span>
	</div>

	<div class="toolbar">
		<div class="mode">
			<span class="mode-title">{$t.overlay.moveMode}</span>
			<span class="mode-sub">{$t.overlay.paused}</span>
			<!-- The operator's own controls can be hidden under this window, so the way out has
			     to be printed where the operator is already looking. -->
			<span class="keys">
				<kbd class="ui-kbd">{$t.overlay.keyEnter}</kbd>
				{$t.overlay.keysLocks} · <kbd class="ui-kbd">{$t.overlay.keyEscape}</kbd>
				{$t.overlay.keysCancels} · <kbd class="ui-kbd">{$t.overlay.keyArrows}</kbd>
				{$t.overlay.keysNudge}
			</span>
		</div>
		<span class="divider"></span>
		<Stepper
			label={$t.overlay.size}
			value={fontSize}
			min={OVERLAY_FONT_MIN}
			max={OVERLAY_FONT_MAX}
			step={2}
			unit="px"
			decreaseLabel={$t.overlay.smaller}
			increaseLabel={$t.overlay.larger}
			onchange={(size) => onBump(size - fontSize)}
		/>
		<span class="divider"></span>
		<ToolButton onclick={onSnap}>{$t.overlay.snapToBottom}</ToolButton>
		<ToolButton variant="primary" onclick={onLock}>
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
				<rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
				<path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
			</svg>
			{$t.overlay.lock}
		</ToolButton>
	</div>
</div>

<style>
	.region {
		position: absolute;
		inset: 0;
		border: 2px solid var(--accent);
		background: var(--accent-wash);
		pointer-events: none;
	}
	/* Affordances only: the resize itself is the OS window edge-drag. */
	.handle {
		position: absolute;
		width: 11px;
		height: 11px;
		border-radius: var(--radius-control);
		background: var(--accent);
	}
	.handle.tl {
		left: 3px;
		top: 3px;
	}
	.handle.tr {
		right: 3px;
		top: 3px;
	}
	.handle.bl {
		left: 3px;
		bottom: 3px;
	}
	.handle.br {
		right: 3px;
		bottom: 3px;
	}
	.edge {
		position: absolute;
		left: 50%;
		transform: translateX(-50%);
		width: 34px;
		height: 9px;
		border-radius: var(--radius-control);
		background: color-mix(in srgb, var(--accent) 55%, transparent);
	}
	.edge.top {
		top: 3px;
	}
	.edge.bottom {
		bottom: 3px;
	}
	/* Stands in for a caption while the region is being placed, so it previews the chosen
	   face and size together — which is the moment an operator can still act on either. It is
	   drawn as the room will see a caption, in the caption's own ink, halo and backing, and
	   where captions sit: a pale ghost of one vanished on a white slide, just when the operator
	   is judging whether captions will read there. */
	.placeholder {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 56px;
		display: flex;
		justify-content: center;
		padding: 0 var(--space-6);
		pointer-events: none;
	}
	/* The backing hugs the text: it shows the scrim's colour and strength behind the face,
	   and a window-wide band would hide the very slide the region is being placed over. */
	.placeholder p {
		margin: 0;
		padding: var(--space-2) var(--space-5);
		border-radius: var(--radius-overlay);
		background: var(--caption-scrim-strong);
		font-family: var(--caption-face);
		font-weight: 600;
		/* Never larger than the caption it stands in for, and never so large it wraps to
		   nothing in a short region. */
		font-size: min(34px, var(--fs));
		line-height: 1.34;
		text-align: center;
		text-wrap: pretty;
		color: var(--caption-ink);
		text-shadow:
			0 1px 3px var(--caption-halo-tight),
			0 2px 14px var(--caption-halo-soft);
	}

	/* The pill and toolbar float just inside the top edge: in the real window there is no
	   surrounding screen to hang them on. */
	/* Spans the window and centres its children, rather than sitting at `left: 50%`: a box
	   hung from the middle only has half the window to lay out in, so the toolbar's buttons
	   wrapped long before the window was narrow. */
	.chrome {
		position: absolute;
		top: 14px;
		left: 0;
		right: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3);
		pointer-events: none;
	}
	/* Stays transparent to the pointer so dragging it drags the window (the stage below
	   carries data-tauri-drag-region). */
	.drag-pill {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-control);
		background: var(--accent);
		color: var(--on-accent);
		pointer-events: none;
	}
	.drag-label {
		font-weight: 600;
		font-size: var(--type-small);
		line-height: 1;
	}
	.drag-size {
		font-family: var(--font-mono);
		font-weight: 500;
		font-size: var(--type-small);
		line-height: 1;
		font-variant-numeric: tabular-nums;
		opacity: 0.72;
	}

	.toolbar {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-3);
		border: 1px solid var(--line-hover);
		/* A flyout over the slide, so it takes a flyout's corners and the shadow dialogs cast. */
		border-radius: var(--radius-overlay);
		/* Nearly opaque, because what sits behind this window is a slide nobody controls: at
		   0.92 a white slide lifted the panel enough to cost the dimmest text its 4.5:1. At
		   0.96 the panel over white stays darker than --surface-2, so every text level that
		   passes there passes here; `palette.test.ts` holds it to that. */
		background: color-mix(in srgb, var(--surface-0) 96%, transparent);
		box-shadow: var(--shadow-flyout);
		color: var(--text-body);
		/* One line while it fits, which is what the operator scans; a window narrower than
		   the toolbar still wraps it rather than cutting it off. */
		max-width: calc(100% - var(--space-5));
		/* Clickable while the rest of the stage drags the window. */
		pointer-events: auto;
		cursor: default;
	}
	.mode {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding-right: var(--space-1);
	}
	.mode-title {
		font-weight: 600;
		font-size: var(--type-caption);
		line-height: 1;
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
		color: var(--warn);
	}
	.mode-sub {
		font-size: var(--type-small);
		line-height: 1;
		color: var(--text-muted);
	}
	/* A row of key caps and the words between them, so each cap is laid out as a box of its
	   own rather than spilling out of a line box. */
	.keys {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		margin-top: var(--space-1);
		font-family: var(--font-mono);
		font-size: var(--type-caption);
		line-height: 1;
		color: var(--text-muted);
		white-space: nowrap;
	}
	/* A vertical rule as tall as the toolbar. `height: auto` undoes the horizontal rule the
	   shared `.divider` in app.css draws, which would otherwise pin it at 1px. */
	.divider {
		align-self: stretch;
		width: 1px;
		height: auto;
		background: var(--line-strong);
	}

	/* Windows contrast themes. The placement preview keeps its own colours, like the audience
	   view it stands for; the toolbar, which is chrome, keeps the system palette (Lock drops its
	   gradient in `app.css`, with every other primary). */
	@media (forced-colors: active) {
		.placeholder,
		.region,
		.handle,
		.edge {
			forced-color-adjust: none;
		}
	}
</style>
