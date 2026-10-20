<script lang="ts">
	import CaptionAppearance from './CaptionAppearance.svelte';
	import ToolButton from './ui/ToolButton.svelte';
	import LevelMeter from './LevelMeter.svelte';
	import LiveActivity from './LiveActivity.svelte';
	import { languageName } from './languages';
	import { locale, t } from './i18n';
	import { micLevel, options, pauseRequested, systemLevel } from './stores';
	import {
		estimateSessionCost,
		formatUsd,
		isLocalWhisper,
		providerDetectsLanguage
	} from './providers';
	import { laneCount, secondCaptionLanguageOf } from './types';
	import type { OverlayController } from './overlayController.svelte';
	import type { SessionClock } from './sessionClock.svelte';

	/** The rail while a session runs: the setup sheet collapses to what it locked in, and what
	 *  can change mid-session — incoming audio, cost, the overlay — takes its place. */
	let {
		overlay,
		clock,
		rehearsing,
		usesMic,
		usesSystem
	}: {
		overlay: OverlayController;
		clock: SessionClock;
		/** The run is fed by the bundled sample recording rather than live audio. */
		rehearsing: boolean;
		usesMic: boolean;
		usesSystem: boolean;
	} = $props();

	// The subtitle engines detect the spoken language themselves, so there is nothing to lock.
	// Whisper's subtitles are in the spoken language, when one was chosen; its translations are
	// in English, the target, like any other translation.
	const second = $derived(secondCaptionLanguageOf($options));
	const roomReadsLabel = $derived(
		$options.provider === 'whisper' && $options.spokenLanguage
			? new Intl.DisplayNames([$locale], { type: 'language' }).of($options.spokenLanguage)
			: providerDetectsLanguage($options.provider)
				? $t.language.auto
				: [$options.targetLanguage, ...(second ? [second] : [])]
						.map((code) => languageName(code, $locale))
						.join(' + ')
	);
	// Every source streams once per caption language, and each stream is billed. Counted from
	// the sources this run actually opens, as the meters are: a rehearsal is one System stream
	// whatever source is saved.
	const sources = $derived((usesMic ? 1 : 0) + (usesSystem ? 1 : 0));
	const streams = $derived(sources * laneCount($options));
</script>

<div class="rail-head">
	<span class="rail-icon" aria-hidden="true">
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.75"
			stroke-linecap="round"
			><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path
				d="M8 10.5V8a4 4 0 0 1 8 0v2.5"
			/></svg
		>
	</span>
	<h2 class="kicker">{$t.rail.locked}</h2>
</div>

<div class="chips">
	<div class="chip">
		<span class="chip-label">{$t.rail.chip.mode}</span>
		<span class="chip-value">{$t.mode[$options.mode]}</span>
	</div>
	<div class="chip">
		<span class="chip-label">{$t.rail.chip.source}</span>
		<span class="chip-value"
			>{$options.provider === 'ondevice'
				? $t.source.demo
				: rehearsing
					? $t.source.sample
					: $t.source[$options.source]}</span
		>
	</div>
	<div class="chip">
		<span class="chip-label">{$t.rail.chip.roomReads}</span>
		<span class="chip-value">{roomReadsLabel}</span>
	</div>
	<div class="chip">
		<span class="chip-label">{$t.rail.chip.engine}</span>
		<span class="chip-value">{$t.engine[$options.provider]}</span>
	</div>
</div>

<p class="rail-note">
	<!-- The target language is fixed at session start (the backend takes it once),
	     so no mid-session F2 promise here — the idle sheet carries the F2 hint. -->
	{#if $pauseRequested}
		<span>{$t.rail.pauseNote}</span>
	{/if}
	{#if $options.provider === 'ondevice'}
		<span>{$t.rail.demoNote}</span>
	{:else if rehearsing}
		<span>{$t.rail.rehearsalNote}</span>
	{/if}
	<span>{$t.rail.lockedNote}</span>
</p>

<div class="divider"></div>

<div class="rail-section">
	<h2 class="kicker">{$t.rail.arriving}</h2>
	<LiveActivity now={clock.now} microphone={usesMic} system={usesSystem} />
	{#if usesMic}
		<LevelMeter
			level={$micLevel}
			label={$options.provider === 'ondevice' ? $t.stage.origin.demo : $t.stage.origin.microphone}
			active
		/>
	{/if}
	{#if usesSystem}
		<LevelMeter level={$systemLevel} label={$t.stage.origin.system} active />
	{/if}
</div>

<div class="cost-card">
	<div class="cost-figures">
		{#if $options.provider !== 'ondevice'}
			<div class="figure">
				<span class="chip-label">{$t.cost.estimate}</span>
				<span class="figure-value mint">
					{formatUsd(estimateSessionCost($options.provider, clock.streamedMs, streams))}
				</span>
			</div>
			{#if sources === 2 && !isLocalWhisper($options.provider)}
				<span class="cost-tag">{$t.cost.twoSources}</span>
			{/if}
			{#if second}
				<span class="cost-tag">{$t.cost.twoLanguages}</span>
			{/if}
		{/if}
	</div>
	<p class="cost-note">{$t.provider.costNote[$options.provider]}</p>
</div>

<div class="divider"></div>

<div class="rail-section">
	<CaptionAppearance heading={$t.overlayControls.heading} {overlay} compact />
	<div class="overlay-actions">
		<!-- Both labels are a single verb on screen, which is all the space allows and
		     all a sighted operator needs beside the "Overlay" heading. The accessible
		     name says what is being moved or hidden, because a screen reader can arrive
		     at the button without the heading. The name changes with the state, so the
		     button is not also a toggle (see `docs/accessibility.md`); while moving, "Done"
		     is the primary action instead of a pressed one. -->
		<ToolButton
			variant={overlay.moveOverlay ? 'primary' : 'default'}
			aria-label={overlay.moveOverlay
				? $t.overlayControls.moveDoneLabel
				: $t.overlayControls.moveLabel}
			onclick={overlay.toggleMoveOverlay}
		>
			<svg
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
				><path
					d="M12 3.5v17M3.5 12h17M12 3.5l-3 3M12 3.5l3 3M12 20.5l-3-3M12 20.5l3-3M3.5 12l3-3M3.5 12l3 3M20.5 12l-3-3M20.5 12l-3 3"
				/></svg
			>
			{overlay.moveOverlay ? $t.overlayControls.done : $t.overlayControls.move}
		</ToolButton>
		<ToolButton
			variant={overlay.overlayVisible ? 'default' : 'warn'}
			aria-label={overlay.overlayVisible
				? $t.overlayControls.hideLabel
				: $t.overlayControls.showLabel}
			onclick={overlay.toggleOverlayVisible}
		>
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
				<rect x="2.5" y="4.5" width="19" height="13" rx="2" /><path d="M9 20.5h6" />
				{#if overlay.overlayVisible}<path d="M3.5 20.5l17-17" />{/if}
			</svg>
			{overlay.overlayVisible ? $t.overlayControls.hide : $t.overlayControls.show}
		</ToolButton>
	</div>
</div>

<span class="grow"></span>

<style>
	/* Direct children of the rail's scrolling column keep their height rather than
	   compress, so a short window scrolls instead of clipping text. */
	.kicker,
	.chips,
	.rail-note,
	.cost-card {
		flex: 0 0 auto;
	}

	.chips {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-2);
	}
	.chip {
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-card);
		background: var(--surface-1);
		border: 1px solid var(--line);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.chip-label {
		font-size: var(--type-caption);
		font-weight: 500;
		line-height: 1;
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.chip-value {
		font-size: var(--type-body);
		font-weight: 500;
		line-height: var(--leading-tight);
		color: var(--text-body);
	}
	.rail-note {
		margin: 0;
		font-size: var(--type-small);
		line-height: var(--leading-snug);
		color: var(--text-muted);
	}

	.cost-card {
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-card);
		background: var(--surface-1);
		border: 1px solid var(--line);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.cost-figures {
		display: flex;
		align-items: baseline;
		gap: var(--space-4);
	}
	.figure {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.figure-value {
		font-family: var(--font-mono);
		font-size: var(--type-heading);
		font-weight: 500;
		line-height: 1;
		color: var(--text-body);
		font-variant-numeric: tabular-nums;
	}
	.figure-value.mint {
		color: var(--accent-soft);
	}
	.cost-tag {
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: var(--type-caption);
		font-weight: 500;
		line-height: 1;
		color: var(--text-muted);
	}
	.cost-note {
		margin: 0;
		font-size: var(--type-caption);
		line-height: var(--leading-snug);
		color: var(--text-muted);
		text-wrap: pretty;
	}

	.overlay-actions {
		display: flex;
		gap: var(--space-2);
	}
	.overlay-actions > :global(.ui-tool) {
		flex: 1;
	}
</style>
