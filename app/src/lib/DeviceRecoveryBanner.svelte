<script lang="ts">
	import { t } from './i18n';
	import ToolButton from './ui/ToolButton.svelte';
	import { options } from './stores';
	import type { Origin } from './types';

	let {
		failed,
		busy,
		onRetry,
		onFallback,
		onReselect
	}: {
		/** The source whose capture device failed. */
		failed: Origin;
		busy: boolean;
		/** Start again on the same device. */
		onRetry: () => void;
		/** Start again on the Windows default device. */
		onFallback: () => void;
		/** Pick the captured application again; its process has gone. */
		onReselect: () => void;
	} = $props();

	const application = $derived(
		failed === 'system' && $options.systemCapture?.kind === 'application'
	);
</script>

<section class="device-recovery" aria-label={$t.devices.retry}>
	<p class="hint">
		<strong>{failed === 'microphone' ? $t.source.microphone : $t.source.system}</strong>: {application
			? $t.applications.recovery
			: $t.devices.recovery}
	</p>
	<ToolButton disabled={busy} onclick={onRetry}>{$t.devices.retry}</ToolButton>
	<ToolButton disabled={busy} onclick={application ? onReselect : onFallback}
		>{application ? $t.applications.reselect : $t.devices.fallback}</ToolButton
	>
</section>

<style>
	.device-recovery {
		padding: var(--space-3) var(--space-5);
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		border-bottom: 1px solid var(--line-strong);
	}
	.device-recovery p {
		flex-basis: 100%;
	}
	.device-recovery > :global(.ui-tool) {
		flex: 1;
	}
</style>
