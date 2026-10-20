<script lang="ts">
	import { TARGET_LANGUAGES, languageName } from './languages';
	import Select from './ui/Select.svelte';
	import Field from './ui/Field.svelte';
	import DateField from './ui/DateField.svelte';
	import ToolButton from './ui/ToolButton.svelte';
	import Preference from './ui/Preference.svelte';
	import { captionLanguagesOf, matchesSession } from './historySearch';
	import { onMount } from 'svelte';
	import { api, isTauri } from './tauri';
	import { asStatus, describeError, type AppError } from './errors';
	import { t, locale, localeTag, formatDateTime } from './i18n';
	import {
		createHistoryCache,
		historyEnabled,
		historyError,
		historyRevision,
		sessionHistory,
		type HistoryEntry,
		type SavedSession
	} from './history';
	import { exportOriginal } from './stores';
	// The same remembered choice as the transcript toolbar's, like the original-speech option.
	import { exportFormat as format, isTimedFormat } from './exportFormat';
	import {
		formatTranscript,
		transcriptFilename,
		hasOriginalSpeech,
		hasTranscriptTiming,
		type TranscriptFormat
	} from './transcript';
	const desktop = isTauri();
	// Raw rather than deeply reactive: the list is only ever replaced, and an unchanged session
	// has to stay the very object the cache holds for the search's own cache to find it. A deep
	// proxy would hand out a new wrapper with every listing.
	let sessions = $state.raw<HistoryEntry[]>([]);
	const cache = createHistoryCache();
	let selectedId = $state('');
	let busy = $state(false);
	// Kept as caught and worded where it is shown, so the core's failures read in the interface
	// language rather than as "[object Object]".
	let error = $state.raw<string | AppError>('');
	let notice = $state('');
	let confirmDelete = $state('');
	const selected = $derived(sessions.find((s) => s.id === selectedId)?.session);
	const timed = $derived(selected ? hasTranscriptTiming(selected.lines) : false);
	let query = $state('');
	let from = $state('');
	let to = $state('');
	let language = $state('');
	let title = $state('');
	const filtered = $derived(
		sessions.filter((entry) =>
			entry.session
				? matchesSession(entry.session, { query, from, to, language })
				: !query && !from && !to && !language
		)
	);
	async function rename() {
		if (!selected || busy) return;
		busy = true;
		error = '';
		try {
			await sessionHistory.rename(selected, title);
			cache.forget(selected.id);
			await refresh();
			notice = $t.usability.titleSaved;
		} catch (e) {
			error = asStatus(e);
		} finally {
			busy = false;
		}
	}
	let request = 0;

	async function refresh() {
		if (!desktop) return;
		const current = ++request;
		try {
			await sessionHistory.flush();
			const listing = await api.listHistory(cache.known());
			if (current !== request) return;
			sessions = cache.apply(listing);
			error = '';
		} catch (e) {
			if (current === request) error = asStatus(e);
		}
	}
	// A recording session writes history after every finalized line, and each write bumps the
	// revision. Re-listing every stored session for each one made an open History tab reread
	// the whole folder several times a minute, so the list catches up at most every few
	// seconds, and then reads only the sessions that changed. Rename, delete and the Refresh
	// button still refresh at once.
	const REFRESH_INTERVAL_MS = 5000;
	let lastRefresh = 0;
	let refreshTimer: ReturnType<typeof setTimeout> | undefined;
	onMount(() => () => {
		request++;
		clearTimeout(refreshTimer);
	});
	$effect(() => {
		void $historyRevision;
		if (refreshTimer !== undefined) return;
		const wait = lastRefresh + REFRESH_INTERVAL_MS - Date.now();
		const run = () => {
			refreshTimer = undefined;
			lastRefresh = Date.now();
			void refresh();
		};
		if (wait <= 0) run();
		else refreshTimer = setTimeout(run, wait);
	});

	/** The session's caption languages, both of them when it had two: `FR + DE`. */
	function captionLanguages(session: SavedSession) {
		const codes = captionLanguagesOf(session);
		return codes.length
			? codes.map((code) => code.toUpperCase()).join(' + ')
			: $t.history.sameLanguage;
	}

	function content(session: SavedSession, format: TranscriptFormat) {
		return formatTranscript(
			session.lines,
			format,
			new Date(session.startedAt),
			{
				title: $t.export.title,
				origin: $t.export.origin,
				original: $t.export.original,
				language: (code) => languageName(code, $locale),
				tag: $localeTag
			},
			{ original: $exportOriginal }
		);
	}
	async function action(kind: 'copy' | 'export') {
		if (!selected || busy) return;
		busy = true;
		error = '';
		notice = '';
		try {
			if (kind === 'copy') {
				await navigator.clipboard.writeText(content(selected, 'text'));
				notice = $t.history.copied;
			} else {
				const path = await api.saveTranscript(
					content(selected, $format),
					transcriptFilename(new Date(selected.startedAt), $format)
				);
				if (path) notice = `${$t.transcript.savedTo} ${path}`;
			}
		} catch (e) {
			error = asStatus(e);
		} finally {
			busy = false;
		}
	}
	async function remove(id: string) {
		if (confirmDelete !== id) {
			confirmDelete = id;
			return;
		}
		busy = true;
		error = '';
		notice = '';
		try {
			await sessionHistory.delete(id);
			if (selectedId === id) selectedId = '';
			confirmDelete = '';
			await refresh();
		} catch (e) {
			error = asStatus(e);
		} finally {
			busy = false;
		}
	}
</script>

<section class="history" aria-label={$t.history.heading}>
	<Preference
		label={$t.history.enable}
		note={$t.history.privacy}
		disabled={!desktop}
		bind:checked={$historyEnabled}
	/>
	{#if !desktop}<p class="hint">{$t.design.desktopOnly}</p>{/if}

	{#if $historyError}
		<p role="alert">{$t.history.failed} {describeError($historyError, $t)}</p>
		<ToolButton disabled={busy || !$historyEnabled} onclick={() => sessionHistory.retry()}
			>{$t.history.retry}</ToolButton
		>
	{/if}
	<ToolButton disabled={!desktop || busy} onclick={refresh}>{$t.history.refresh}</ToolButton>
	{#if !sessions.length}<p class="hint">{$t.history.empty}</p>{/if}
	<div class="filters">
		<Field label={$t.usability.search}><input type="search" bind:value={query} /></Field>
		<DateField label={$t.usability.from} bind:value={from} />
		<DateField label={$t.usability.to} bind:value={to} />
		<Field label={$t.usability.language}
			><Select bind:value={language}
				><option value="">{$t.usability.allLanguages}</option
				>{#each TARGET_LANGUAGES as code (code)}<option value={code}
						>{languageName(code, $locale)}</option
					>{/each}<option value="auto">{$t.usability.unknownLanguage}</option></Select
			></Field
		>
	</div>
	<ToolButton
		disabled={!query && !from && !to && !language}
		onclick={() => {
			query = '';
			from = '';
			to = '';
			language = '';
		}}>{$t.design.clearFilters}</ToolButton
	>
	{#if sessions.length && !filtered.length}<p>{$t.usability.noMatches}</p>{/if}
	<div class="history-browser">
		<ul class="sessions">
			{#each filtered as entry (entry.id)}
				<li>
					<ToolButton
						class="session"
						disabled={busy}
						aria-pressed={selectedId === entry.id}
						onclick={() => {
							selectedId = entry.id;
							title = entry.session?.title ?? '';
							confirmDelete = '';
							notice = '';
						}}
					>
						{#if entry.session}
							<strong
								>{entry.session.title ||
									formatDateTime(entry.session.startedAt, $localeTag)}</strong
							>
							{#if entry.session.title}<span
									>{formatDateTime(entry.session.startedAt, $localeTag)}</span
								>{/if}
							<span
								>{Math.floor(entry.session.durationMs / 60000)}:{String(
									Math.floor(entry.session.durationMs / 1000) % 60
								).padStart(2, '0')} · {entry.session.sourceLanguage === 'auto'
									? $t.history.auto
									: entry.session.sourceLanguage.toUpperCase()} → {captionLanguages(
									entry.session
								)}</span
							>
							{#if !entry.session.endedAt}<span>{$t.history.unfinished}</span>{/if}
						{:else}{$t.history.unreadable} <code>{entry.id}</code>{/if}
					</ToolButton>
				</li>
			{/each}
		</ul>
		<div class="detail">
			{#if selected}
				<form
					onsubmit={(e) => {
						e.preventDefault();
						void rename();
					}}
				>
					<Field label={$t.usability.title}
						><input maxlength="120" bind:value={title} disabled={busy} /></Field
					>
					<p class="hint">{$t.usability.titleHint}</p>
					<ToolButton type="submit" disabled={busy || title.trim() === (selected.title ?? '')}
						>{$t.usability.saveTitle}</ToolButton
					>
				</form>
				<div class="actions">
					<ToolButton disabled={busy} onclick={() => action('copy')}>{$t.history.copy}</ToolButton>
					<Select aria-label={$t.transcript.format} bind:value={$format} disabled={busy}>
						<option value="markdown">Markdown (.md)</option><option value="text"
							>{$t.transcript.plainText} (.txt)</option
						>
						<option value="vtt">WebVTT (.vtt)</option><option value="srt">SubRip (.srt)</option>
					</Select>
					<ToolButton
						disabled={busy || (isTimedFormat($format) && !timed)}
						onclick={() => action('export')}>{$t.transcript.saveAs}</ToolButton
					>
					<ToolButton disabled={busy} onclick={() => remove(selectedId)}
						>{confirmDelete === selectedId
							? $t.history.confirmDelete
							: $t.history.delete}</ToolButton
					>
					{#if confirmDelete === selectedId}<ToolButton
							disabled={busy}
							onclick={() => (confirmDelete = '')}>{$t.history.cancel}</ToolButton
						>{/if}
				</div>
				{#if hasOriginalSpeech(selected.lines)}<Preference
						label={$t.transcript.includeOriginal}
						checked={$exportOriginal}
						disabled={busy}
						onchange={(value) => exportOriginal.set(value)}
					/>{/if}
				{#if isTimedFormat($format) && !timed}<p class="hint">
						{$t.transcript.noTiming}
					</p>{/if}
				<!-- svelte-ignore a11y_no_noninteractive_tabindex (Scrollable saved transcript.) -->
				<div class="saved-text" role="region" aria-label={$t.history.fullTranscript} tabindex="0">
					{#each [...selected.lines].reverse() as line (line.id)}
						<p><strong>{$t.transcript.side[line.origin]}</strong> {line.text}</p>
						{#if line.sourceText}<p class="source">{line.sourceText}</p>{/if}
					{/each}
				</div>
			{:else if selectedId}
				<p class="hint">{$t.history.unreadable}</p>
				<ToolButton class="danger" disabled={busy} onclick={() => remove(selectedId)}
					>{confirmDelete === selectedId ? $t.history.confirmDelete : $t.history.delete}</ToolButton
				>
				{#if confirmDelete === selectedId}<ToolButton onclick={() => (confirmDelete = '')}
						>{$t.history.cancel}</ToolButton
					>{/if}
			{:else}<p class="hint">{$t.design.selectSession}</p>
			{/if}
		</div>
	</div>
	{#if error}<p role="alert">{$t.history.failed} {describeError(error, $t)}</p>{/if}
	<p class="notice" role="status">{notice}</p>
</section>

<style>
	.history {
		display: grid;
		gap: var(--space-3);
		min-width: 0;
	}
	.filters {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--space-2);
	}
	.history-browser {
		display: grid;
		grid-template-columns: minmax(11rem, 0.8fr) minmax(0, 1.4fr);
		gap: var(--space-4);
		align-items: start;
	}
	.sessions {
		list-style: none;
		padding: 0;
		margin: 0;
		max-height: 28rem;
		overflow: auto;
	}
	li {
		margin-bottom: var(--space-2);
	}
	.sessions :global(.session) {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		width: 100%;
		text-align: left;
		overflow-wrap: anywhere;
		line-height: var(--leading-body);
	}
	.sessions :global(.session span) {
		color: var(--text-muted);
		font-size: var(--type-caption);
	}
	.detail {
		min-width: 0;
	}
	form {
		display: grid;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: center;
	}
	.actions :global(.ui-select) {
		flex: 1;
		min-width: 9rem;
	}
	.hint,
	.source,
	.notice {
		color: var(--text-muted);
		font-size: var(--type-small);
		line-height: var(--leading-body);
		margin: 0;
		overflow-wrap: anywhere;
	}
	.saved-text {
		max-height: 24rem;
		overflow: auto;
		overflow-wrap: anywhere;
		margin-top: var(--space-4);
		border-top: 1px solid var(--line);
		font-size: var(--type-body);
		line-height: var(--leading-body);
	}
	.saved-text p {
		margin: var(--space-3) 0;
	}
	/* Asked of the settings dialog, in `em`, for the same reason as the appearance layout. */
	@container dialog (max-width: 40em) {
		.filters {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.history-browser {
			grid-template-columns: minmax(0, 1fr);
		}
		.sessions {
			max-height: 12rem;
		}
	}
</style>
