<script lang="ts">
	import { t } from './i18n';
	import {
		options,
		overlayHoldSeconds,
		overlayPace,
		overlayCaptionLayout,
		overlayCleanSpeech,
		overlayCaptionWidth,
		overlayShowOriginal
	} from './stores';
	import type { OverlayController } from './overlayController.svelte';
	import type { CaptionLayout } from './captionLayout';
	import { HOLD_SECONDS_MAX, HOLD_SECONDS_MIN } from './reading';
	import { OVERLAY_WIDTH_MAX, OVERLAY_WIDTH_MIN } from './appearance';
	import Field from './ui/Field.svelte';
	import Select from './ui/Select.svelte';
	import Stepper from './ui/Stepper.svelte';
	import Preference from './ui/Preference.svelte';
	import FillerWordList from './FillerWordList.svelte';
	let { overlay }: { overlay: OverlayController } = $props();
</script>

<div class="reading">
	<Field label={$t.overlayControls.captionLayout}>
		<Select
			value={$overlayCaptionLayout}
			onchange={(e) => overlay.setCaptionLayout(e.currentTarget.value as CaptionLayout)}
		>
			<option value="fit">{$t.overlayControls.fitWindow}</option><option value="stable"
				>{$t.overlayControls.stable}</option
			><option value="compact">{$t.overlayControls.compact}</option>
		</Select>
	</Field>
	{#if $overlayCaptionLayout === 'compact'}<Stepper
			label={$t.overlayControls.captionWidth}
			value={$overlayCaptionWidth}
			min={OVERLAY_WIDTH_MIN}
			max={OVERLAY_WIDTH_MAX}
			step={2}
			unit="ch"
			decreaseLabel={$t.overlayControls.narrower}
			increaseLabel={$t.overlayControls.wider}
			onchange={overlay.setCaptionWidth}
		/>{/if}
	<Stepper
		label={$t.usability.hold}
		value={$overlayHoldSeconds}
		min={HOLD_SECONDS_MIN}
		max={HOLD_SECONDS_MAX}
		unit="s"
		disabled={$overlayCaptionLayout === 'stable'}
		onchange={overlay.setHoldSeconds}
	/>
	<p>{$t.usability.holdHint}</p>
	<Field label={$t.usability.pace}>
		<Select
			value={$overlayPace}
			onchange={(e) => overlay.setPace(e.currentTarget.value === 'steady' ? 'steady' : 'immediate')}
			><option value="immediate">{$t.usability.immediate}</option><option value="steady"
				>{$t.usability.steady}</option
			></Select
		>
	</Field>
	<p>{$t.usability.paceHint}</p>
	<Preference
		label={$t.overlayControls.cleanSpeech}
		note={$t.overlayControls.cleanSpeechHint}
		checked={$overlayCleanSpeech}
		onchange={overlay.setCleanSpeech}
	/>
	{#if $overlayCleanSpeech}<FillerWordList {overlay} />{/if}
	<Preference
		label={$t.overlayControls.showOriginal}
		note={$t.overlayControls.showOriginalHint}
		checked={$overlayShowOriginal}
		onchange={overlay.setShowOriginal}
	/>
	{#if $options.provider === 'gemini-transcribe'}<p>{$t.usability.geminiSmart}</p>{/if}
</div>

<style>
	.reading {
		display: grid;
		gap: var(--space-3);
	}
	p {
		margin: 0 0 var(--space-2);
		font-size: var(--type-small);
		line-height: var(--leading-body);
		color: var(--text-muted);
	}
</style>
