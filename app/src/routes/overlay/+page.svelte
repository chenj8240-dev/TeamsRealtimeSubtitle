<script lang="ts">
	import { onMount } from 'svelte';
	import OverlayCaptionLine from './OverlayCaptionLine.svelte';
	import OverlayMoveChrome from './OverlayMoveChrome.svelte';
	import { createOverlayCaptions } from './overlayCaptions.svelte';
	import { createOverlayPlacement, overlayKeyCommand } from './overlayPlacement.svelte';
	import { previewContent } from './overlayFixtures';
	import {
		clampOverlayFont,
		fromOverlayConfig,
		loadAppearance,
		SHOW_ORIGINAL_KEY,
		type Appearance
	} from '#lib/appearance.js';
	import { loadFillerWords, normalizeFillerWords } from '#lib/cleanSpeech.js';
	import {
		bottomCaptionHeight,
		ORIGINAL_GAP,
		ORIGINAL_SCALE,
		originalHeight
	} from '#lib/captionLayout.js';
	import { readFlag } from '#lib/persisted.js';
	import { captionCssVars } from '#lib/captionColour.js';
	import { captionFaceStack } from '#lib/captionFont.js';
	import { isLocale, locale, t } from '#lib/i18n/index.js';
	import { isTargetLanguage } from '#lib/languages.js';
	import { api, on, isTauri } from '#lib/tauri.js';
	import type { Lane, Origin, TargetLanguage } from '#lib/types.js';

	// The initial appearance comes from the shared localStorage keys (same origin as the
	// operator), then the operator pushes live updates via the overlay-config event.
	const initial = loadAppearance();
	const captions = createOverlayCaptions({
		layout: initial.layout,
		hideFillers: initial.cleanSpeech,
		fillerWords: loadFillerWords(),
		hold: initial.hold,
		pace: initial.pace,
		width: initial.width,
		showOriginal: readFlag(SHOW_ORIGINAL_KEY)
	});
	const placement = createOverlayPlacement();

	// The whole appearance as one value, replaced by each push. The reading settings in it are
	// handed on to `captions`, which needs them to lay its lines out.
	let appearance = $state.raw<Appearance>(initial);
	const fontSize = $derived(appearance.fontSize);
	const captionFace = $derived(appearance.face);
	let fontsLoaded = $state(0);

	// The ink and the scrim behind it. The overlay keeps the operator's three plain values and
	// derives its own steps from them, rather than being handed a finished stylesheet — so the
	// contrast readout on the control panel and the pixels here come out of one function.
	const paletteVars = $derived(
		Object.entries(captionCssVars(appearance.palette))
			.map(([name, value]) => `${name}: ${value}`)
			.join('; ')
	);

	// The language of the caption text, which is not this window's interface language: the
	// move-mode chrome and the origin labels follow the operator's locale, the captions do
	// not. Only the operator window can work it out, so it is pushed. Undefined means unknown
	// — before the first push, and while a subtitle engine is detecting the spoken language.
	let captionLanguage = $state<TargetLanguage | undefined>(undefined);
	/** Lane 1's language, when the session captions in a second one. */
	let secondCaptionLanguage = $state<TargetLanguage | undefined>(undefined);

	// Words, not emoji or colour: at projector distance a two-letter cue is unreadable.
	const originLabel = $derived<Record<Origin, string>>($t.overlay.origin);

	// Live window size, for the move-mode readout and the row heights. The overlay window *is*
	// the caption region, so its own viewport is the number that matters.
	let winW = $state(0);
	let winH = $state(0);

	const lines = $derived(captions.lines);
	const layout = $derived(captions.layout);
	// A single speaker needs no label — the row is unambiguous, and the label would only steal
	// width from the caption. Labels appear exactly when more than one row is on screen.
	const showLabels = $derived(lines.length > 1);
	// With two caption languages the rows say which language they are, as a code — at
	// projector distance a name would crowd the caption — and the source too only when both
	// sources are on screen.
	const bilingualRows = $derived(lines.some((line) => line.lane === 1));
	const bothSources = $derived(new Set(lines.map((line) => line.origin)).size > 1);
	const rowLanguage = (lane: Lane) => (lane === 1 ? secondCaptionLanguage : captionLanguage);
	function rowLabel(line: { origin: Origin; lane: Lane }): string {
		if (!bilingualRows) return originLabel[line.origin];
		const code = (rowLanguage(line.lane) ?? '').toUpperCase();
		return bothSources ? `${originLabel[line.origin]} · ${code}` : code;
	}
	const sidePadding = $derived(
		layout !== 'compact' ? Math.min(32, Math.max(12, winW * 0.025)) : winW * 0.065
	);
	const topPadding = $derived(layout !== 'compact' ? 16 : winH * 0.09);
	const bottomPadding = $derived(layout !== 'compact' ? 16 : winH * 0.06);
	const rowHeight = $derived(
		Math.max(
			0,
			(winH - topPadding - bottomPadding - Math.max(0, lines.length - 1) * 18) /
				Math.max(1, lines.length)
		)
	);
	// The original takes two of its smaller lines when the row has room for them beside two
	// caption lines, and one otherwise: it is there to follow along, not to be read in full.
	const originalRows = $derived(rowHeight >= 4.5 * fontSize ? 2 : 1);
	const originalRegion = $derived(originalHeight(fontSize, originalRows));
	const showsOriginal = $derived(lines.some((line) => line.original));

	onMount(() => {
		const measure = () => {
			winW = Math.round(window.innerWidth);
			winH = Math.round(window.innerHeight);
		};
		measure();
		let mounted = true;
		void document.fonts.ready.then(() => {
			if (mounted) fontsLoaded += 1;
		});
		const fontsChanged = () => {
			fontsLoaded += 1;
		};
		document.fonts.addEventListener('loadingdone', fontsChanged);
		window.addEventListener('resize', measure);
		const cleanup = () => {
			mounted = false;
			window.removeEventListener('resize', measure);
			document.fonts.removeEventListener('loadingdone', fontsChanged);
			captions.dispose();
		};

		if (!isTauri()) {
			// A browser preview has no core: show labelled demo content instead.
			const preview = previewContent(new URLSearchParams(window.location.search).get('language'));
			captions.show(preview);
			if (preview.language) captionLanguage = preview.language;
			if (preview.secondLanguage) secondCaptionLanguage = preview.secondLanguage;
			return cleanup;
		}

		const unlistenCaption = on.caption((c) => captions.push(c));
		const unlistenStatus = on.status((status) => captions.status(status));
		const unlistenConfig = on.overlayConfig((cfg) => {
			appearance = fromOverlayConfig(cfg, appearance);
			// Handed on at every push, changed or not, as every push carries the whole appearance:
			// setting the hold restarts the expiry timers and setting the pace releases paced
			// text, and skipping unchanged values would quietly stop both.
			captions.setHold(appearance.hold);
			captions.setPace(appearance.pace);
			captions.setHideFillers(appearance.cleanSpeech);
			if (Array.isArray(cfg.fillerWords))
				captions.setFillerWords(normalizeFillerWords(cfg.fillerWords));
			if (typeof cfg.showOriginal === 'boolean') captions.setShowOriginal(cfg.showOriginal);
			captions.setLayout(appearance.layout);
			captions.setWidth(appearance.width);
			// The operator owns the interface language; this window follows it.
			if (isLocale(cfg.locale)) locale.set(cfg.locale);
			// Unconditional, unlike the rest: an absent caption language is a real answer
			// ("nobody knows"), so it has to be able to clear one that was set before.
			captionLanguage = isTargetLanguage(cfg.captionLanguage) ? cfg.captionLanguage : undefined;
			secondCaptionLanguage = isTargetLanguage(cfg.secondCaptionLanguage)
				? cfg.secondCaptionLanguage
				: undefined;
			if (typeof cfg.interactive === 'boolean') placement.setInteractive(cfg.interactive);
		});

		return () => {
			cleanup();
			void unlistenCaption.then((f) => f());
			void unlistenStatus.then((f) => f());
			void unlistenConfig.then((f) => f());
		};
	});

	// Reachable while move mode has the window focused (it's click-through otherwise).
	function bump(delta: number) {
		appearance = { ...appearance, fontSize: clampOverlayFont(appearance.fontSize + delta) };
		// The operator window owns the size control too; tell it what happened here so the
		// two readouts never disagree. Fire-and-forget — a dropped event costs nothing.
		void api.emitOverlayState({ fontSize });
	}

	/** Reset an enlarged reading region to a shallow subtitle strip along the bottom. */
	function snapToBottom() {
		void placement.snapToBottom(bottomCaptionHeight(fontSize, lines.length, layout, showsOriginal));
	}

	function onKeyDown(e: KeyboardEvent) {
		const command = overlayKeyCommand(
			{
				key: e.key,
				shiftKey: e.shiftKey,
				onButton: e.target instanceof HTMLElement && e.target.tagName === 'BUTTON'
			},
			placement.interactive
		);
		if (!command) return;
		if (command.kind === 'bump') {
			bump(command.delta);
			return;
		}
		e.preventDefault();
		if (command.kind === 'lock') void placement.lock();
		else if (command.kind === 'cancel') void placement.cancel();
		else void placement.nudge(command.dx, command.dy);
	}
</script>

<svelte:window onkeydown={onKeyDown} />

<div
	class="stage"
	class:interactive={placement.interactive}
	class:stable={layout === 'stable'}
	class:fit={layout !== 'compact'}
	data-tauri-drag-region={placement.interactive || undefined}
	style="--side-pad: {sidePadding}px; --top-pad: {topPadding}px; --bottom-pad: {bottomPadding}px; --fs: {fontSize}px; --original-scale: {ORIGINAL_SCALE}; --measure: {captions.width}ch; --caption-face: {captionFaceStack(
		captionFace
	)}; {paletteVars}"
>
	{#if placement.interactive}
		<OverlayMoveChrome
			{fontSize}
			width={winW}
			height={winH}
			onBump={bump}
			onSnap={snapToBottom}
			onLock={() => void placement.lock()}
		/>
	{:else if lines.length > 0}
		<!-- Painted only while there is something to read: with no captions the window must
		     paint nothing at all, or it would veil the presenter's slides. -->
		<div class="captions">
			{#each lines as line (line.track)}
				<div class="row">
					<!-- The label is interface-language text sitting beside caption-language text, and
					     it inherits `<html lang>`, which is the interface language. Correct as it is. -->
					{#if showLabels}<span class="origin">{rowLabel(line)}</span>{/if}
					<div class="texts">
						<OverlayCaptionLine
							stable={layout === 'stable'}
							onTrim={(chars) => captions.trimStable(line.track, chars)}
							lead={line.lead}
							text={line.text}
							interim={line.interim}
							height={line.original ? rowHeight - originalRegion - ORIGINAL_GAP : rowHeight}
							fontKey={fontSize + ':' + captionFace + ':' + fontsLoaded}
							language={rowLanguage(line.lane) ?? ''}
						/>
						{#if line.original}
							<!-- The speaker's language is whatever they spoke, which nobody has
							     named: no `lang`, and the direction is left to the text. -->
							<div class="original" style:margin-top="{ORIGINAL_GAP}px">
								<OverlayCaptionLine
									muted
									lead=""
									text={line.original}
									interim={false}
									height={originalRegion}
									fontKey={fontSize + ':' + captionFace + ':' + fontsLoaded + ':original'}
									language=""
								/>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.stable .captions {
		top: 0;
		bottom: auto;
		background: var(--caption-scrim-strong);
	}
	/* The window itself is transparent (Tauri transparent:true). Nothing here may paint a
	   full-window background in audience view — the scrim is the only ink, and only while
	   captions are on screen. */
	:global(html),
	:global(body) {
		background: transparent !important;
	}
	.stage {
		position: fixed;
		inset: 0;
		pointer-events: none;
		user-select: none;
	}
	.stage.interactive {
		pointer-events: auto;
		cursor: move;
	}

	/* The backing fade is the container's own background, so it is exactly as tall as the
	   captions plus the padded fade-out above them — a light veil the slide shows through,
	   not a band that blanks its lower half. The text shadow carries the legibility. */
	.captions {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 18px;
		padding: var(--top-pad) var(--side-pad) var(--bottom-pad);
		max-height: 100%;
		overflow: hidden;
		pointer-events: none;
		/* The audience view only. Move-mode chrome stays on the app's own face: it is this
		   operator's interface, not the thing being projected. */
		font-family: var(--caption-face);
		/* Operator-chosen, and the shape is the point: strongest at the bottom edge, thinner
		   where the text sits, gone at the top. Moving the opacity scales all three stops
		   together, so the veil never becomes a band with an edge. */
		background: linear-gradient(
			to top,
			var(--caption-scrim-strong) 0%,
			var(--caption-scrim-mid) 55%,
			var(--caption-scrim-none) 100%
		);
	}
	/* Centred like cinema subtitles; with labels on, the label+text pair centres as a unit. */
	.row {
		width: 100%;
		min-height: 0;
		max-width: var(--measure);
		font-size: var(--fs);
		display: flex;
		justify-content: center;
		align-items: baseline;
		gap: 20px;
	}
	.fit .row {
		max-width: none;
	}
	.texts {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.original {
		font-size: calc(var(--fs) * var(--original-scale));
	}
	.origin {
		flex: 0 0 auto;
		font-weight: 600;
		/* Scales with the caption so the label stays legible at projector distance. */
		font-size: max(11px, calc(var(--fs) * 0.37));
		line-height: 1;
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
		color: var(--caption-ink-label);
	}

	/* Windows contrast themes. The audience view opts out entirely: these captions are the
	   content being projected into a room, not application chrome, and repainting them in the
	   operator's system palette would put system-coloured text over a scrim built for white.
	   The move-mode chrome keeps its own rules; see OverlayMoveChrome. */
	@media (forced-colors: active) {
		.captions {
			forced-color-adjust: none;
		}
	}
</style>
