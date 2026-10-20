<script lang="ts">
	let {
		label,
		note = '',
		checked = $bindable(false),
		disabled = false,
		onchange
	}: {
		label: string;
		note?: string;
		checked?: boolean;
		disabled?: boolean;
		onchange?: (value: boolean) => void;
	} = $props();
	const id = $props.id();
</script>

<label class="ui-pref"
	><input
		aria-label={label}
		aria-describedby={note ? id : undefined}
		type="checkbox"
		bind:checked
		{disabled}
		onchange={() => onchange?.(checked)}
	/><span
		>{label}{#if note}<small {id}>{note}</small>{/if}</span
	></label
>
