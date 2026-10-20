<script lang="ts">
	import { t, localeTag } from '../i18n';
	let { label, value = $bindable('') }: { label: string; value?: string } = $props();
	const id = $props.id();
	let picker: HTMLInputElement;
	// What the field shows: the bound value, or what the operator is typing until it is a date.
	// `$derived` is writable, so a value from outside — a calendar pick, a filter reset —
	// replaces the draft without an effect copying it across.
	let draft = $derived(value);
	// An empty field is no filter, not an error.
	const invalid = $derived(!!draft && !isCalendarDate(draft));
	function isCalendarDate(raw: string): boolean {
		const date = new Date(`${raw}T00:00:00Z`);
		return (
			/^\d{4}-\d{2}-\d{2}$/.test(raw) &&
			!Number.isNaN(date.getTime()) &&
			date.toISOString().slice(0, 10) === raw
		);
	}
	function edit(raw: string) {
		draft = raw;
		if (!raw || isCalendarDate(raw)) value = raw;
	}
</script>

<div class="ui-field">
	<label for={id}>{label}</label>
	<div class="date-control">
		<input
			{id}
			type="text"
			value={draft}
			placeholder={$t.usability.dateFormat}
			maxlength="10"
			aria-invalid={invalid}
			aria-describedby={invalid ? `${id}-error` : undefined}
			oninput={(event) => edit(event.currentTarget.value)}
		/>
		<button
			type="button"
			aria-label={`${label} — ${$t.usability.chooseDate}`}
			onclick={() => picker.showPicker()}
		>
			<svg
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				aria-hidden="true"
				><rect x="3" y="5" width="18" height="16" rx="2" /><path
					d="M16 3v4M8 3v4M3 11h18M7 15h2M11 15h2M15 15h2M7 18h2M11 18h2"
				/></svg
			>
		</button>
		<input
			class="native-picker"
			type="date"
			lang={$localeTag}
			bind:this={picker}
			{value}
			tabindex="-1"
			aria-hidden="true"
			onchange={(event) => {
				value = event.currentTarget.value;
			}}
		/>
	</div>
	{#if invalid}<span id={`${id}-error`} class="date-error">{$t.usability.invalidDate}</span>{/if}
</div>

<style>
	.date-control {
		position: relative;
	}
	/* The calendar button spans the field's height, so it is as wide as the field is tall
	   (--control-md, the 2.25rem below), and the text stops a step short of it. */
	.date-control > input[type='text'] {
		width: 100%;
		padding-right: calc(2.25rem + var(--space-1));
	}
	button {
		position: absolute;
		right: 1px;
		top: 1px;
		bottom: 1px;
		width: var(--control-md);
		display: grid;
		place-items: center;
		padding: 0;
		border: 0;
		border-radius: var(--radius-control);
		background: transparent;
		color: var(--text-secondary);
	}
	button:hover {
		background: var(--surface-2);
	}
	.native-picker {
		position: absolute;
		bottom: 0;
		right: 0;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
	.date-error {
		color: var(--danger-soft);
		font-size: var(--type-caption);
	}
</style>
