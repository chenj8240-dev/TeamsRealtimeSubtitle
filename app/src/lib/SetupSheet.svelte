<script lang="ts">
	import LanguagePicker from './LanguagePicker.svelte';
	import WhisperModels from './WhisperModels.svelte';
	import whisperLanguages from './whisperLanguages.json';
	import LevelMeter from './LevelMeter.svelte';
	import SystemCapturePicker from './SystemCapturePicker.svelte';
	import ChoiceButton from './ui/ChoiceButton.svelte';
	import Kbd from './ui/Kbd.svelte';
	import ToolButton from './ui/ToolButton.svelte';
	import Field from './ui/Field.svelte';
	import LanguageCard from './ui/LanguageCard.svelte';
	import Select from './ui/Select.svelte';
	import { languageName, languageRows } from './languages';
	import { locale, t } from './i18n';
	import { languageFavourites, micLevel, options, systemLevel } from './stores';
	import {
		PROVIDER_META,
		isLocalWhisper,
		modelLabel,
		providerDetectsLanguage,
		rateParts
	} from './providers';
	import type { Provider, TargetLanguage } from './types';
	import type { PreflightController } from './preflightController.svelte';
	import type { SetupActions } from './setupActions';

	/** The idle rail: the numbered setup sheet — what to show, where from, in which language
	 *  and with which engine. */
	let {
		actions,
		preflight,
		locked,
		browserMode,
		usesMic,
		usesSystem,
		languageError
	}: {
		actions: SetupActions;
		preflight: PreflightController;
		/** A session, a start or a profile load is under way. */
		locked: boolean;
		browserMode: boolean;
		usesMic: boolean;
		usesSystem: boolean;
		/** Why the chosen caption language cannot start, or empty. */
		languageError: string;
	} = $props();

	// Each mode is served by its own backends; step 04 lists the ones for the current mode.
	const modeProviders = $derived<Provider[]>(
		$options.mode === 'translate'
			? ['gemini', 'openai', 'whisper-translate']
			: ['whisper', 'mistral', 'gemini-transcribe', 'ondevice']
	);

	// The second caption language: favourites first, then every language the engine offers,
	// never the first language itself. A stored choice the engine does not offer stays listed,
	// so the select shows it and the language error explains it rather than hiding it.
	const secondChoices = $derived(
		languageRows($options.provider, $languageFavourites, '', $locale).filter(
			(row) =>
				row.code !== $options.targetLanguage &&
				(row.supported || row.code === $options.secondTargetLanguage)
		)
	);

	// Step 03 asks which language to render into, which demo script to play, or nothing when
	// the backend detects the spoken language itself.
	const spokenChoices = $derived.by(() => {
		const names = new Intl.DisplayNames([$locale], { type: 'language', fallback: 'none' });
		return whisperLanguages
			.map((l) => ({ code: l.code, name: names.of(l.code) || l.name }))
			.sort((a, b) => a.name.localeCompare(b.name, $locale));
	});
	const languageStepTitle = $derived(
		$options.mode === 'translate'
			? $t.rail.step.roomReads
			: $options.provider === 'ondevice'
				? $t.rail.step.demoLanguage
				: $t.rail.step.spokenLanguage
	);
</script>

<section class="rail-section">
	<div class="step-head">
		<span class="step-no">01</span>
		<h2 class="kicker">{$t.rail.step.whatToShow}</h2>
	</div>
	<ChoiceButton
		selected={$options.mode === 'translate'}
		disabled={locked}
		title={$t.rail.translate.title}
		desc={$t.rail.translate.desc}
		onclick={() => actions.setMode('translate')}
	>
		{#snippet icon()}
			<svg
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"><path d="M4 8.5h13l-3.5-3.5" /><path d="M20 15.5H7l3.5 3.5" /></svg
			>
		{/snippet}
	</ChoiceButton>
	<ChoiceButton
		selected={$options.mode === 'transcribe'}
		disabled={locked}
		title={$t.rail.transcribe.title}
		desc={$t.rail.transcribe.desc}
		onclick={() => actions.setMode('transcribe')}
	>
		{#snippet icon()}
			<svg
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"><path d="M4 7h16M4 12h11M4 17h7" /></svg
			>
		{/snippet}
	</ChoiceButton>
</section>

<div class="divider"></div>

<section class="rail-section">
	<div class="step-head">
		<span class="step-no">02</span>
		<h2 class="kicker">{$t.rail.step.whereFrom}</h2>
	</div>
	<div class="tiles">
		<button
			class="tile ui-card"
			disabled={locked}
			aria-pressed={$options.source === 'microphone'}
			onclick={() => actions.setSource('microphone')}
		>
			<svg
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
				aria-hidden="true"
				><rect x="9" y="2.5" width="6" height="11" rx="3" /><path
					d="M5.5 11.5a6.5 6.5 0 0 0 13 0"
				/><path d="M12 18v3.5" /></svg
			>
			<span>{$options.provider === 'ondevice' ? $t.source.demo : $t.source.microphone}</span>
		</button>
		<button
			class="tile ui-card"
			disabled={locked || $options.provider === 'ondevice'}
			aria-pressed={$options.source === 'system'}
			onclick={() => actions.setSource('system')}
		>
			<svg
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
				><path d="M4 9.5h3.5L13 5v14L7.5 14.5H4z" /><path d="M16.5 9.2a4.2 4.2 0 0 1 0 5.6" /></svg
			>
			<span>{$t.source.system}</span>
		</button>
		<button
			class="tile ui-card"
			disabled={locked || $options.provider === 'ondevice'}
			aria-pressed={$options.source === 'both'}
			onclick={() => actions.setSource('both')}
		>
			<svg
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
				aria-hidden="true"><path d="M3.5 6.5h4.5L12 12l4 5.5h4.5M3.5 17.5h4.5L12 12" /></svg
			>
			<span>{$t.source.both}</span>
		</button>
	</div>
	<p class="hint">
		{$options.provider === 'ondevice'
			? $t.rail.demoSourceHint
			: $options.systemCapture?.kind === 'application' && usesSystem
				? $t.applications.hint
				: $t.rail.sourceHint}
	</p>

	{#if usesMic && $options.provider !== 'ondevice'}
		<Field label={$t.rail.micDevice}>
			<Select
				disabled={locked}
				value={$options.micDeviceId ?? ''}
				onchange={(e) => {
					preflight.invalidateAudioTest();
					$options = {
						...$options,
						micDeviceId: e.currentTarget.value || null,
						micDeviceName: null
					};
				}}
			>
				<option value="">{$t.rail.systemDefault}</option>
				{#if $options.micDeviceId && !preflight.microphones.some((d) => d.id === $options.micDeviceId)}
					<option value={$options.micDeviceId}>{$t.devices.missing}</option>
				{/if}
				{#each preflight.microphones as dev (dev.id)}
					<option value={dev.id}>
						{dev.isDefault ? $t.rail.isDefault(dev.name) : dev.name}
					</option>
				{/each}
			</Select>
		</Field>
	{/if}

	{#if usesSystem && $options.provider !== 'ondevice'}
		<SystemCapturePicker
			{locked}
			outputs={preflight.outputs}
			applications={preflight.applications}
			supported={preflight.applicationCaptureSupported}
			refresh={preflight.refreshApplications}
			changed={preflight.invalidateAudioTest}
		/>
	{/if}
	{#if $options.provider !== 'ondevice'}
		<ToolButton
			disabled={browserMode || preflight.refreshing || preflight.refreshingApplications}
			aria-busy={preflight.refreshing || preflight.refreshingApplications}
			onclick={() => Promise.all([preflight.refresh(), preflight.refreshApplications()])}
		>
			{preflight.refreshing ? $t.devices.refreshing : $t.devices.refresh}
		</ToolButton>
	{/if}
	<div class="meters">
		{#if usesMic}
			<LevelMeter
				level={$micLevel}
				label={$options.provider === 'ondevice' ? $t.source.demo : $t.source.microphone}
			/>
		{/if}
		{#if usesSystem}
			<LevelMeter level={$systemLevel} label={$t.stage.origin.system} />
		{/if}
	</div>
</section>

<div class="divider"></div>

<section class="rail-section">
	<div class="step-head">
		<span class="step-no">03</span>
		<h2 class="kicker">{languageStepTitle}</h2>
	</div>
	{#snippet spokenLanguage(hint: string)}
		<Field label={$t.whisper.language}>
			<Select
				value={$options.spokenLanguage ?? ''}
				disabled={locked}
				onchange={(e) =>
					($options = { ...$options, spokenLanguage: e.currentTarget.value || null })}
			>
				<option value="">{$t.whisper.auto}</option>
				{#each spokenChoices as language (language.code)}
					<option value={language.code}>{language.name}</option>
				{/each}
			</Select>
		</Field>
		<p class="hint">{hint}</p>
	{/snippet}
	{#if $options.provider === 'whisper'}
		{@render spokenLanguage($t.whisper.languageHint)}
	{:else if $options.mode === 'transcribe' && providerDetectsLanguage($options.provider)}
		<p class="hint">{$t.rail.autoDetectHint($t.engine[$options.provider])}</p>
	{:else if $options.mode === 'translate'}
		<LanguagePicker
			value={$options.targetLanguage}
			provider={$options.provider}
			favourites={$languageFavourites}
			disabled={locked}
			error={languageError}
			onchange={actions.setTarget}
			onpin={(code) =>
				languageFavourites.update((pins) =>
					pins.includes(code) ? pins.filter((p) => p !== code) : [...pins, code]
				)}
		/>
		{#if isLocalWhisper($options.provider)}
			<!-- English is the only caption language, so there is nothing to flip to and no
			     second language to offer: say so rather than show an empty picker. Whisper still
			     has to hear the spoken language, which it translates from. -->
			<p class="hint">{$t.language.englishOnly}</p>
			{@render spokenLanguage($t.whisper.translateLanguageHint)}
		{:else}
			<p class="hint inline-hint">
				<span>{$t.rail.flipHint}</span><Kbd command="direction" />
			</p>
			<Field label={$t.language.second}>
				<Select
					value={$options.secondTargetLanguage ?? ''}
					disabled={locked}
					onchange={(e) =>
						actions.setSecondTarget((e.currentTarget.value || null) as TargetLanguage | null)}
				>
					<option value="">{$t.language.secondNone}</option>
					{#each secondChoices as row (row.code)}
						<option value={row.code}>{row.name}</option>
					{/each}
				</Select>
			</Field>
			<p class="hint">{$t.language.secondHint}</p>
		{/if}
	{:else}
		{#if languageError}<p class="hint" role="status">{languageError}</p>{/if}
		<div class="lang-cards">
			<LanguageCard
				code="EN"
				name={languageName('en', $locale)}
				selected={$options.targetLanguage === 'en'}
				disabled={locked}
				onclick={() => actions.setTarget('en')}
			/>
			<LanguageCard
				code="FR"
				name={languageName('fr', $locale)}
				selected={$options.targetLanguage === 'fr'}
				disabled={locked}
				onclick={() => actions.setTarget('fr')}
			/>
		</div>
		<p class="hint">{$t.rail.demoLanguageHint}</p>
	{/if}
</section>

<div class="divider"></div>

<section class="rail-section">
	<div class="step-head">
		<span class="step-no">04</span>
		<h2 class="kicker">{$t.rail.step.engine}</h2>
	</div>
	<div class="engines">
		{#each modeProviders as id (id)}
			{@const p = PROVIDER_META[id]}
			{@const rate = rateParts(p, $t)}
			<!-- Whisper on a processor it was not built for stays listed, so the operator learns
			     why it is missing, but cannot be chosen. -->
			{@const refused = isLocalWhisper(id) && preflight.whisperRefused}
			<button
				class="engine ui-card"
				disabled={locked || refused}
				aria-pressed={$options.provider === id}
				onclick={() => actions.setProvider(id)}
			>
				<span class="engine-body">
					<span class="engine-name">{$t.provider.vendor[id]}</span>
					<span class="engine-model">{modelLabel(p, $t)}</span>{#if id === 'gemini-transcribe'}<span
							class="hint">{$t.design.smartSummary}</span
						>{/if}{#if refused}<span class="hint"
							>{$t.whisper.cpuUnsupported(preflight.whisperCpuMissing)}</span
						>{/if}
				</span>
				<span class="engine-rate">{rate[0]}<span class="unit">{rate[1]}</span></span>
			</button>
		{/each}
	</div>
	{#if isLocalWhisper($options.provider)}<WhisperModels {locked} {browserMode} />{/if}
</section>

<style>
	/* Direct children of the rail's scrolling column keep their height rather than
	   compress, so a short window scrolls instead of clipping text. */
	.kicker {
		flex: 0 0 auto;
	}

	/* ---- Selection cards ----------------------------------------------------
	   The border, the fill and the selected wash of the source tiles and the engine rows
	   are the shared .ui-card's; what is set here is their layout and how their text
	   follows the selection. */

	.tiles {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--space-2);
	}
	.tile {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-1) var(--space-2);
		color: var(--text-muted);
		font-size: var(--type-small);
		font-weight: 500;
		line-height: 1;
	}
	.tile[aria-pressed='true'] {
		color: var(--accent-soft);
		font-weight: 600;
	}

	.meters {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}

	.lang-cards {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-2);
	}

	.engines {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.engine {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-3);
	}
	.engine-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.engine-name {
		font-size: var(--type-body);
		font-weight: 500;
		line-height: 1;
		color: var(--text-secondary);
	}
	.engine[aria-pressed='true'] .engine-name {
		color: var(--text-body);
		font-weight: 600;
	}
	.engine-model {
		font-family: var(--font-mono);
		font-size: var(--type-caption);
		line-height: var(--leading-tight);
		color: var(--text-muted);
		overflow-wrap: anywhere;
	}
	.engine-rate {
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: var(--type-small);
		font-weight: 500;
		line-height: 1;
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.engine[aria-pressed='true'] .engine-rate {
		color: var(--accent-soft);
	}
	/* The unit stays grey when the selected engine turns its rate mint. */
	.engine-rate .unit {
		color: var(--text-muted);
	}
</style>
