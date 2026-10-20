<script lang="ts">
	// Shown the first time closing the window hides the app instead of quitting it.
	//
	// An app that disappears from the taskbar and keeps running reads as a crash unless it
	// says otherwise — and this one may still be holding a microphone. Said once, in the
	// window the operator is looking at, rather than as a toast: Focus Assist, notification
	// settings and a full-screen slideshow can all swallow a toast, and this is the one
	// message that has to land.

	import ModalPrompt from './ModalPrompt.svelte';
	import ToolButton from './ui/ToolButton.svelte';
	import { t } from './i18n';

	interface Props {
		/** True when a session is still running, which is what makes this worth saying. */
		running: boolean;
		onChoice: (choice: 'hide' | 'quit') => void;
	}

	let { running, onChoice }: Props = $props();

	let hideEl = $state<HTMLButtonElement | null>(null);

	$effect(() => {
		hideEl?.focus();
	});
</script>

<ModalPrompt title={$t.prompt.trayHide.title} onDismiss={() => onChoice('quit')}>
	<p>
		{$t.prompt.trayHide.bodyBefore}
		{running ? $t.prompt.trayHide.bodyRunning : $t.prompt.trayHide.bodyIdle}
		{$t.prompt.trayHide.bodyAfter}
	</p>
	<p class="note">
		{$t.prompt.trayHide.noteBefore}
		<em>{$t.prompt.trayHide.noteEmphasis}</em>{$t.prompt.trayHide.noteAfter}
	</p>

	<div class="actions">
		<ToolButton variant="primary" size="lg" bind:element={hideEl} onclick={() => onChoice('hide')}>
			{$t.prompt.trayHide.hide}
		</ToolButton>
		<ToolButton variant="ghost" size="lg" onclick={() => onChoice('quit')}
			>{$t.prompt.trayHide.quit}</ToolButton
		>
	</div>
</ModalPrompt>

<style>
	em {
		font-style: normal;
		color: var(--text-secondary);
	}
</style>
