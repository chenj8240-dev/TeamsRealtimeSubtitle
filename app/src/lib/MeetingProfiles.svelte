<script lang="ts">
	import { languageName } from './languages';
	import { locale } from './i18n';
	import Select from './ui/Select.svelte';
	import Field from './ui/Field.svelte';
	import ToolButton from './ui/ToolButton.svelte';
	import { get } from 'svelte/store';
	import { t } from './i18n';
	import { api, isTauri } from './tauri';
	import { describeError } from './errors';
	import { validateDevices } from './audioDevices';
	import { captionLanguageOf } from './types';
	import { normalizeStartOptions } from './startOptions';
	import { PROFILES_KEY, decodeProfiles, type MeetingProfile } from './profiles';
	import { readStored, writeStored } from './persisted';
	import { appearance, applyAppearance, options } from './stores';
	import { normalizeAppearance } from './appearance';
	import type { OverlayController } from './overlayController.svelte';
	let {
		locked,
		overlay,
		onLoaded,
		onBusy
	}: {
		locked: boolean;
		overlay: OverlayController;
		onLoaded: () => Promise<void>;
		onBusy: (busy: boolean) => void;
	} = $props();
	// Through `persisted.ts`, so storage that refuses access leaves an empty list rather than a
	// component that throws while the operator window mounts.
	let profiles = $state(decodeProfiles(readStored(PROFILES_KEY)));
	let expanded = $state(false);
	let editing = $state<'save' | 'rename' | null>(null);
	let selected = $state('');
	let name = $state('');
	let busy = $state(false);
	let notice = $state('');
	let error = $state('');
	let confirming = $state(false);
	let rowMenu = $state('');
	let renameId = $state('');
	/** A refused write keeps the profiles for the rest of the run, like every preference. */
	function persist(next: MeetingProfile[]) {
		writeStored(PROFILES_KEY, JSON.stringify(next));
		profiles = next;
	}
	async function perform(action: () => Promise<void>) {
		if (locked || busy) return;
		busy = true;
		onBusy(true);
		error = '';
		notice = '';
		try {
			await action();
		} catch (e) {
			error = describeError(e, get(t));
		} finally {
			busy = false;
			onBusy(false);
		}
	}
	function save() {
		return perform(async () => {
			if (!name.trim()) return;
			const profile: MeetingProfile = {
				id: crypto.randomUUID(),
				name: name.trim().slice(0, 80),
				options: normalizeStartOptions(get(options)),
				// A normalized copy, so the profile never shares the live palette object.
				appearance: normalizeAppearance(get(appearance)),
				placement: isTauri() ? await api.getOverlayPlacement() : null
			};
			persist([...profiles, profile]);
			selected = profile.id;
			name = '';
			editing = null;
			expanded = true;
			notice = get(t).usability.profileSaved;
		});
	}
	function load() {
		return perform(async () => {
			const profile = profiles.find((p) => p.id === selected);
			if (!profile) return;
			const [mics, outputs] = await Promise.all([api.listMicrophones(), api.listOutputs()]);
			const saved = normalizeStartOptions(profile.options);
			const checked = validateDevices(saved, mics, outputs);
			// Through the controller, which also remembers it for this display layout.
			if (profile.placement) await overlay.applyPlacement(profile.placement);
			options.set(checked);
			applyAppearance(profile.appearance);
			overlay.initialize();
			overlay.pushOverlayConfig({ interactive: overlay.moveOverlay });
			await onLoaded();
			notice =
				(saved.micDeviceId && !checked.micDeviceId) ||
				(saved.systemDeviceId && !checked.systemDeviceId)
					? get(t).usability.profileMissing
					: get(t).usability.profileLoaded;
		});
	}
	function remove() {
		if (!confirming) {
			confirming = true;
			return;
		}
		return perform(async () => {
			persist(profiles.filter((p) => p.id !== selected));
			selected = '';
			editing = null;
			rowMenu = '';
			confirming = false;
		});
	}

	function rename() {
		return perform(async () => {
			if (!name.trim()) return;
			persist(
				profiles.map((p) => (p.id === renameId ? { ...p, name: name.trim().slice(0, 80) } : p))
			);
			editing = null;
			name = '';
			notice = get(t).usability.profileSaved;
		});
	}
</script>

<section class="profiles" aria-label={$t.usability.profiles}>
	<div class="picker">
		<Field label={$t.usability.profiles}>
			<!-- Named by the visible field label, so what a voice-control user reads on screen is
			     what the control answers to (WCAG 2.5.3). -->
			<Select
				bind:value={selected}
				disabled={locked || busy}
				onchange={() => {
					confirming = false;
					editing = null;
					expanded = true;
				}}
			>
				<option value="">{$t.usability.chooseProfile}</option>
				{#each profiles as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
			</Select>
		</Field>
		<ToolButton
			aria-label={$t.design.manageProfiles}
			aria-expanded={expanded}
			disabled={locked || busy}
			onclick={() => (expanded = !expanded)}
			title={$t.design.manageProfiles}
		>
			<!-- The knobs are filled with the button's own fill (`.ui-tool`'s --surface-2), so they
			     read as rings sitting on the rails rather than as solid dots. -->
			<svg
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				aria-hidden="true"
				><path d="M4 6h16M4 12h16M4 18h16" /><circle
					cx="9"
					cy="6"
					r="2"
					fill="var(--surface-2)"
				/><circle cx="15" cy="12" r="2" fill="var(--surface-2)" /><circle
					cx="9"
					cy="18"
					r="2"
					fill="var(--surface-2)"
				/></svg
			>
		</ToolButton>
	</div>
	{#if expanded}
		<p>{$t.usability.profileHint}</p>
		{#if !isTauri()}<p>{$t.design.desktopOnly}</p>{/if}
		<ul>
			{#each profiles as p (p.id)}
				<li>
					<strong>{p.name}</strong>
					<p class="summary">
						{p.options.mode === 'translate' ? $t.mode.translate : $t.mode.transcribe} · {$t.engine[
							p.options.provider
						]} · {$t.source[p.options.source]} · {captionLanguageOf(p.options)
							? languageName(p.options.targetLanguage, $locale)
							: $t.language.auto}
					</p>
					<div class="actions">
						<ToolButton
							disabled={locked || busy || !isTauri()}
							onclick={() => {
								selected = p.id;
								void load();
							}}>{$t.usability.loadProfile}</ToolButton
						>
						<ToolButton
							aria-label={`${$t.design.manageProfiles}: ${p.name}`}
							aria-expanded={rowMenu === p.id}
							disabled={locked || busy}
							onclick={() => {
								rowMenu = rowMenu === p.id ? '' : p.id;
								confirming = false;
							}}
							><svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="currentColor"
								aria-hidden="true"
								><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle
									cx="19"
									cy="12"
									r="1.5"
								/></svg
							></ToolButton
						>
						{#if rowMenu === p.id}
							<ToolButton
								disabled={locked || busy}
								onclick={() => {
									selected = p.id;
									name = p.name;
									renameId = p.id;
									editing = 'rename';
									confirming = false;
								}}>{$t.design.rename}</ToolButton
							>
							<ToolButton
								variant="danger"
								disabled={locked || busy}
								onclick={() => {
									if (selected !== p.id) confirming = false;
									selected = p.id;
									void remove();
								}}
								>{confirming && selected === p.id
									? $t.usability.confirmDelete
									: $t.usability.deleteProfile}</ToolButton
							>
							{#if confirming && selected === p.id}<ToolButton
									disabled={busy}
									onclick={() => (confirming = false)}>{$t.history.cancel}</ToolButton
								>{/if}
						{/if}
					</div>
				</li>
			{/each}
		</ul>
		<ToolButton
			disabled={locked || busy}
			onclick={() => {
				name = '';
				editing = 'save';
				confirming = false;
			}}>{$t.design.newProfile}</ToolButton
		>
		{#if editing}
			<form
				onsubmit={(e) => {
					e.preventDefault();
					void (editing === 'rename' ? rename() : save());
				}}
			>
				<Field label={$t.usability.profileName}
					><input maxlength="80" bind:value={name} disabled={locked || busy} /></Field
				>
				<div class="actions">
					<ToolButton type="submit" disabled={locked || busy || !name.trim()}
						>{editing === 'rename' ? $t.design.saveName : $t.usability.saveProfile}</ToolButton
					>
					<ToolButton disabled={busy} onclick={() => (editing = null)}
						>{$t.history.cancel}</ToolButton
					>
				</div>
			</form>
		{/if}
	{/if}
	{#if notice}<p role="status">{notice}</p>{/if}
	{#if error}<p role="alert">{error}</p>{/if}
</section>

<style>
	.profiles {
		min-width: 0;
		font-size: var(--type-small);
		color: var(--text-secondary);
		padding-bottom: var(--space-4);
		border-bottom: 1px solid var(--line);
	}
	.picker {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: stretch;
		gap: var(--space-2) var(--space-2);
	}
	.picker :global(.ui-field) {
		display: contents;
	}
	.picker :global(.ui-field > span:first-child) {
		grid-column: 1 / -1;
	}
	.picker > :global(.ui-tool) {
		display: grid;
		place-items: center;
		/* Square, and the height of the select beside it. */
		width: var(--control-md);
		min-height: var(--control-md);
		padding: 0;
	}
	p {
		color: var(--text-muted);
		line-height: var(--leading-body);
		overflow-wrap: anywhere;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		padding: var(--space-3) 0;
		border-bottom: 1px solid var(--line);
		margin-bottom: var(--space-3);
		overflow-wrap: anywhere;
	}
	.summary {
		margin: var(--space-2) 0 var(--space-3);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	form {
		display: grid;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}
</style>
