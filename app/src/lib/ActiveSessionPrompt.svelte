<script lang="ts">
	// Asked before anything is stopped, when leaving would cut a live session short.
	//
	// The whole point of issue #22 is that an accidental click on the window's X must not end
	// an event's captions. So this comes first — ahead of the stop, ahead of the drain, ahead
	// of any question about the transcript — and its safe answer is the one that changes
	// nothing.

	import ModalPrompt from './ModalPrompt.svelte';
	import ToolButton from './ui/ToolButton.svelte';
	import { t } from './i18n';

	interface Props {
		/** Elapsed session time, already formatted, so the operator can see what they would
		 *  be ending rather than being asked about an abstraction. */
		elapsed: string;
		/** True when the request came from the tray rather than the window's close button. */
		fromTray: boolean;
		/** Local Whisper audio not yet transcribed, in seconds. Quitting gives it a few seconds
		 *  and then discards the rest, so the operator hears about it before choosing. */
		pendingSeconds?: number;
		onChoice: (stop: boolean) => void;
	}

	let { elapsed, fromTray, pendingSeconds = 0, onChoice }: Props = $props();

	let keepEl = $state<HTMLButtonElement | null>(null);

	// Focus stays on the answer that keeps the session: Enter is safe, and ending an event's
	// captions has to be aimed at.
	$effect(() => {
		keepEl?.focus();
	});
</script>

<ModalPrompt title={$t.prompt.activeSession.title} onDismiss={() => onChoice(false)}>
	<p>{$t.prompt.activeSession.body(elapsed)}</p>
	{#if pendingSeconds > 0}
		<p>{$t.prompt.activeSession.whisperPending(pendingSeconds)}</p>
	{/if}
	{#if !fromTray}
		<p class="note">
			{$t.prompt.activeSession.noteBefore}
			<em>{$t.prompt.activeSession.noteEmphasis}</em>{$t.prompt.activeSession.noteAfter}
		</p>
	{/if}

	<div class="actions">
		<ToolButton variant="primary" size="lg" bind:element={keepEl} onclick={() => onChoice(false)}>
			{$t.prompt.activeSession.keep}
		</ToolButton>
		<ToolButton variant="danger" size="lg" onclick={() => onChoice(true)}
			>{$t.prompt.activeSession.stop}</ToolButton
		>
	</div>
</ModalPrompt>

<style>
	em {
		font-style: normal;
		color: var(--text-secondary);
	}
</style>
