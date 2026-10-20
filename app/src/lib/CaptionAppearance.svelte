<script lang="ts">
	import CaptionPreview from './CaptionPreview.svelte';
	import Select from './ui/Select.svelte';
	import Stepper from './ui/Stepper.svelte';
	import ToolButton from './ui/ToolButton.svelte';
	import { t, localeTag } from './i18n';
	import {
		appearance,
		overlayFontSize,
		overlayCaptionFace,
		overlayPalette,
		overlayContrast
	} from './stores';
	import {
		DEFAULT_APPEARANCE,
		OVERLAY_FONT_MAX,
		OVERLAY_FONT_MIN,
		sameAppearance
	} from './appearance';
	import {
		CAPTION_CONTRAST_TARGET,
		SCRIM_OPACITY_MIN,
		SCRIM_OPACITY_MAX,
		SCRIM_SWATCHES,
		TEXT_SWATCHES
	} from './captionColour';
	import { captionFaceStack } from './captionFont';
	import type { CaptionFaceId } from './captionFont';
	import type { OverlayController } from './overlayController.svelte';
	let {
		heading,
		overlay,
		compact = false
	}: { heading: string; overlay: OverlayController; compact?: boolean } = $props();
	const idBase = $props.id();
	const contrastId = `${idBase}-contrast`;
	/** Whether anything in the overlay's appearance has been changed from what it ships with.
	 *  Drives the reset button's disabled state, so the control also answers the question
	 *  "have I changed anything?" — which is the one an operator has after an hour of
	 *  adjusting and no memory of where they started. */
	const overlayAtDefaults = $derived(sameAppearance($appearance, DEFAULT_APPEARANCE));

	/** The achieved ratio, written the way the interface language writes numbers — 5.7 in
	 *  English, 5,7 in French. */
	const contrastReading = $derived(
		$overlayContrast.worst.toLocaleString($localeTag, {
			minimumFractionDigits: 1,
			maximumFractionDigits: 1
		})
	);
	const contrastTarget = $derived(
		CAPTION_CONTRAST_TARGET.toLocaleString($localeTag, {
			minimumFractionDigits: 1,
			maximumFractionDigits: 1
		})
	);
</script>

<!-- Rendered in two places on purpose. In the running rail, because the size is what gets
	     nudged mid-session when someone at the back cannot read; and in the settings panel,
	     because the whole look is chosen before a room fills, and an operator should not have
	     to start a session — or pay for one — to choose a typeface. One component over one set
	     of stores, so the two views cannot disagree about what the overlay is wearing.

	     The heading is a parameter rather than fixed: in the rail this sits under "Overlay"
	     among the live controls, while in the panel it names itself against the other
	     preferences. -->
<h2 class="kicker">{heading}</h2>
{#if !compact}<CaptionPreview {overlay} part="presets" />{/if}
<div class="appearance-layout" class:compact>
	<div class="appearance-controls">
		<Stepper
			label={$t.overlayControls.captionSize}
			value={$overlayFontSize}
			min={OVERLAY_FONT_MIN}
			max={OVERLAY_FONT_MAX}
			step={2}
			unit="px"
			decreaseLabel={$t.overlayControls.smaller}
			increaseLabel={$t.overlayControls.larger}
			onchange={overlay.setFont}
		/>
		<label class="face-label"
			>{$t.overlayControls.captionFace}
			<Select
				value={$overlayCaptionFace}
				onchange={(e) => overlay.setCaptionFace(e.currentTarget.value as CaptionFaceId)}
			>
				<!-- Each option is set in the face it names, so the list is its own preview.
				     The names are proper nouns and stay untranslated; only the note on the
				     bundled default says anything, and it is the one thing that needs to. -->
				{#each overlay.captionFaces as face (face.id)}
					<option value={face.id} style="font-family: {captionFaceStack(face.id)}">
						{face.bundled ? $t.overlayControls.faceDefault(face.label) : face.label}
					</option>
				{/each}
			</Select>
		</label>
		<div class="palette-options">
			{#each ['text', 'scrim'] as role (role)}
				<div
					role="group"
					aria-label={role === 'text'
						? $t.overlayControls.captionColour
						: $t.overlayControls.scrimColour}
				>
					<span class="swatch-label"
						>{role === 'text'
							? $t.overlayControls.captionColour
							: $t.overlayControls.scrimColour}</span
					>
					<div class="swatches">
						{#each role === 'text' ? TEXT_SWATCHES : SCRIM_SWATCHES as swatch (swatch.hex)}
							<button
								class="colour-choice"
								style:background={swatch.hex}
								aria-label={$t.overlayControls.swatch[swatch.name]}
								aria-pressed={(role === 'text' ? $overlayPalette.text : $overlayPalette.scrim) ===
									swatch.hex}
								onclick={() => overlay.setPalette({ [role]: swatch.hex })}
							></button>
						{/each}
					</div>
				</div>
			{/each}
		</div>
		<div class="colour-row">
			<label class="swatch">
				<span class="swatch-label">{$t.overlayControls.captionColour} · {$t.design.custom}</span>
				<input
					type="color"
					value={$overlayPalette.text}
					aria-describedby={contrastId}
					oninput={(e) => overlay.setPalette({ text: e.currentTarget.value })}
				/>
			</label>
			<label class="swatch">
				<span class="swatch-label">{$t.overlayControls.scrimColour} · {$t.design.custom}</span>
				<input
					type="color"
					value={$overlayPalette.scrim}
					aria-describedby={contrastId}
					oninput={(e) => overlay.setPalette({ scrim: e.currentTarget.value })}
				/>
			</label>
		</div>
		<!-- Stepped in whole percent, the unit it is printed in, rather than in the stored
		     fraction: the steps and the bounds are then integers, not sums of 0.05. -->
		<Stepper
			label={$t.overlayControls.scrimOpacity}
			value={Math.round($overlayPalette.scrimOpacity * 100)}
			min={Math.round(SCRIM_OPACITY_MIN * 100)}
			max={Math.round(SCRIM_OPACITY_MAX * 100)}
			step={5}
			format={(percent) => `${percent}%`}
			decreaseLabel={$t.overlayControls.weakerScrim}
			increaseLabel={$t.overlayControls.strongerScrim}
			onchange={(percent) => overlay.setPalette({ scrimOpacity: percent / 100 })}
		/>
		<!-- Not a live region on purpose: this changes on every step of a colour drag, and
	     `docs/accessibility.md` keeps announcements for things worth interrupting a
	     reader for. It is the description of the controls instead, so it is read on
	     arrival at the one moment it is worth hearing. -->
		<p class="contrast" class:warn={!$overlayContrast.passes} id={contrastId}>
			<span class="contrast-ratio">{$t.overlayControls.contrast(contrastReading)}</span>
			<span class="contrast-note">
				{$overlayContrast.passes
					? $t.overlayControls.contrastOk
					: $t.overlayControls.contrastLow(
							$t.overlayControls.contrastStep[$overlayContrast.worstStep],
							contrastTarget
						)}
			</span>
		</p>

		<ToolButton
			variant="ghost"
			size="sm"
			disabled={overlayAtDefaults}
			onclick={overlay.resetOverlayAppearance}
			aria-label={$t.overlayControls.resetLabel}
		>
			{$t.overlayControls.reset}
		</ToolButton>
	</div>
	{#if !compact}<CaptionPreview {overlay} />{/if}
</div>

<style>
	.face-label {
		display: grid;
		gap: var(--space-2);
		font-size: var(--type-small);
		color: var(--text-secondary);
	}
	.appearance-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: var(--space-5);
		align-items: start;
	}
	.appearance-layout.compact {
		grid-template-columns: minmax(0, 1fr);
	}
	.appearance-controls {
		display: grid;
		gap: var(--space-3);
	}
	/* The controls and the preview share a row until the settings dialog is too narrow for
	   both. Asked of the dialog (ModalPrompt's `dialog` container) in `em`, so it follows the
	   operator's text size; a viewport query in px fired at the wrong width at 225%. In the
	   rail there is no such container, and `compact` already stacks them. */
	@container dialog (max-width: 40em) {
		.appearance-layout {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	.palette-options {
		display: grid;
		gap: var(--space-3);
	}
	.swatches {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}
	.colour-choice {
		width: var(--control-sm);
		height: var(--control-sm);
		border: 1px solid var(--line-hover);
		border-radius: var(--radius-control);
		forced-color-adjust: none;
	}
	/* Chosen is drawn inside the swatch — a mint ring, parted from the colour by a dark one so it
	   shows on white and on black alike — and never outside it, where the focus ring goes. The
	   two used to be the same outline, so a keyboard operator could not tell which swatch was
	   chosen and which was merely focused. */
	.colour-choice[aria-pressed='true'] {
		box-shadow:
			inset 0 0 0 2px var(--accent-soft),
			inset 0 0 0 4px var(--surface-0);
	}
	.kicker {
		flex: 0 0 auto;
	}
	.colour-row {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1fr;
		gap: var(--space-2);
	}
	.swatch {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-2);
		border-radius: var(--radius-control);
		border: 1px solid var(--line-strong);
		background: var(--surface-1);
		cursor: pointer;
	}
	.swatch:hover {
		border-color: var(--line-hover);
	}
	.swatch-label {
		font-size: var(--type-small);
		line-height: var(--leading-tight);
		color: var(--text-secondary);
	}
	.swatch input[type='color'] {
		flex: 0 0 auto;
		width: 26px;
		height: 20px;
		padding: 0;
		border: 1px solid var(--line-hover);
		border-radius: var(--radius-control);
		background: none;
		cursor: pointer;
	}
	.swatch input[type='color']::-webkit-color-swatch-wrapper {
		padding: 0;
	}
	.swatch input[type='color']::-webkit-color-swatch {
		border: none;
		border-radius: var(--radius-control);
	}
	.contrast {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1);
		margin: 0;
	}
	.contrast-ratio {
		font-family: var(--font-mono);
		font-size: var(--type-small);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		color: var(--text-secondary);
	}
	.contrast-note {
		font-size: var(--type-caption);
		line-height: var(--leading-snug);
		color: var(--text-muted);
	}
	.contrast.warn .contrast-ratio {
		color: var(--warn);
	}
	.contrast.warn .contrast-note {
		color: var(--warn-soft);
	}
	@media (forced-colors: active) {
		.swatch input[type='color'] {
			forced-color-adjust: none;
		}
	}
</style>
