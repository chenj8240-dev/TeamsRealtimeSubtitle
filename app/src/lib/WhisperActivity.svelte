<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from './i18n';
	import { isRunning, statusMessage } from './stores';
	import { api, on } from './tauri';
	import { asStatus } from './errors';
	import {
		noteWhisperProgress,
		whisperFinalizing as finalizing,
		whisperPendingSeconds as pending,
		whisperProgress
	} from './whisperProgress';
	import ToolButton from './ui/ToolButton.svelte';

	// Discard asks a second time before throwing audio away, and the question goes as soon as
	// there is nothing left to discard. `$derived` is writable: the button sets it, and the
	// backlog starting or ending resets it.
	const backlogged = $derived($isRunning && $pending > 0);
	let confirmDiscard = $derived.by(() => {
		void backlogged;
		return false;
	});
	// The backlog is shared with the quit prompt, so a finished run's figure is cleared rather
	// than only hidden — again if a late report lands after the run has ended.
	$effect(() => {
		void $pending;
		if (!$isRunning) whisperProgress.set({});
	});
	onMount(() => {
		let disposed = false;
		let cleanup: (() => void) | undefined;
		void on.whisperProgress(noteWhisperProgress).then((fn) => {
			if (disposed) fn();
			else cleanup = fn;
		});
		return () => {
			disposed = true;
			cleanup?.();
		};
	});
	async function discard() {
		confirmDiscard = false;
		try {
			await api.discardWhisperPending();
		} catch (error) {
			statusMessage.set(asStatus(error));
		}
	}
</script>

{#if $isRunning && ($pending > 0 || $finalizing)}
	<div class="local-progress" role="status">
		<span>{$finalizing ? $t.whisper.processing : $t.whisper.pending} · {$pending} s</span>
		{#if $finalizing && $pending > 0}
			<ToolButton onclick={() => (confirmDiscard = true)}>{$t.whisper.discard}</ToolButton>
		{/if}
	</div>
{/if}
{#if confirmDiscard}
	<div class="discard-confirm" role="alert">
		<p>{$t.whisper.discardConfirm}</p>
		<ToolButton onclick={discard}>{$t.whisper.discard}</ToolButton>
		<ToolButton onclick={() => (confirmDiscard = false)}>{$t.history.cancel}</ToolButton>
	</div>
{/if}

<style>
	.local-progress,
	.discard-confirm {
		padding: var(--space-3);
		border: 1px solid var(--line);
		border-radius: var(--radius-card);
		font-size: var(--type-small);
	}
	.local-progress {
		display: flex;
		gap: var(--space-3);
		align-items: center;
		justify-content: space-between;
	}
</style>
