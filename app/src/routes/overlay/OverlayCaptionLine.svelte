<script lang="ts">
	import { captionDirection } from '#lib/languages.js';
	import { captionReach, firstOffsetOnLine, fitCaptionTail } from '#lib/captionLayout.js';
	let {
		stable = false,
		muted = false,
		lead,
		text,
		interim,
		height,
		fontKey,
		language,
		onTrim
	}: {
		stable?: boolean;
		/** Secondary text — the original speech under a translation — in the dimmed ink. */
		muted?: boolean;
		lead: string;
		text: string;
		interim: boolean;
		height: number;
		fontKey: string;
		language: string;
		/** Stable reading: drop this many characters from the start of `lead`. */
		onTrim?: (chars: number) => void;
	} = $props();
	let fullHeight = $state(0);
	let lineHeight = $state(1);
	const visibleRows = $derived(Math.max(0, Math.floor(height / lineHeight)));
	const stableHeight = $derived(visibleRows * lineHeight);
	const scrollOffset = $derived(
		Math.max(0, Math.round(fullHeight / lineHeight) - visibleRows) * lineHeight
	);
	let width = $state(0);
	let probe: HTMLParagraphElement;
	let paragraph = $state<HTMLParagraphElement | null>(null);
	// One string, so the stable paragraph is a single text node the trim below can measure.
	const flow = $derived(`${lead}${lead && text ? ' ' : ''}${text}`);

	// Stable reading is one paragraph holding the session's context, laid out again on every
	// caption, so it cannot be allowed to grow for a whole event. Once it runs well past the
	// viewport, everything above the last `KEEP_HIDDEN_LINES` hidden lines is handed back to be
	// dropped. The cut is at a rendered line start, and text from a line start wraps exactly as
	// it did, so no visible line moves. What is kept still covers a window resized far taller.
	const TRIM_AFTER_LINES = 180;
	const KEEP_HIDDEN_LINES = 60;
	$effect(() => {
		// Re-checked as the paragraph grows, but measured directly: the bound height lags a
		// trim until its observer fires, and trimming against it would cut twice.
		void fullHeight;
		if (!stable || !onTrim || !paragraph || lineHeight <= 1) return;
		const lines = Math.round(paragraph.getBoundingClientRect().height / lineHeight);
		const hidden = lines - visibleRows;
		if (hidden < TRIM_AFTER_LINES) return;
		const node = Array.from(paragraph.childNodes).find(
			(child): child is Text => child.nodeType === Node.TEXT_NODE
		);
		if (!node) return;
		const top = paragraph.getBoundingClientRect().top;
		const range = document.createRange();
		const offset = firstOffsetOnLine(
			node.length,
			(i) => {
				range.setStart(node, i);
				range.setEnd(node, i + 1);
				return Math.round((range.getBoundingClientRect().top - top) / lineHeight);
			},
			hidden - KEEP_HIDDEN_LINES
		);
		// Only the context is trimmed; a single turn longer than all of this stays whole.
		if (offset > 0 && offset <= lead.length) onTrim(offset);
	});
	let fitted = $state('');
	const normalizedText = $derived(text.replace(/\s+/g, ' ').trim());
	const live = $derived(fitted.length <= normalizedText.length ? fitted : normalizedText);
	const prefix = $derived(
		fitted.length > normalizedText.length ? fitted.slice(0, -normalizedText.length).trimEnd() : ''
	);
	// Read once per font rather than once per caption: a computed-style read after the probe's
	// last layout forces style to be recalculated.
	$effect(() => {
		void fontKey;
		void language;
		if (!probe || width <= 0) return;
		lineHeight = parseFloat(getComputedStyle(probe).lineHeight) || 1;
	});
	$effect(() => {
		// Font loading and resizing must refit even when no new caption arrives.
		void fontKey;
		void language;
		if (!probe || width <= 0 || stable) return;
		fitted = fitCaptionTail(
			`${lead} ${text}`,
			(candidate) => {
				probe.textContent = candidate;
				if (interim) {
					const caret = document.createElement('span');
					caret.style.cssText = 'display:inline-block;width:14px;height:.86em;vertical-align:-1px';
					probe.append(caret);
				}
				return probe.getBoundingClientRect().height <= height;
			},
			captionReach(width, height, lineHeight)
		);
		probe.textContent = '';
	});
</script>

<div
	dir={captionDirection(language)}
	lang={language}
	class="text-region"
	class:stable
	bind:clientWidth={width}
	style:max-height="{height}px"
>
	<p class="line probe" bind:this={probe} aria-hidden="true"></p>
	{#if stable}
		<div class="stable-viewport" style:height="{stableHeight}px">
			<p
				class="line"
				lang={language}
				bind:this={paragraph}
				bind:clientHeight={fullHeight}
				style:transform="translateY(-{scrollOffset}px)"
			>
				{flow}
			</p>
		</div>
	{:else}
		<!-- prettier-ignore -->
		<p class="line" lang={language} class:final={!interim} class:muted>{#if prefix}<span class="lead">{prefix}</span>{' '}{/if}{live}{#if interim && fitted}<span class="caret"></span>{/if}</p>
	{/if}
</div>

<style>
	.stable {
		align-self: flex-start;
	}
	.stable .line {
		text-align: start;
	}
	.stable-viewport {
		overflow: hidden;
	}
	.text-region {
		position: relative;
		width: 100%;
		min-width: 0;
		overflow: hidden;
	}
	.line {
		margin: 0;
		font-weight: 600;
		font-size: inherit;
		line-height: 1.34;
		letter-spacing: -0.005em;
		text-align: center;
		color: var(--caption-ink);
		overflow-wrap: anywhere;
		white-space: normal;
		text-shadow:
			0 1px 3px var(--caption-halo-tight),
			0 2px 14px var(--caption-halo-soft);
	}
	.probe {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		visibility: hidden;
		pointer-events: none;
	}
	.final {
		color: var(--caption-ink-final);
	}
	.lead {
		color: var(--caption-ink-lead);
	}
	.muted {
		color: var(--caption-ink-lead);
		font-weight: 500;
	}
	.caret {
		display: inline-block;
		width: 4px;
		height: 0.86em;
		margin-inline-start: 10px;
		vertical-align: -1px;
		background: var(--accent);
		animation: blink 1.1s steps(1) infinite;
	}
</style>
