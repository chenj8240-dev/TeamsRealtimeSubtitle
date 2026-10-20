<script lang="ts">
	import ApiKeyPanel from './ApiKeyPanel.svelte';
	import ChecklistRow from './ui/ChecklistRow.svelte';
	import ToolButton from './ui/ToolButton.svelte';
	import { t } from './i18n';
	import { options, overlayPlaced, statusMessage, whisperModels } from './stores';
	import { PROVIDER_META, isLocalWhisper, providerRequiresKey, rateText } from './providers';
	import { describeReadiness, laneCount } from './types';
	import type { OverlayController } from './overlayController.svelte';
	import type { PreflightController } from './preflightController.svelte';

	let {
		preflight,
		overlay,
		browserMode,
		locked,
		usesMic,
		usesSystem
	}: {
		preflight: PreflightController;
		overlay: OverlayController;
		browserMode: boolean;
		/** Setup is locked: a session, a start or a profile load is under way. */
		locked: boolean;
		usesMic: boolean;
		usesSystem: boolean;
	} = $props();

	const needsKey = $derived(providerRequiresKey($options.provider));
	const localWhisper = $derived(isLocalWhisper($options.provider));
	const whisperTitle = $derived(
		$options.provider === 'whisper-translate' ? $t.whisper.translateTitle : $t.whisper.title
	);

	// The demo row's sentence. The core names the readiness state and the catalog words it, so
	// this re-words itself when the interface language changes rather than freezing whatever
	// was true at check time.
	const demoRowText = $derived(describeReadiness(preflight.localReadiness, $t));

	// The tick means "this source has been heard", not "we are listening now". The old check
	// asked the second question from a screen where the answer was always no, because levels
	// only flow once capture is running.
	const audioVerified = $derived(
		$options.provider === 'ondevice' ||
			((!usesMic || preflight.micVerified) && (!usesSystem || preflight.systemVerified))
	);
	// Live view for the duration of a test.
	const audioHearing = $derived(
		(!usesMic || preflight.micSignal) && (!usesSystem || preflight.systemSignal)
	);

	// Which of the four things is under test: the room mic, system loopback, both, or the
	// bundled sample. One key, used for the row title and both tenses of the description.
	const audioSubject = $derived<'microphone' | 'system' | 'both' | 'demo'>(
		$options.provider === 'ondevice'
			? 'demo'
			: $options.source === 'system'
				? 'system'
				: $options.source === 'microphone'
					? 'microphone'
					: 'both'
	);
	const audioCheckDesc = $derived(
		$options.provider === 'ondevice'
			? $t.preflight.audio.heard.demo
			: preflight.audioTesting
				? audioHearing
					? $t.preflight.audio.hearing[audioSubject]
					: $t.preflight.audio.listening
				: audioVerified
					? $t.preflight.audio.heard[audioSubject]
					: $t.preflight.audio.unchecked
	);
</script>

<div class="checklist">
	{#if localWhisper && preflight.whisperRefused}
		<!-- Subtitles are normally replaced by the demo at once, and shown here only while setup
		     is locked and cannot switch. Translation stays, since the demo cannot translate:
		     the operator chooses a cloud engine instead. -->
		<ChecklistRow
			status="wait"
			title={whisperTitle}
			desc={$t.whisper.cpuUnsupported(preflight.whisperCpuMissing)}
			warn
		/>
	{:else if localWhisper}
		<ChecklistRow
			status={$whisperModels.find((m) => m.id === ($options.whisperModel ?? 'base'))?.installed
				? 'ok'
				: 'wait'}
			title={whisperTitle}
			desc={$whisperModels.find((m) => m.id === ($options.whisperModel ?? 'base'))?.installed
				? $t.whisper.ready
				: $t.whisper.missing}
		/>
	{:else if !needsKey}
		<ChecklistRow
			status={preflight.localReadiness?.ready ? 'ok' : 'wait'}
			title={$t.preflight.demoRow.title}
			desc={demoRowText}
			warn={!preflight.localReadiness?.ready}
		/>
	{:else if !browserMode}
		<ApiKeyPanel
			provider={$options.provider}
			{locked}
			onAvailability={(provider, available) => {
				if ($options.provider === provider) preflight.noteKey(provider, available);
			}}
			onError={(message) => statusMessage.set(message)}
		/>
	{/if}

	<ChecklistRow
		status={audioVerified ? 'ok' : 'wait'}
		title={$t.preflight.audio.title[audioSubject]}
		desc={audioCheckDesc}
		warn={preflight.audioTesting && !audioHearing}
	>
		{#snippet action()}
			<!-- The demo opens no device, so there is nothing to test. Otherwise the row keeps
			     the button in both states: re-checking after moving a cable or switching the
			     room mic is exactly when an operator needs it. -->
			{#if $options.provider === 'ondevice' || browserMode}
				<span></span>
			{:else if preflight.audioTesting}
				<ToolButton
					variant="ghost"
					size="sm"
					disabled={preflight.audioTestBusy}
					aria-busy={preflight.audioTestBusy}
					onclick={preflight.stopAudioTest}
				>
					{$t.preflight.audio.stopTest}
				</ToolButton>
			{:else}
				<ToolButton
					variant="warn"
					size="sm"
					disabled={preflight.audioTestBusy || locked || !preflight.applicationReady($options)}
					aria-busy={preflight.audioTestBusy}
					onclick={preflight.startAudioTest}
				>
					{audioVerified ? $t.preflight.audio.retest : $t.preflight.audio.test}
				</ToolButton>
			{/if}
		{/snippet}
	</ChecklistRow>

	<ChecklistRow
		status={$overlayPlaced ? 'ok' : 'wait'}
		title={$t.preflight.overlay.title}
		desc={$overlayPlaced ? $t.preflight.overlay.placed : $t.preflight.overlay.unplaced}
		warn={!$overlayPlaced}
	>
		{#snippet action()}
			<!-- Placement is never final: re-entering move mode is the way to adjust position and
			     caption size, so the row keeps a button in both states. Its name changes to
			     "Finish placing" while moving, so it is not also a pressed toggle; "Done" is
			     the primary action then instead. -->
			<ToolButton
				variant={overlay.moveOverlay ? 'primary' : $overlayPlaced ? 'ghost' : 'warn'}
				size="sm"
				aria-label={overlay.moveOverlay
					? $t.preflight.overlay.doneLabel
					: $overlayPlaced
						? $t.preflight.overlay.adjustLabel
						: $t.preflight.overlay.placeLabel}
				onclick={overlay.toggleMoveOverlay}
			>
				{overlay.moveOverlay
					? $t.preflight.overlay.done
					: $overlayPlaced
						? $t.preflight.overlay.adjust
						: $t.preflight.overlay.place}
			</ToolButton>
		{/snippet}
	</ChecklistRow>

	<ChecklistRow
		status="neutral"
		glyph="$"
		title={$t.preflight.cost.title}
		desc={localWhisper
			? $t.whisper.cost
			: !needsKey
				? $t.preflight.cost.free
				: $t.preflight.cost.billed}
	>
		{#snippet action()}
			<span class="check-rate">{rateText(PROVIDER_META[$options.provider], $t)}</span>
			<!-- The rate is per stream, and a second caption language is a second stream. -->
			{#if laneCount($options) === 2}<span class="check-tag">{$t.cost.twoLanguages}</span>{/if}
		{/snippet}
	</ChecklistRow>
</div>

<style>
	.checklist {
		flex: 0 0 auto;
		margin-top: var(--space-5);
		border-top: 1px solid var(--line);
	}
	.check-tag {
		font-size: var(--type-small);
		color: var(--text-muted);
		white-space: nowrap;
	}
	.check-rate {
		font-family: var(--font-mono);
		font-size: var(--type-body);
		font-weight: 500;
		line-height: 1;
		color: var(--text-secondary);
		font-variant-numeric: tabular-nums;
	}
	/* Near the window's minimum height, tighten the vertical rhythm so the checklist and the
	   launch notes still land above the fold. */
	@media (max-height: 740px) {
		.checklist {
			margin-top: var(--space-4);
		}
	}
</style>
