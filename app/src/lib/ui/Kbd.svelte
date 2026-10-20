<script lang="ts">
	import { t } from '../i18n';
	import { keyLabel, type Shortcut } from '../shortcuts';

	/** A shortcut as a key cap, in the interface language's key names. */
	let { command }: { command: Shortcut } = $props();
	// The label's keys, so a `<wbr>` can follow each `+`. A cap never wraps (`.ui-kbd`) unless
	// its container allows it, and then only between keys. No key name contains a `+`.
	const keys = $derived(keyLabel(command, $t.keys).split('+'));
</script>

<kbd class="ui-kbd"
	>{#each keys as key, i (i)}{#if i}+<wbr />{/if}{key}{/each}</kbd
>
