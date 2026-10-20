<script lang="ts">
	// The last thing between a live session's transcript and nothing at all. Shown when the
	// operator closes the window with finalized captions that never reached disk (issue #25).

	import ModalPrompt from './ModalPrompt.svelte';
	import ToolButton from './ui/ToolButton.svelte';
	import { t } from './i18n';
	import type { CloseChoice } from './document';

	interface Props {
		/** Finalized lines that would be lost. */
		lines: number;
		/** True when the close arrived mid-session and capture has just been drained, so the
		 *  count can be explained rather than appearing from nowhere. */
		endedSession: boolean;
		/** Set while the transcript is being written, so Save cannot be pressed twice. */
		saving: boolean;
		/** Last save failure — kept on screen rather than quitting on a write that did not land. */
		error: string;
		onChoice: (choice: CloseChoice) => void;
	}

	let { lines, endedSession, saving, error, onChoice }: Props = $props();

	let saveEl = $state<HTMLButtonElement | null>(null);

	// Save is the recoverable answer, so it takes focus: Enter keeps the transcript, and the
	// destructive button has to be aimed at.
	$effect(() => {
		saveEl?.focus();
	});
</script>

<ModalPrompt title={$t.prompt.unsaved.title} onDismiss={() => onChoice('cancel')}>
	<p>
		{#if endedSession}{$t.prompt.unsaved.sessionEnded}{/if}
		{$t.prompt.unsaved.body(lines)}
	</p>

	{#if error}
		<p class="error" role="alert">{$t.prompt.unsaved.failed(error)}</p>
	{/if}

	<div class="actions">
		<ToolButton
			variant="primary"
			size="lg"
			bind:element={saveEl}
			disabled={saving}
			onclick={() => onChoice('save')}
		>
			{saving ? $t.prompt.unsaved.saving : $t.prompt.unsaved.save}
		</ToolButton>
		<ToolButton variant="danger" size="lg" disabled={saving} onclick={() => onChoice('discard')}>
			{$t.prompt.unsaved.discard}
		</ToolButton>
		<ToolButton variant="ghost" size="lg" disabled={saving} onclick={() => onChoice('cancel')}
			>{$t.prompt.unsaved.cancel}</ToolButton
		>
	</div>
	<p class="note">{$t.prompt.unsaved.note}</p>
</ModalPrompt>
