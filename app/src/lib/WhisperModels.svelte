<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from './i18n';
	import { options, whisperModels, statusMessage } from './stores';
	import { api } from './tauri';
	import { asStatus } from './errors';
	import { WHISPER_MODELS, type WhisperModelId } from './types';
	import Field from './ui/Field.svelte';
	import Select from './ui/Select.svelte';
	import ToolButton from './ui/ToolButton.svelte';

	let { locked, browserMode }: { locked: boolean; browserMode: boolean } = $props();
	let busy = $state(false);
	let refreshing = false;
	let disposed = false;
	const selected = $derived($options.whisperModel ?? 'base');
	const model = $derived($whisperModels.find((m) => m.id === selected));
	const downloading = $derived($whisperModels.some((m) => m.downloading));
	const percent = $derived(model ? Math.floor((model.downloadedBytes / model.bytes) * 100) : 0);

	async function refresh() {
		if (browserMode || disposed || refreshing) return;
		refreshing = true;
		try {
			const models = await api.whisperModels();
			if (!disposed) whisperModels.set(models);
		} catch (error) {
			if (!disposed) statusMessage.set(asStatus(error));
		} finally {
			refreshing = false;
		}
	}
	async function download() {
		if (locked || busy || downloading || browserMode) return;
		busy = true;
		statusMessage.set('');
		try {
			await api.downloadWhisperModel(selected);
		} catch (error) {
			statusMessage.set(asStatus(error));
		} finally {
			busy = false;
			await refresh();
		}
	}
	async function remove() {
		if (locked || busy || downloading || browserMode) return;
		busy = true;
		try {
			await api.removeWhisperModel(selected);
		} catch (error) {
			statusMessage.set(asStatus(error));
		} finally {
			busy = false;
			await refresh();
		}
	}
	async function cancel() {
		try {
			await api.cancelWhisperDownload();
		} catch (error) {
			statusMessage.set(asStatus(error));
		}
	}
	onMount(() => {
		void refresh();
		const timer = setInterval(() => {
			if (busy || downloading) void refresh();
		}, 500);
		return () => {
			disposed = true;
			clearInterval(timer);
		};
	});
</script>

<div class="models">
	<Field label={$t.whisper.model}>
		<Select
			value={selected}
			disabled={locked || busy || downloading}
			onchange={(e) =>
				($options = { ...$options, whisperModel: e.currentTarget.value as WhisperModelId })}
		>
			{#each WHISPER_MODELS as id (id)}
				<option value={id}
					>{$t.whisper[id]}{#if $whisperModels.find((m) => m.id === id)}
						— {Math.ceil($whisperModels.find((m) => m.id === id)!.bytes / 1048576)} MiB{/if}</option
				>
			{/each}
		</Select>
	</Field>
	<!-- Translation is where the small models fall short, so it is the one place to say so. -->
	<p class="hint">
		{$options.provider === 'whisper-translate' ? $t.whisper.translateHint : $t.whisper.hint}
	</p>
	<p class="hint" role="status">
		{model?.downloading
			? `${$t.whisper.downloading} ${percent}%`
			: model?.installed
				? $t.whisper.ready
				: $t.whisper.missing}
	</p>
	{#if model?.downloading}
		<progress value={model.downloadedBytes} max={model.bytes} aria-label={$t.whisper.downloading}
		></progress>
	{/if}
	<div class="actions">
		{#if busy || downloading}
			<ToolButton disabled={locked || !downloading} onclick={cancel}>{$t.whisper.cancel}</ToolButton
			>
		{:else if model?.installed}
			<ToolButton disabled={locked || browserMode || model.inUse} onclick={remove}
				>{$t.whisper.remove}</ToolButton
			>
		{:else}
			<ToolButton disabled={locked || browserMode} onclick={download}
				>{$t.whisper.download}</ToolButton
			>
		{/if}
	</div>
</div>

<style>
	/* The same 8px rhythm as every other block in the rail: the select, the two notes under
	   it and the button each get their own line, rather than stacking flush. */
	.models {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}
	.models > :global(.ui-field) {
		align-self: stretch;
	}
	progress {
		width: 100%;
		accent-color: var(--accent);
	}
	.actions {
		display: flex;
		gap: var(--space-2);
	}
</style>
