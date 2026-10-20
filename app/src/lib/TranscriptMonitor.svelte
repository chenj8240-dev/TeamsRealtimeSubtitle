<script lang="ts">
	import { untrack } from 'svelte';
	import { isTauri } from './tauri';
	import { recovery } from './recovery';
	import { t } from './i18n';
	import { asStatus, type AppError } from './errors';
	import {
		clearTranscript as clearTranscriptStore,
		exportOriginal,
		recoveryEnabled,
		savedPath,
		transcriptDirty
	} from './stores';
	import { TRANSCRIPT_WARN_LINES } from './document';
	import { exportFormat, isTimedFormat } from './exportFormat';
	import { saveTranscriptDocument } from './saveDocument';
	import {
		groupTranscript,
		hasOriginalSpeech,
		hasTranscriptTiming,
		type TranscriptFormat
	} from './transcript';
	import type { Origin, OutputMode, TranscriptLine } from './types';
	import ToolButton from './ui/ToolButton.svelte';
	import Preference from './ui/Preference.svelte';

	interface Props {
		mode: OutputMode;
		transcript: TranscriptLine[];
		onError: (message: string | AppError) => void;
	}

	let { mode, transcript, onError }: Props = $props();
	// A browser preview has no filesystem to spool to, and inviting the operator to switch on a
	// feature whose only outcome would be an IPC error is the mistake issue #29 fixed elsewhere.
	const desktop = isTauri();
	let saving = $state(false);
	// The export format is a stored preference (`exportFormat.ts`), not this component's
	// state: the page mounts the monitor once while a session runs and again after it, and
	// each mount used to start over from Markdown.
	const timedExportAvailable = $derived(hasTranscriptTiming(transcript));
	// Offered only when there is something to include: subtitles have no separate original.
	const bilingual = $derived(hasOriginalSpeech(transcript));
	const missingTiming = $derived(isTimedFormat($exportFormat) && !timedExportAvailable);
	// Clear throws away unsaved text, so when there is any it asks once rather than acting on
	// the first click. New captions withdraw the question — the log the operator was about to
	// throw away is no longer the log in front of them — so it is derived from the transcript,
	// and only the click that asks sets it.
	let confirmingClear = $derived.by(() => {
		void transcript.length;
		return false;
	});

	// The log names the two sides of the room; the saved file names the devices
	// (`export.origin`). Both follow the interface language.
	const sideLabel = $derived<Record<Origin, string>>($t.transcript.side);

	// Show the log exactly as it will be saved: chronological, grouped into readable
	// paragraphs, newest at the bottom.
	const paragraphs = $derived(groupTranscript(transcript));

	// What a screen reader hears after a save. Empty while there is nothing new to report, so
	// the region stays silent between saves.
	const saveAnnouncement = $derived(
		$savedPath && !$transcriptDirty ? $t.transcript.savedAnnouncement($savedPath) : ''
	);

	// Nothing is ever dropped (issue #25), but a log this long is a session worth putting on
	// disk before something else decides for the operator.
	const veryLong = $derived(transcript.length >= TRANSCRIPT_WARN_LINES);

	let logEl = $state<HTMLDivElement | null>(null);
	let following = $state(true);
	const idBase = $props.id();
	const logId = `${idBase}-transcript-log`;

	function noteScroll() {
		if (logEl) following = logEl.scrollHeight - logEl.clientHeight - logEl.scrollTop <= 24;
	}

	function jumpToLatest() {
		following = true;
		if (logEl) {
			logEl.scrollTop = logEl.scrollHeight;
			logEl.focus({ preventScroll: true });
		}
	}

	$effect(() => {
		// Follow incoming text only while the operator is already at the bottom.
		paragraphs;
		if (!paragraphs.length) following = true;
		if (logEl && untrack(() => following)) logEl.scrollTop = logEl.scrollHeight;
	});

	async function save(format: TranscriptFormat) {
		if (!transcript.length || saving) return;
		saving = true;
		try {
			await saveTranscriptDocument(format);
		} catch (error) {
			onError(asStatus(error));
		} finally {
			saving = false;
		}
	}

	function clear() {
		if ($transcriptDirty && !confirmingClear) {
			confirmingClear = true;
			return;
		}
		confirmingClear = false;
		clearTranscriptStore();
		// The spool covered exactly the text just discarded, so it goes with it.
		if (desktop) void recovery.clear().catch(() => {});
	}

	function toggleRecovery(enabled: boolean) {
		if (!desktop) return;
		recoveryEnabled.set(enabled);
		// Switching it off has to remove what it already wrote, or "disabled" would still
		// leave captions sitting on disk.
		if (!enabled) void recovery.clear().catch((error) => onError(asStatus(error)));
	}
</script>

<section class="monitor">
	<div class="head">
		<h2 class="kicker">{$t.transcript.heading}</h2>
		<span class="count">{$t.transcript.lines(transcript.length)}</span>
		<!-- The whole point of the badge: on screen, a transcript that exists only in memory
		     looks exactly like one that is on disk. -->
		{#if transcript.length}
			<span class="state" class:unsaved={$transcriptDirty} data-testid="save-state">
				{$transcriptDirty ? $t.transcript.unsaved : $t.transcript.saved}
			</span>
		{/if}
		<div class="spacer"></div>
		<select aria-label={$t.transcript.format} bind:value={$exportFormat} disabled={saving}>
			<option value="markdown">Markdown (.md)</option>
			<option value="text">{$t.transcript.plainText} (.txt)</option>
			<option value="vtt">WebVTT (.vtt)</option>
			<option value="srt">SubRip (.srt)</option>
		</select>
		{#if bilingual}<Preference
				label={$t.transcript.includeOriginal}
				checked={$exportOriginal}
				disabled={saving}
				onchange={(value) => exportOriginal.set(value)}
			/>{/if}
		<ToolButton
			variant="ghost"
			size="sm"
			disabled={!desktop || !transcript.length || saving || missingTiming}
			aria-busy={saving}
			onclick={() => save($exportFormat)}
		>
			{$t.transcript.saveAs}
		</ToolButton>
		<ToolButton
			variant={confirmingClear ? 'danger' : 'ghost'}
			size="sm"
			disabled={!transcript.length || saving}
			onclick={clear}
		>
			{confirmingClear ? $t.transcript.confirmClear : $t.transcript.clear}
		</ToolButton>
	</div>
	{#if missingTiming && transcript.length}<p class="hint" role="status">
			{$t.transcript.noTiming}
		</p>{/if}

	<!-- The announcement lives in its own always-present region — a live region created at the
	     same moment as its text is routinely missed, and this one is out of flow, so it costs
	     the layout nothing between saves. The visible lines below repeat it for the eye. -->
	<p class="sr-only" role="status">{saveAnnouncement}</p>
	{#if $savedPath && !$transcriptDirty}
		<p class="saved" aria-hidden="true">{$t.transcript.savedTo} <code>{$savedPath}</code></p>
	{:else if $savedPath}
		<p class="hint" aria-hidden="true">
			{$t.transcript.staleBefore} <code>{$savedPath}</code>
			{$t.transcript.staleAfter}
		</p>
	{/if}

	{#if veryLong && $transcriptDirty}
		<p class="warn" role="status">{$t.transcript.longSession(TRANSCRIPT_WARN_LINES)}</p>
	{/if}

	{#if paragraphs.length}
		<!-- svelte-ignore a11y_no_noninteractive_tabindex (Scrollable transcript needs keyboard scrolling and a focus target after Jump to latest.) -->
		<div
			class="log-scroll"
			id={logId}
			role="region"
			aria-label={$t.transcript.heading}
			tabindex="0"
			onscroll={noteScroll}
			bind:this={logEl}
		>
			<ul class="log">
				{#each paragraphs as paragraph (paragraph.id)}
					<li class="origin-{paragraph.origin}">
						<span class="side"
							>{sideLabel[paragraph.origin]}{#if paragraph.language}<span class="language"
									>{paragraph.language}</span
								>{/if}</span
						>
						<span class="text">{paragraph.text}</span>
					</li>
				{/each}
			</ul>
		</div>
		{#if !following}
			<ToolButton
				variant="ghost"
				size="sm"
				class="jump-latest"
				aria-controls={logId}
				onclick={jumpToLatest}
			>
				{$t.transcript.jumpToLatest}
			</ToolButton>
		{/if}
	{:else}
		<p class="hint">
			{mode === 'translate' ? $t.transcript.emptyTranslate : $t.transcript.emptySubtitles}
		</p>
	{/if}

	<label class="recovery">
		<input
			type="checkbox"
			checked={$recoveryEnabled}
			disabled={!desktop}
			onchange={(e) => toggleRecovery(e.currentTarget.checked)}
		/>
		<span>
			<span class="recovery-title">{$t.transcript.recovery.title}</span>
			<span class="recovery-note">
				{desktop ? $t.transcript.recovery.note : $t.transcript.recovery.needsDesktop}
			</span>
		</span>
	</label>
</section>

<style>
	.monitor :global(.jump-latest) {
		align-self: flex-end;
		white-space: normal;
	}
	.monitor {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		margin-top: var(--space-5);
		padding-top: var(--space-4);
		border-top: 1px solid var(--line);
		/* The stage is a scrolling flex column; keep the block at its natural height there. */
		flex: 0 0 auto;
	}
	/* Wraps rather than squeezing its buttons below their labels at a large text size. */
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
	}
	.count {
		font-family: var(--font-mono);
		font-size: var(--type-caption);
		line-height: 1;
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}
	.spacer {
		flex: 1;
	}
	select {
		font: inherit;
		min-height: var(--control-sm);
		font-size: var(--type-small);
		color: var(--text-body);
		background: var(--surface-0);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-control);
		padding: var(--space-1);
		max-width: 100%;
	}
	.state {
		font-size: var(--type-caption);
		font-weight: 600;
		line-height: 1;
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-control);
		color: var(--accent-soft);
		background: var(--accent-chip);
	}
	.state.unsaved {
		color: var(--warn-soft);
		background: var(--warn-chip);
	}
	.saved {
		margin: 0;
		font-size: var(--type-small);
		color: var(--accent-soft);
		word-break: break-all;
	}

	.saved code,
	.hint code {
		font-family: var(--font-mono);
		font-size: var(--type-caption);
	}
	.hint {
		margin: 0;
		font-size: var(--type-body);
		line-height: var(--leading-body);
		color: var(--text-muted);
		word-break: break-word;
	}
	.warn {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-control);
		border: 1px solid var(--warn-border);
		background: var(--warn-wash);
		color: var(--warn-soft);
		font-size: var(--type-small);
		line-height: var(--leading-body);
		text-wrap: pretty;
	}
	.recovery {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-2);
		align-items: start;
		cursor: pointer;
	}
	.recovery input {
		margin: 2px 0 0;
		accent-color: var(--accent);
	}
	.recovery-title {
		display: block;
		font-size: var(--type-small);
		color: var(--text-secondary);
	}
	.recovery-note {
		display: block;
		margin-top: var(--space-1);
		font-size: var(--type-small);
		line-height: var(--leading-body);
		color: var(--text-muted);
		text-wrap: pretty;
	}
	.log {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.log-scroll {
		/* 180px at 100% — about six rows, in `em` so it stays about six rows. */
		max-height: 11.25em;
		overflow-y: auto;
	}
	.log li {
		display: grid;
		grid-template-columns: 4.25em 1fr;
		gap: var(--space-3);
	}
	/* Two pixels down, so the small-capital label sits on the baseline of the first line of
	   the larger text beside it rather than above it. */
	.side {
		padding-top: 2px;
		font-size: var(--type-caption);
		font-weight: 500;
		line-height: var(--leading-body);
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
	}
	/* The same identity as the live turns above: blue is the room, and only the room. The
	   remote side is the default speaker, so its marker stays neutral. */
	.origin-microphone .side {
		color: var(--room-soft);
	}
	/* With two caption languages the paragraphs alternate, so each names its language under
	   the speaker, as a code: the column is too narrow for a name. */
	.language {
		display: block;
		font-family: var(--font-mono);
		color: var(--text-muted);
	}
	.origin-system .side {
		color: var(--text-muted);
	}
	.text {
		font-size: var(--type-body);
		line-height: var(--leading-body);
		color: var(--text-muted);
		text-wrap: pretty;
	}
</style>
