<script lang="ts">
	import { t } from './i18n';
	import ToolButton from './ui/ToolButton.svelte';
	import {
		appearance,
		overlayCaptionLayout,
		overlayFontSize,
		overlayPalette,
		overlayCaptionFace
	} from './stores';
	import { captionCssVars } from './captionColour';
	import { matchesPreset, PRESET_IDS, PRESETS } from './appearance';
	import { captionFaceStack } from './captionFont';
	import type { OverlayController } from './overlayController.svelte';
	let { overlay, part = 'preview' }: { overlay: OverlayController; part?: 'presets' | 'preview' } =
		$props();
	const vars = $derived(
		Object.entries(captionCssVars($overlayPalette))
			.map(([k, v]) => `${k}:${v}`)
			.join(';')
	);
</script>

{#if part === 'presets'}
	<div class="presets" role="group" aria-label={$t.usability.preset}>
		{#each PRESET_IDS as id (id)}
			<ToolButton
				aria-pressed={matchesPreset($appearance, id)}
				onclick={() => overlay.setAppearance(PRESETS[id])}>{$t.usability[id]}</ToolButton
			>
		{/each}
	</div>
{:else}
	<div class="preview-section">
		<p>{$t.usability.previewHint}</p>
		{#each ['bright', 'dark'] as background (background)}
			<p>{background === 'bright' ? $t.usability.bright : $t.usability.dark}</p>
			<div class="preview" class:bright={background === 'bright'} style={vars}>
				<div
					class="sample"
					style:font-family={captionFaceStack($overlayCaptionFace)}
					style:font-size="{$overlayFontSize}px"
					style:text-align={$overlayCaptionLayout === 'stable' ? 'left' : 'center'}
				>
					{$t.usability.sample}
				</div>
			</div>
		{/each}
	</div>
{/if}

<style>
	.presets {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.presets > :global(.ui-tool) {
		flex: 1;
	}
	p {
		font-size: var(--type-small);
		line-height: var(--leading-body);
		color: var(--text-muted);
	}
	.preview {
		padding: var(--space-4);
	}
	.preview {
		background: #111;
		overflow: hidden;
		border-radius: var(--radius-control);
	}
	.preview.bright {
		background: #fff;
	}
	.sample {
		color: var(--caption-ink);
		background: var(--caption-scrim-strong);
		padding: var(--space-3);
		line-height: 1.34;
		font-weight: 600;
		overflow-wrap: anywhere;
		text-shadow: 0 1px 3px var(--caption-halo-tight);
	}
</style>
