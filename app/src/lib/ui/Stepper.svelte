<script lang="ts">
	import ToolButton from './ToolButton.svelte';

	/** The one number stepper: a label, − and + as square ToolButtons, and the value between
	 *  them. Used on the rail, in Settings and on the move-mode toolbar, so a caption size reads
	 *  and behaves the same wherever it is changed. */
	let {
		label,
		value,
		min,
		max,
		step = 1,
		unit = '',
		format,
		decreaseLabel,
		increaseLabel,
		disabled = false,
		onchange
	}: {
		label: string;
		value: number;
		min: number;
		max: number;
		step?: number;
		unit?: string;
		/** The printed value, where `value unit` is not how it is written (`72%`). */
		format?: (value: number) => string;
		/** The buttons' accessible names, where the catalog has its own words for them. */
		decreaseLabel?: string;
		increaseLabel?: string;
		disabled?: boolean;
		onchange: (value: number) => void;
	} = $props();
</script>

<div class="ui-stepper" role="group" aria-label={label}>
	<span>{label}</span>
	<ToolButton
		size="sm"
		disabled={disabled || value <= min}
		aria-label={decreaseLabel ?? `${label} −`}
		onclick={() => onchange(Math.max(min, value - step))}>−</ToolButton
	>
	<output>{format ? format(value) : `${value} ${unit}`.trim()}</output>
	<ToolButton
		size="sm"
		disabled={disabled || value >= max}
		aria-label={increaseLabel ?? `${label} +`}
		onclick={() => onchange(Math.min(max, value + step))}>+</ToolButton
	>
</div>
