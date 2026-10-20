<script lang="ts">
	import Field from './ui/Field.svelte';
	import Select from './ui/Select.svelte';
	import { onMount } from 'svelte';
	import { options } from './stores';
	import { t } from './i18n';
	import type { AudioDevice, CaptureApplication } from './types';
	let {
		locked,
		outputs,
		applications,
		supported,
		refresh,
		changed
	}: {
		locked: boolean;
		outputs: AudioDevice[];
		applications: CaptureApplication[];
		supported: boolean | null;
		refresh: () => Promise<void>;
		changed: () => void;
	} = $props();
	const applicationMode = $derived($options.systemCapture?.kind === 'application');
	const selected = $derived(
		$options.systemCapture?.kind === 'application' ? $options.systemCapture.process : null
	);
	const selectionKey = $derived(selected ? `${selected.pid}:${selected.createdAt}` : '');
	onMount(() => {
		void refresh();
	});
</script>

<div class="capture-picker">
	<Field label={$t.applications.mode}>
		<Select
			disabled={locked}
			value={applicationMode ? 'application' : 'output'}
			onchange={(e) => {
				changed();
				$options = {
					...$options,
					systemCapture:
						e.currentTarget.value === 'application'
							? { kind: 'application', process: null }
							: { kind: 'output' }
				};
			}}
		>
			<option value="output">{$t.applications.output}</option>
			<option value="application">{$t.applications.application}</option>
		</Select>
	</Field>
	{#if applicationMode}
		<Field label={$t.applications.choose}>
			<Select
				disabled={locked || supported === false}
				value={selectionKey}
				onchange={(e) => {
					const app = applications.find(
						(a) => `${a.process.pid}:${a.process.createdAt}` === e.currentTarget.value
					);
					changed();
					$options = {
						...$options,
						systemCapture: { kind: 'application', process: app?.process ?? null }
					};
				}}
			>
				<option value="">{$t.applications.choose}</option>
				{#if selected && !applications.some((a) => a.process.pid === selected.pid && a.process.createdAt === selected.createdAt)}
					<option value={selectionKey}>{$t.applications.missing}</option>
				{/if}
				{#each applications as app (app.process.pid)}
					<option value={`${app.process.pid}:${app.process.createdAt}`}
						>{app.name} (PID {app.process.pid})</option
					>
				{/each}
			</Select>
		</Field>
		{#if supported === false}<p class="hint" role="status">{$t.applications.unsupported}</p>
		{:else if supported && !applications.length}<p class="hint" role="status">
				{$t.applications.empty}
			</p>{/if}
	{:else}
		<Field label={$t.devices.output}>
			<Select
				disabled={locked}
				value={$options.systemDeviceId ?? ''}
				onchange={(e) => {
					changed();
					$options = { ...$options, systemDeviceId: e.currentTarget.value || null };
				}}
			>
				<option value="">{$t.rail.systemDefault}</option>
				{#if $options.systemDeviceId && !outputs.some((d) => d.id === $options.systemDeviceId)}<option
						value={$options.systemDeviceId}>{$t.devices.missing}</option
					>{/if}
				{#each outputs as dev (dev.id)}<option value={dev.id}
						>{dev.isDefault ? $t.rail.isDefault(dev.name) : dev.name}</option
					>{/each}
			</Select>
		</Field>
	{/if}
</div>

<style>
	.capture-picker {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
	}
	/* Tighter and quieter than the shared field: the microphone's field in the same sheet
	   keeps the shared look. */
	.capture-picker > :global(.ui-field) {
		gap: var(--space-1);
		color: var(--text-muted);
	}
	.hint {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--type-small);
		line-height: var(--leading-body);
	}
</style>
