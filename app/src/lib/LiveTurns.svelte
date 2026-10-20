<script lang="ts">
	import { CAPTION_TAIL_CHARS, tail } from './captionLayout';
	import { locale, t } from './i18n';
	import { languageName } from './languages';
	import { currentCaptions, options } from './stores';
	import {
		laneCount,
		laneLanguage,
		trackLane,
		trackOrigin,
		type Caption,
		type Origin,
		type Track
	} from './types';

	type Turn = { track: Track; origin: Origin; caption: Caption; text: string; source: string };

	// The speakers currently on screen, least-recently-updated first (newest at the bottom).
	// A turn streams until it completes, which in continuous speech can be many minutes, and it
	// is laid out again at display size on every interim. Only its newest part is shown, to the
	// same bound the overlay keeps; the transcript below holds every word.
	const liveTurns = $derived(
		(Object.keys($currentCaptions) as Track[]).flatMap((track): Turn[] => {
			const caption = $currentCaptions[track];
			if (!caption) return [];
			return [
				{
					track,
					origin: trackOrigin(track),
					caption,
					text: tail(caption.text, CAPTION_TAIL_CHARS),
					source: tail(caption.sourceText, CAPTION_TAIL_CHARS)
				}
			];
		})
	);
	// With two caption languages each speaker appears twice, so each block says which language
	// it is in; the original speech is shown once, on the first.
	const dual = $derived(laneCount($options) === 2);
	function laneName(track: Track): string {
		const language = laneLanguage($options, trackLane(track));
		return language ? languageName(language, $locale) : '';
	}
</script>

<div class="stage-head">
	<h2 class="kicker">{$t.stage.onScreen}</h2>
	<span class="stretch"></span>
	<span class="stage-note">
		{liveTurns.length > 1 ? $t.stage.twoSpeakers : $t.stage.newestLast}
	</span>
</div>

{#if liveTurns.length}
	<div class="turns">
		{#each liveTurns as turn (turn.track)}
			<article class="turn">
				<div class="turn-who">
					<span class="origin-chip {turn.origin}">
						{$options.provider === 'ondevice' ? $t.stage.origin.demo : $t.stage.origin[turn.origin]}
					</span>
					<span class="origin-sub">
						{dual
							? laneName(turn.track)
							: $options.provider === 'ondevice'
								? $t.stage.originSub.demo
								: $t.stage.originSub[turn.origin]}
					</span>
				</div>
				<div class="turn-text">
					{#if turn.source && !(dual && trackLane(turn.track) === 1)}
						<p class="turn-source">{turn.source}</p>
					{/if}
					<p class="turn-caption" class:live={!turn.caption.final}>
						{turn.text}{#if !turn.caption.final}<span class="caret"></span>{/if}
					</p>
				</div>
			</article>
		{/each}
	</div>
{:else}
	<p class="hint stage-hint">
		{$options.mode === 'translate'
			? $t.stage.waitingTranslation
			: $options.provider === 'ondevice'
				? $t.stage.waitingDemo
				: $t.stage.waitingSubtitles}
	</p>
{/if}

<style>
	/* Direct children of the stage's scrolling column: they keep their height rather than
	   compress, so a short window scrolls instead of clipping text. */
	.stage-head,
	.turns,
	.stage-hint,
	.kicker {
		flex: 0 0 auto;
	}
	.stage-head {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.stretch {
		flex: 1;
		height: 1px;
		background: var(--line);
	}
	.stage-note {
		font-size: var(--type-small);
		line-height: 1;
		color: var(--text-muted);
	}
	.stage-hint {
		margin-top: var(--space-5);
		font-size: var(--type-body);
	}
	.turns {
		display: flex;
		flex-direction: column;
		margin-top: var(--space-2);
	}
	.turn {
		display: grid;
		/* 96px at 100%; in `em` so the origin chip and its timestamp keep their gutter
		   instead of wrapping into the caption when the text grows. */
		grid-template-columns: 6em minmax(0, 1fr);
		gap: var(--space-4);
		padding: var(--space-5) 0;
		border-bottom: 1px solid var(--line);
	}
	.turn-who {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding-top: var(--space-1);
	}
	.origin-chip {
		align-self: flex-start;
		font-size: var(--type-caption);
		font-weight: 600;
		line-height: 1;
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-control);
	}
	/* Neutral, so mint keeps one meaning in this window — live, primary, on — and the room
	   keeps its blue. Two speakers still read as two: one tinted, one plain. */
	.origin-chip.system {
		color: var(--text-secondary);
		background: var(--surface-2);
	}
	.origin-chip.microphone {
		color: var(--room-soft);
		background: var(--room-chip);
	}
	.origin-sub {
		font-family: var(--font-mono);
		font-size: var(--type-caption);
		line-height: 1;
		color: var(--text-muted);
	}
	.turn-text {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		max-width: 60ch;
	}
	.turn-source {
		margin: 0;
		font-size: var(--type-body);
		line-height: var(--leading-body);
		color: var(--text-muted);
		text-wrap: pretty;
	}
	.turn-caption {
		margin: 0;
		font-size: var(--type-display);
		font-weight: 600;
		line-height: 1.3;
		letter-spacing: -0.015em;
		color: var(--text-secondary);
		text-wrap: pretty;
	}
	.turn-caption.live {
		color: var(--text-bright);
	}
	.caret {
		display: inline-block;
		width: 3px;
		height: 0.9em;
		background: var(--accent);
		margin-left: var(--space-2);
		vertical-align: -2px;
		animation: blink 1.1s steps(1) infinite;
	}
	@media (prefers-reduced-motion: reduce) {
		.caret {
			animation: none;
		}
	}
</style>
