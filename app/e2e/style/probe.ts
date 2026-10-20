// What the two specs measure, run inside the page.
//
// `installProbe` is sent to the page as source text, so it is self-contained: no imports, no
// helpers from outside its own body. It leaves `window.__styleProbe` behind, and the Node
// side reads that through `overflow()` and `styles()` below.

import type { Page } from '@playwright/test';

/** An element whose content is wider than its box. */
export interface Offender {
	path: string;
	text: string;
	scrollWidth: number;
	clientWidth: number;
	/** Its computed `overflow-x`: `visible` spills over a neighbour, `hidden` and `clip` cut
	 *  text off, `auto` is a sideways scrollbar on a column that only meant to scroll down. */
	overflowX: string;
}

interface Probe {
	overflow(): Offender[];
	styles(scope?: string): string[];
}

declare global {
	interface Window {
		__styleProbe?: Probe;
	}
}

function installProbe(): void {
	// ---- Naming an element ----------------------------------------------------------------
	// A path a reader can find the element by, and that survives unrelated markup changes:
	// the element's own name when it has one, a chain of tags and class names up to the
	// nearest named ancestor or landmark, and that landmark. Svelte's scoping classes are
	// hashes of the component source, so they are left out.

	const LANDMARK_TAGS = new Set(['HEADER', 'MAIN', 'ASIDE', 'NAV', 'FOOTER', 'DIALOG']);
	const LANDMARK_ROLES = new Set([
		'banner',
		'main',
		'complementary',
		'navigation',
		'contentinfo',
		'dialog',
		'alertdialog',
		'region',
		'tabpanel'
	]);
	// Elements whose text is their name.
	const NAMED_BY_TEXT = new Set(['BUTTON', 'A', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LEGEND']);
	const SCOPING = /^svelte-/;

	const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
	const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

	/** The text a name is read from: what a screen reader would hear, so no `aria-hidden`
	 *  content (a printed shortcut), and for a label, none of its own control's options. */
	function textOf(el: Element, skip?: Element): string {
		let out = '';
		for (const node of el.childNodes) {
			if (node.nodeType === Node.TEXT_NODE) out += node.textContent;
			else if (
				node instanceof Element &&
				node !== skip &&
				node.getAttribute('aria-hidden') !== 'true'
			)
				out += ` ${textOf(node, skip)} `;
		}
		return out;
	}

	function ownName(el: Element): string {
		const label = el.getAttribute('aria-label');
		if (label) return squash(label);
		const by = el.getAttribute('aria-labelledby');
		if (by)
			return squash(
				by
					.split(/\s+/)
					.map((id) => {
						const named = document.getElementById(id);
						return named ? textOf(named) : '';
					})
					.join(' ')
			);
		if (NAMED_BY_TEXT.has(el.tagName) || el.getAttribute('role') === 'tab')
			return squash(textOf(el));
		if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
			const label = el.labels?.[0];
			if (label) return squash(textOf(label, el));
		}
		return '';
	}

	const isLandmark = (el: Element) =>
		LANDMARK_TAGS.has(el.tagName) || LANDMARK_ROLES.has(el.getAttribute('role') ?? '');

	const bare = new Map<Element, string>();
	function segmentOf(el: Element): string {
		let segment = bare.get(el);
		if (segment !== undefined) return segment;
		segment = el.tagName.toLowerCase();
		const classes = [...el.classList].filter((c) => !SCOPING.test(c));
		if (classes.length) segment += `.${classes.join('.')}`;
		const role = el.getAttribute('role');
		if (role) segment += `[role=${role}]`;
		if (el instanceof HTMLInputElement) segment += `[type=${el.type}]`;
		const name = ownName(el);
		if (name) segment += ` "${clip(name, 32)}"`;
		bare.set(el, segment);
		return segment;
	}

	/** The segment, numbered when a sibling would print the same. */
	function segment(el: Element): string {
		const own = segmentOf(el);
		const twins = el.parentElement
			? [...el.parentElement.children].filter((c) => segmentOf(c) === own)
			: [el];
		return twins.length > 1 ? `${own}:nth(${twins.indexOf(el) + 1})` : own;
	}

	function pathOf(el: Element): string {
		const parts: string[] = [];
		let prefix = '';
		for (let cur: Element | null = el; cur; cur = cur.parentElement) {
			if (cur === document.body || cur === document.documentElement) {
				parts.unshift(cur.tagName.toLowerCase());
				break;
			}
			parts.unshift(segment(cur));
			if (isLandmark(cur)) break;
			if (cur !== el && ownName(cur)) {
				// Anchored on a named ancestor: say which landmark it sits in, not how deep.
				for (let up = cur.parentElement; up; up = up.parentElement)
					if (isLandmark(up)) {
						prefix = `${segment(up)} … `;
						break;
					}
				break;
			}
		}
		return prefix + parts.join(' › ');
	}

	// ---- What is on screen --------------------------------------------------------------

	/** Everything with a box, in document order. Inside an icon only the `svg` counts, and an
	 *  `option` is drawn by the select, not as an element of its own. */
	function rendered(): Element[] {
		const out: Element[] = [];
		const walk = (el: Element) => {
			if (['SCRIPT', 'STYLE', 'TEMPLATE', 'OPTION', 'OPTGROUP'].includes(el.tagName)) return;
			if (el.hasAttribute('data-style-probe')) return;
			const contents = getComputedStyle(el).display === 'contents';
			if (contents || el.getClientRects().length > 0) out.push(el);
			if (el.tagName.toLowerCase() === 'svg') return;
			for (const child of el.children) walk(child);
		};
		walk(document.documentElement);
		return out;
	}

	/** Text for assistive technology only: clipped to a pixel, here or on an ancestor. */
	function visuallyHidden(el: Element): boolean {
		for (let cur: Element | null = el; cur; cur = cur.parentElement) {
			const style = getComputedStyle(cur);
			const box = cur.getBoundingClientRect();
			if (style.clipPath !== 'none' && box.width <= 1 && box.height <= 1) return true;
			if (style.overflow !== 'visible' && box.width <= 1 && box.height <= 1) return true;
		}
		return false;
	}

	const SCROLLS = new Set(['auto', 'scroll']);

	function overflow(): Offender[] {
		const offenders: Element[] = [];
		for (const el of rendered()) {
			if (el.closest('svg')) continue;
			if (el.scrollWidth <= el.clientWidth + 1) continue;
			const style = getComputedStyle(el);
			if (style.textOverflow === 'ellipsis') continue;
			// A sideways scroller is deliberate. A column that scrolls down computes
			// `overflow-x: auto` as a side effect of its `overflow-y`, and a horizontal
			// scrollbar on it is not deliberate at all, so only a horizontal-only scroller is
			// let off. Every scroller in this window is a vertical one.
			if (SCROLLS.has(style.overflowX) && !SCROLLS.has(style.overflowY)) continue;
			if (visuallyHidden(el)) continue;
			offenders.push(el);
		}
		// One overflowing word makes every ancestor without a scrollbar overflow too. The
		// innermost element is the one to fix, so an ancestor is reported only when no
		// reported element sits inside it.
		const innermost = offenders.filter(
			(el) => !offenders.some((other) => other !== el && el.contains(other))
		);
		return innermost.map((el) => ({
			path: pathOf(el),
			text: clip(squash((el as HTMLElement).innerText ?? el.textContent ?? ''), 80),
			scrollWidth: el.scrollWidth,
			clientWidth: el.clientWidth,
			overflowX: getComputedStyle(el).overflowX
		}));
	}

	// ---- Computed styles ----------------------------------------------------------------
	// CSS values only, never geometry. For a width, a margin or a track list
	// `getComputedStyle` gives the used value in pixels, which depends on the window and the
	// font rasteriser; Typed OM's `computedStyleMap()` gives the computed one — `auto`, `50%`,
	// `minmax(0px, 1fr)`. Font sizes and `em` lengths still resolve to px, but from the tokens
	// and the text scale alone.

	/** Inherited properties: printed where they change, so a token change shows on the
	 *  element that sets it rather than on every descendant. */
	const INHERITED = [
		'font-family',
		'font-size',
		'font-weight',
		'font-style',
		'line-height',
		'letter-spacing',
		'text-transform',
		'text-align',
		'white-space',
		'text-wrap-style',
		'overflow-wrap',
		'font-variant-numeric',
		'color',
		'visibility'
	];
	/** Everything else, against what the browser gives the same tag unstyled. Grouped four
	 *  sides at a time where CSS has a shorthand, so a diff reads as a padding change. */
	const OWN = [
		'display',
		'position',
		'flex-direction',
		'flex-wrap',
		'align-items',
		'justify-content',
		'flex',
		'grid-template-columns',
		'gap',
		'width',
		'min-width',
		'max-width',
		'height',
		'overflow',
		'padding',
		'margin',
		'border-top',
		'border-right',
		'border-bottom',
		'border-left',
		'border-radius',
		'background-color',
		'background-image',
		'box-shadow',
		'opacity',
		'text-decoration-line',
		'text-overflow'
	];
	const PSEUDO = [
		'content',
		'display',
		'position',
		'border',
		'border-radius',
		'background-color',
		'background-image',
		'box-shadow',
		'opacity'
	];
	const SIDES = ['top', 'right', 'bottom', 'left'];
	const CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];

	/** `rgb()` as the hex the tokens are written in; numbers to three decimals, so a float
	 *  that went through `calc()` prints the same on every machine. */
	function normalise(value: string): string {
		return value
			.replace(/rgb\((\d+), (\d+), (\d+)\)/g, (_, r: string, g: string, b: string) =>
				[r, g, b].reduce((hex, c) => hex + Number(c).toString(16).padStart(2, '0'), '#')
			)
			.replace(/-?\d*\.\d+/g, (n) => String(Number(Number(n).toFixed(3))));
	}

	/** Four sides in shorthand order, collapsed the way CSS collapses them. */
	function sides(values: string[]): string {
		const [t, r, b, l] = values;
		if (r === l && t === b && t === r) return t;
		if (r === l && t === b) return `${t} ${r}`;
		if (r === l) return `${t} ${r} ${b}`;
		return values.join(' ');
	}

	type Read = (property: string) => string;

	// Typed OM only for the properties `getComputedStyle` would resolve to geometry: lengths
	// that can be `auto` or a percentage, the track list, a unitless line height. The rest go
	// through `getComputedStyle`, which already gives their computed values.
	const TYPED =
		/^(width|height|min-width|max-width|margin-.*|padding-.*|grid-template-columns|flex-basis|line-height|row-gap|column-gap)$/;

	function reader(el: Element, pseudo?: string): Read {
		const style = getComputedStyle(el, pseudo);
		if (pseudo) return (p) => style.getPropertyValue(p);
		const map = el.computedStyleMap();
		return (p) => {
			if (TYPED.test(p)) {
				const value = map.get(p);
				if (value !== undefined && value !== null) return String(value);
			}
			return style.getPropertyValue(p);
		};
	}

	function value(read: Read, property: string): string {
		switch (property) {
			case 'padding':
			case 'margin':
				return sides(SIDES.map((s) => read(`${property}-${s}`)));
			case 'border':
				return sides(SIDES.map((side) => value(read, `border-${side}`)));
			case 'border-top':
			case 'border-right':
			case 'border-bottom':
			case 'border-left': {
				const style = read(`${property}-style`);
				const width = read(`${property}-width`);
				return style === 'none' || style === 'hidden' || width === '0px'
					? 'none'
					: `${width} ${style} ${read(`${property}-color`)}`;
			}
			case 'border-radius':
				return sides(CORNERS.map((c) => read(`border-${c}-radius`)));
			case 'gap': {
				const row = read('row-gap');
				const column = read('column-gap');
				return row === column ? row : `${row} ${column}`;
			}
			case 'overflow': {
				const x = read('overflow-x');
				const y = read('overflow-y');
				return x === y ? x : `${x} ${y}`;
			}
			case 'flex':
				return `${read('flex-grow')} ${read('flex-shrink')} ${read('flex-basis')}`;
			case 'white-space':
				return `${read('white-space-collapse')} ${read('text-wrap-mode')}`;
			default:
				return read(property);
		}
	}

	// What an unstyled element of the same kind computes to, from a blank document in a
	// throwaway frame. Comparing against it leaves out everything the app did not change.
	let sandbox: HTMLIFrameElement | null = null;
	const defaults = new Map<string, Record<string, string>>();
	function defaultsFor(el: Element): Record<string, string> {
		const key = el instanceof HTMLInputElement ? `input:${el.type}` : el.tagName;
		let found = defaults.get(key);
		if (found) return found;
		if (!sandbox) {
			sandbox = document.createElement('iframe');
			sandbox.setAttribute('data-style-probe', '');
			sandbox.setAttribute('aria-hidden', 'true');
			sandbox.style.cssText =
				'position:fixed;left:-10000px;top:0;width:400px;height:400px;border:0;visibility:hidden';
			// Beside the body rather than in it, so no `:last-child` in the app's styles moves.
			document.documentElement.append(sandbox);
			const blank = sandbox.contentDocument!;
			blank.open();
			blank.write('<!doctype html><html><head></head><body></body></html>');
			blank.close();
		}
		const blank = sandbox.contentDocument!;
		const twin = blank.createElementNS(el.namespaceURI, el.tagName.toLowerCase());
		if (el instanceof HTMLInputElement) twin.setAttribute('type', el.type);
		blank.body.append(twin);
		const read = reader(twin);
		found = Object.fromEntries([...INHERITED, ...OWN].map((p) => [p, normalise(value(read, p))]));
		twin.remove();
		defaults.set(key, found);
		return found;
	}

	/** The declarations to print for `el`: inherited values where they differ from the
	 *  parent's, the rest where they differ from an unstyled element's. Four borders that
	 *  match print as one. */
	function declarations(
		own: Record<string, string>,
		parent: Record<string, string> | undefined,
		blank: Record<string, string>
	): string[] {
		const changed = [
			...INHERITED.filter((p) => own[p] !== (parent ?? blank)[p]),
			...OWN.filter((p) => own[p] !== blank[p])
		];
		const borders = changed.filter((p) => p.startsWith('border-') && p !== 'border-radius');
		const collapse = borders.length === 4 && new Set(borders.map((p) => own[p])).size === 1;
		return changed.flatMap((p) => {
			if (!collapse || !borders.includes(p)) return [`${p}: ${own[p]}`];
			return p === 'border-top' ? [`border: ${own[p]}`] : [];
		});
	}

	/** One line per element inside `scope` (a selector; the whole document by default). */
	function styles(scope?: string): string[] {
		const root = scope ? document.querySelector(scope) : document.documentElement;
		if (!root) throw new Error(`Nothing matches ${scope}`);
		// One style and layout pass for the whole document before anything is read.
		void document.body.offsetWidth;
		const lines: string[] = [];
		const seen = new Map<string, number>();
		const computed = new Map<Element, Record<string, string>>();
		const unique = (path: string) => {
			const n = (seen.get(path) ?? 0) + 1;
			seen.set(path, n);
			return n === 1 ? path : `${path} #${n}`;
		};
		// Every element is read, so an element in scope is compared with its real parent.
		for (const el of rendered()) {
			const read = reader(el);
			const own: Record<string, string> = {};
			for (const p of [...INHERITED, ...OWN]) own[p] = normalise(value(read, p));
			computed.set(el, own);
			if (!root.contains(el)) continue;
			const parent = el.parentElement ? computed.get(el.parentElement) : undefined;
			const decls = declarations(own, parent, defaultsFor(el));
			const path = unique(pathOf(el));
			if (decls.length) lines.push(`${path} { ${decls.join('; ')} }`);
			for (const pseudo of ['::before', '::after']) {
				const content = getComputedStyle(el, pseudo).content;
				if (content === 'none' || content === 'normal') continue;
				const readPseudo = reader(el, pseudo);
				const pseudoDecls = PSEUDO.map((p) => `${p}: ${normalise(value(readPseudo, p))}`);
				lines.push(`${path}${pseudo} { ${pseudoDecls.join('; ')} }`);
			}
		}
		sandbox?.remove();
		sandbox = null;
		return lines;
	}

	window.__styleProbe = { overflow, styles };
}

async function probe(page: Page): Promise<void> {
	await page.evaluate(installProbe);
}

/** Every element whose content is wider than its box, innermost first. */
export async function overflow(page: Page): Promise<Offender[]> {
	await probe(page);
	return page.evaluate(() => window.__styleProbe!.overflow());
}

/**
 * One line per element: its path and the computed values it does not share with its parent
 * (inherited properties) or with an unstyled element of its kind (the rest).
 *
 * Read until two reads a frame apart agree. The window has settled by the time this runs, so
 * the second read normally just confirms the first. It is there because, on a heavily loaded
 * machine, a read once described the window as it was before the last click, and a capture
 * that does not repeat is not a snapshot.
 */
export async function computedStyles(page: Page, scope?: string): Promise<string[]> {
	await probe(page);
	const read = async () => {
		await page.evaluate(
			() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
		);
		return page.evaluate((selector) => window.__styleProbe!.styles(selector), scope);
	};
	let last = await read();
	for (let attempt = 0; attempt < 5; attempt++) {
		const next = await read();
		if (next.join('\n') === last.join('\n')) return next;
		last = next;
	}
	throw new Error('The computed styles kept changing between reads');
}
