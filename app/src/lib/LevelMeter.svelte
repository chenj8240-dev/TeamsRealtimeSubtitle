<script lang="ts">
	import type { AudioLevel } from './types';

	interface Props {
		level: AudioLevel;
		label: string;
		/** Taller track and a brighter label, for the running session's "Audio arriving" rail. */
		active?: boolean;
	}

	let { level, label, active = false }: Props = $props();

	// Map RMS (0..1) to a fraction with a gentle curve so quiet speech is visible. Levels arrive
	// ~10–20×/s, so both bars move via `transform` only — animating width or left would force a
	// layout pass on every event.
	const fill = $derived(Math.min(1, Math.sqrt(Math.max(0, level.rms))));
	const peak = $derived(Math.min(1, Math.sqrt(Math.max(0, level.peak))));

	const labelId = $props.id();
	// What the meter reports to assistive technology: the same curve the bar draws, in steps
	// of ten, so the attribute changes rarely enough to be worth reading.
	const coarse = $derived(Math.round(fill * 10) * 10);
</script>

<div class="meter" class:active>
	<span class="label" id={labelId}>{label}</span>
	<!-- A meter, not a live region: assistive technology reads the level when asked instead of
	     being told 20 times a second. `aria-valuenow` is rounded to a tenth for the same
	     reason — the exact value is noise, "about half" is the information. -->
	<div
		class="track"
		role="meter"
		aria-labelledby={labelId}
		aria-valuemin={0}
		aria-valuemax={100}
		aria-valuenow={coarse}
		aria-valuetext="{coarse}%"
	>
		<div class="fill" style="transform: scaleX({fill.toFixed(4)})"></div>
		{#if peak > 0}
			<div class="peak" style="transform: translateX({(peak * 100).toFixed(2)}%)"></div>
		{/if}
		<div class="hatch"></div>
	</div>
</div>

<style>
	.meter {
		display: grid;
		/* In `em` so the label keeps its column and the bar keeps the rest, whatever the
		   operator's text size. Wide enough for the longest label any catalog puts here on one
		   line — German's RAUMMIKROFON, at ~101px — because that is the constraint a space can
		   no longer solve: "Micro de la salle" wraps to two lines and fits a narrow column, a
		   German compound has nowhere to break and painted straight across the bar. */
		grid-template-columns: 6.75em 1fr;
		align-items: center;
		gap: var(--space-2);
	}
	.label {
		font-size: var(--type-caption);
		font-weight: 500;
		line-height: 1;
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
		color: var(--text-muted);
		/* Last resort, not the plan: the column above is sized to hold the labels we ship, and
		   this only decides what a longer one does. Breaking mid-word is ugly — but a label
		   drawn across the level meter is worse, and silent, which is how the German one got
		   as far as a screenshot. `hyphens: auto` is deliberately not used: it needs a
		   hyphenation dictionary the WebView may not have, so it fails to exactly this. */
		overflow-wrap: break-word;
	}
	.track {
		position: relative;
		height: 8px;
		border-radius: var(--radius-control);
		background: var(--surface-2);
		border: 1px solid var(--line);
		overflow: hidden;
	}
	.meter.active .track {
		height: 10px;
	}
	/* Full-width bar scaled from the left edge: the gradient compresses with it, so the tip is
	   amber at any level, exactly as a width-driven fill would render. */
	.fill {
		position: absolute;
		inset: 0;
		transform-origin: left center;
		transform: scaleX(0);
		background: linear-gradient(90deg, var(--accent), var(--accent) 78%, var(--warn));
		transition: transform 60ms linear;
		will-change: transform;
	}
	/* Full-width carrier translated by a percentage of the track; the marker rides its edge. */
	.peak {
		position: absolute;
		inset: 0;
		will-change: transform;
	}
	.peak::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 2px;
		background: var(--text-body);
		opacity: 0.7;
	}
	/* Segment ticks, drawn over the fill so the meter reads as discrete steps. */
	.hatch {
		position: absolute;
		inset: 0;
		background: repeating-linear-gradient(90deg, transparent 0 5px, var(--surface-0) 5px 7px);
	}

	@media (prefers-reduced-motion: reduce) {
		.fill {
			transition: none;
		}
	}

	/* Under a contrast theme the gradient is not recoloured and the segment ticks are drawn in
	   a surface colour that no longer matches the surface, so the bar reads as a solid block of
	   the wrong colour. Paint it in the system highlight instead and drop the ticks. */
	@media (forced-colors: active) {
		.fill {
			forced-color-adjust: none;
			background: Highlight;
		}
		.hatch {
			display: none;
		}
		.track {
			border-color: CanvasText;
		}
	}
</style>
