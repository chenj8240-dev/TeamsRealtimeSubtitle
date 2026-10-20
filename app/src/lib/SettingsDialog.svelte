<script module lang="ts">
	export type SettingsTab = 'captions' | 'reading' | 'history' | 'app';
</script>

<script lang="ts">
	import ModalPrompt from './ModalPrompt.svelte';
	import Tabs from './ui/Tabs.svelte';
	import LanguageCard from './ui/LanguageCard.svelte';
	import Preference from './ui/Preference.svelte';
	import ToolButton from './ui/ToolButton.svelte';
	import CaptionAppearance from './CaptionAppearance.svelte';
	import ReadingPreferences from './ReadingPreferences.svelte';
	import TranscriptHistory from './TranscriptHistory.svelte';
	import KeyboardHelp from './KeyboardHelp.svelte';
	import { LOCALE_NAMES, LOCALES, locale, setLocale, t } from './i18n';
	import { closeToTray, overlayPlaced } from './stores';
	import type { OverlayController } from './overlayController.svelte';

	/** The settings panel. Everything in it is persisted and applies live, so there is no
	 *  draft to keep and nothing to cancel — closing is the only exit it needs. */
	let {
		overlay,
		browserMode,
		tab = $bindable('captions'),
		onHideWindow,
		onClose
	}: {
		overlay: OverlayController;
		browserMode: boolean;
		/** Bound, so reopening the panel returns to the tab it was closed on. */
		tab?: SettingsTab;
		onHideWindow: () => void;
		onClose: () => void;
	} = $props();

	const tabs = $derived<readonly { id: SettingsTab; label: string }[]>([
		{ id: 'captions', label: $t.design.captions },
		{ id: 'reading', label: $t.design.reading },
		{ id: 'history', label: $t.history.heading },
		{ id: 'app', label: $t.design.app }
	]);

	// Names the interface-language group for a screen reader; the heading is the only thing
	// that says what those buttons are choosing between.
	const idBase = $props.id();
	const localeHeadingId = `${idBase}-locale`;
</script>

<!-- Modal for the focus handling rather than because it demands an answer, so Escape and
     Close are the same harmless exit. It is deliberately reachable while a session runs: the
     appearance controls in the rail and the ones in here are the same controls over the same
     stores, and an operator who opens this mid-session to raise the caption size should get
     exactly that. -->
<ModalPrompt
	wide
	stableHeight
	title={$t.settings.heading}
	dismissLabel={$t.settings.closeLabel}
	onDismiss={onClose}
>
	<p class="hint">{$t.design.applies}</p>
	<Tabs
		{tabs}
		bind:selected={tab}
		label={$t.settings.heading}
		idPrefix="settings"
		panelId="settings-panel"
	/>
	{#key tab}
		<div
			class="settings"
			id="settings-panel"
			role="tabpanel"
			aria-labelledby={`settings-${tab}`}
			tabindex="0"
		>
			{#if tab === 'captions'}
				<div class="rail-section">
					<CaptionAppearance heading={$t.settings.appearance} {overlay} />
					<p class="hint">{$t.settings.appearanceNote}</p>
					<!-- Placement mode is the preview: the overlay stands a sample caption in, set in
					     whatever is chosen above. Same button and same labels as the pre-flight
					     check, because it is the same thing being done. -->
					<ToolButton
						wide
						variant={overlay.moveOverlay ? 'primary' : 'default'}
						disabled={browserMode}
						aria-label={overlay.moveOverlay
							? $t.preflight.overlay.doneLabel
							: $overlayPlaced
								? $t.preflight.overlay.adjustLabel
								: $t.preflight.overlay.placeLabel}
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
						{overlay.moveOverlay
							? $t.preflight.overlay.done
							: $overlayPlaced
								? $t.preflight.overlay.adjust
								: $t.preflight.overlay.place}
					</ToolButton>
				</div>
			{:else if tab === 'reading'}
				<ReadingPreferences {overlay} />
			{:else if tab === 'history'}
				<TranscriptHistory />
			{:else}
				<!-- What belongs to the app rather than to a session: neither of these touches
				     capture, so both stay usable mid-session. -->
				<div class="divider"></div>
				<!-- The interface language, not the caption language. -->
				<div class="rail-section">
					<h2 class="kicker" id={localeHeadingId}>{$t.locale.label}</h2>
					<!-- Buttons rather than a select: with a handful of interface languages, both
					     choices fit on screen and the switch costs one click instead of two. Built
					     from LOCALES so another language needs no markup, and grouped under the
					     heading because `aria-pressed` buttons on their own do not say what they
					     are choosing between. -->
					<div class="locale-cards" role="group" aria-labelledby={localeHeadingId}>
						{#each LOCALES as code (code)}
							<LanguageCard
								code={code.toUpperCase()}
								name={LOCALE_NAMES[code]}
								selected={$locale === code}
								onclick={() => setLocale(code)}
							/>
						{/each}
					</div>
					<p class="hint">{$t.locale.note}</p>
				</div>

				<div class="divider"></div>
				<div class="rail-section">
					<h2 class="kicker">{$t.window.heading}</h2>
					<ToolButton wide disabled={browserMode} onclick={onHideWindow}>
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
							><path d="M12 4v10" /><path d="M8.5 10.5L12 14l3.5-3.5" /><path
								d="M4.5 17.5h15"
							/></svg
						>
						{$t.window.minimizeToTray}
					</ToolButton>
					<Preference
						label={$t.window.keepRunning}
						note={browserMode ? $t.window.needsDesktop : $t.window.keepRunningNote}
						checked={$closeToTray}
						disabled={browserMode}
						onchange={(value) => closeToTray.set(value)}
					/>
				</div>
				<KeyboardHelp />
			{/if}
		</div>
	{/key}
</ModalPrompt>

<style>
	/* The panel is a column of the same `.rail-section` blocks the rail is built from, so all
	   it contributes is the rhythm between them. */
	.settings {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		flex: 1 0 0;
		min-height: 0;
		overflow-y: auto;
		scrollbar-gutter: stable;
		padding: var(--space-1);
	}
	.settings > :global(*) {
		flex-shrink: 0;
	}
	.kicker {
		flex: 0 0 auto;
	}

	/* The language cards of the setup sheet, sized from however many interface languages
	   there are rather than from the two the caption step happens to offer. */
	.locale-cards {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1fr;
		gap: var(--space-2);
	}
</style>
