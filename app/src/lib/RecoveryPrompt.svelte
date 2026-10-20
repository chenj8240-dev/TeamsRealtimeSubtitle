<script lang="ts">
	// Shown at launch when a recovery spool from a previous run is still on disk — the app
	// went down before its transcript was saved. Answered before anything else, because
	// restoring replaces the log and a session started first would be overwritten.

	import ModalPrompt from './ModalPrompt.svelte';
	import ToolButton from './ui/ToolButton.svelte';
	import { t } from './i18n';

	interface Props {
		lines: number;
		/** When the spool was last written, already formatted for display. */
		savedAt: string;
		/** Full path, so the operator knows exactly what "Delete" removes. */
		path: string;
		onRestore: () => void;
		onDelete: () => void;
	}

	let { lines, savedAt, path, onRestore, onDelete }: Props = $props();

	let restoreEl = $state<HTMLButtonElement | null>(null);

	$effect(() => {
		restoreEl?.focus();
	});
</script>

<!-- No Escape dismissal: leaving it unanswered would leave captions on disk that the operator
     never chose to keep, which is the one outcome this feature must not produce. -->
<ModalPrompt title={$t.prompt.recovery.title}>
	<p>{$t.prompt.recovery.body(lines, savedAt)}</p>

	<div class="actions">
		<ToolButton variant="primary" size="lg" bind:element={restoreEl} onclick={onRestore}>
			{$t.prompt.recovery.restore}
		</ToolButton>
		<ToolButton variant="danger" size="lg" onclick={onDelete}
			>{$t.prompt.recovery.delete}</ToolButton
		>
	</div>
	<p class="note">
		{$t.prompt.recovery.noteBefore} <code>{path}</code>{$t.prompt.recovery.noteAfter}
	</p>
</ModalPrompt>
