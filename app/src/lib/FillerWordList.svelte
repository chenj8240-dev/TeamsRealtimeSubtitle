<script lang="ts">
	import { tick } from 'svelte';
	import { t } from './i18n';
	import { overlayFillerWords } from './stores';
	import {
		addFillerWord,
		DEFAULT_FILLER_WORDS,
		isDefaultFillerWords,
		MAX_FILLER_WORD_LENGTH,
		MAX_FILLER_WORDS,
		removeFillerWord,
		type FillerWordProblem
	} from './cleanSpeech';
	import type { OverlayController } from './overlayController.svelte';
	import Field from './ui/Field.svelte';
	import ToolButton from './ui/ToolButton.svelte';

	/** The words Hide filler words removes: shown, added one at a time, removed, or put back to
	 *  the built-in list. Every change reaches the overlay at once through the controller. */
	let { overlay }: { overlay: OverlayController } = $props();
	const id = $props.id();
	const m = $derived($t.overlayControls.fillerWords);

	let draft = $state('');
	let problem = $state<{ kind: Exclude<FillerWordProblem, 'blank'>; word: string } | null>(null);
	let announcement = $state('');
	let chips = $state<HTMLUListElement>();
	let field = $state<HTMLInputElement>();

	const message = $derived.by(() => {
		if (!problem) return '';
		const text = m.problem;
		if (problem.kind === 'length') return text.length(MAX_FILLER_WORD_LENGTH);
		if (problem.kind === 'full') return text.full(MAX_FILLER_WORDS);
		if (problem.kind === 'duplicate') return text.duplicate(problem.word);
		return text[problem.kind];
	});

	/** Said once by the status region. Cleared first, so removing, re-adding and removing the
	 *  same word is announced every time rather than only the first. */
	async function announce(text: string) {
		announcement = '';
		await tick();
		announcement = text;
	}

	function add(event: SubmitEvent) {
		event.preventDefault();
		const result = addFillerWord($overlayFillerWords, draft);
		if ('problem' in result) {
			problem = result.problem === 'blank' ? null : { kind: result.problem, word: draft.trim() };
			return;
		}
		overlay.setFillerWords(result.list);
		draft = '';
		problem = null;
		void announce(m.added(result.word));
	}

	async function remove(word: string, index: number) {
		overlay.setFillerWords(removeFillerWord($overlayFillerWords, word));
		problem = null;
		void announce(m.removed(word));
		// The button that had focus is gone. Keep the keyboard in the list: on the word that
		// took its place, the one before it at the end, or the field once the list is empty.
		await tick();
		const buttons = chips?.querySelectorAll('button');
		(buttons?.[Math.min(index, buttons.length - 1)] ?? field)?.focus();
	}

	function reset() {
		overlay.setFillerWords(DEFAULT_FILLER_WORDS);
		problem = null;
		void announce(m.restored);
		// Reset is disabled once the list is the default, so it cannot keep focus.
		field?.focus();
	}
</script>

<div class="fillers" role="group" aria-labelledby="{id}-heading">
	<span class="heading" id="{id}-heading">{m.heading}</span>
	<p class="note">{m.hint}</p>
	{#if $overlayFillerWords.length}
		<ul bind:this={chips} aria-labelledby="{id}-heading">
			{#each $overlayFillerWords as word, index (word.toLowerCase())}
				<li>
					<ToolButton
						size="sm"
						aria-label={m.remove(word)}
						title={m.remove(word)}
						onclick={() => void remove(word, index)}
						><span class="word">{word}</span><svg
							width="10"
							height="10"
							viewBox="0 0 10 10"
							fill="none"
							stroke="currentColor"
							stroke-width="1.6"
							stroke-linecap="round"
							aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" /></svg
						></ToolButton
					>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="note">{m.empty}</p>
	{/if}
	<form onsubmit={add}>
		<Field label={m.add}
			><input
				bind:this={field}
				bind:value={draft}
				autocomplete="off"
				spellcheck="false"
				aria-invalid={problem ? 'true' : undefined}
				aria-describedby={problem ? `${id}-problem` : undefined}
				oninput={() => (problem = null)}
			/></Field
		>
		<ToolButton type="submit" disabled={!draft.trim()}>{m.addButton}</ToolButton>
	</form>
	{#if problem}<p class="problem" id="{id}-problem" role="alert">{message}</p>{/if}
	<div>
		<ToolButton variant="ghost" disabled={isDefaultFillerWords($overlayFillerWords)} onclick={reset}
			>{m.reset}</ToolButton
		>
	</div>
	<p class="sr-only" role="status">{announcement}</p>
</div>

<style>
	/* Set under the toggle it belongs to, so the list reads as part of that one setting. */
	.fillers {
		display: grid;
		gap: var(--space-2);
		margin-left: var(--space-3);
		padding-left: var(--space-3);
		border-left: 1px solid var(--line);
		font-size: var(--type-small);
		color: var(--text-secondary);
	}
	.heading {
		font-weight: 600;
	}
	.note {
		margin: 0;
		line-height: var(--leading-body);
		color: var(--text-muted);
	}
	ul {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.word {
		overflow-wrap: anywhere;
		line-height: var(--leading-tight);
	}
	form {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: end;
		gap: var(--space-2);
	}
	.problem {
		margin: 0;
		line-height: var(--leading-body);
		color: var(--danger-soft);
	}
</style>
