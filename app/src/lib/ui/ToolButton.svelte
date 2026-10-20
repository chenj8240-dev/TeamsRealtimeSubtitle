<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';

	/** The one button. Its look lives in `app.css` under `.ui-tool`, so a primary, a ghost or a
	 *  danger action is the same wherever it appears. */
	let {
		children,
		variant = 'default',
		size = 'md',
		wide = false,
		element = $bindable(),
		class: className = '',
		...props
	}: HTMLButtonAttributes & {
		/** What the action is: see the list above `.ui-tool` in `app.css`. */
		variant?: 'default' | 'primary' | 'ghost' | 'danger' | 'warn';
		/** Where it sits: inside a row of content, on its own, or as a session action or a
		 *  dialog's answer. */
		size?: 'sm' | 'md' | 'lg';
		/** Fill the column rather than size to the label. */
		wide?: boolean;
		/** The rendered button, for a caller that has to focus it. */
		element?: HTMLButtonElement | null;
	} = $props();
</script>

<button
	type="button"
	bind:this={element}
	class={[
		'ui-tool',
		variant !== 'default' && variant,
		size !== 'md' && size,
		wide && 'wide',
		className
	]}
	{...props}>{@render children?.()}</button
>
