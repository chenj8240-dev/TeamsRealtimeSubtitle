// The type scale is only as good as its coverage.
//
// A font size written straight into a component as pixels is a size Windows' accessibility
// text setting cannot reach — and it fails silently, because the window still looks right on
// the developer's machine at 100%. That is exactly how the contrast failures behind issue #24
// arrived, one shade at a time, so the size ramp gets the same kind of guard the colour ramp
// has in `palette.test.ts`: read the stylesheets, and fail on anything that opted out.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { applyTextScale, clampTextScale, TEXT_SCALE_DEFAULT, TEXT_SCALE_MAX } from './textScale';

const SRC = join(process.cwd(), 'src');
const APP_CSS = readFileSync(join(SRC, 'app.css'), 'utf8');

function sourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return sourceFiles(path);
		return entry.name.endsWith('.svelte') ? [path] : [];
	});
}

/** Every `font-size:` declaration in the app's components, with the file it came from. */
function declarations(): Array<{ file: string; value: string }> {
	return sourceFiles(SRC).flatMap((file) =>
		[...readFileSync(file, 'utf8').matchAll(/font-size:\s*([^;]+);/g)].map((m) => ({
			file: file.slice(SRC.length + 1).replace(/\\/g, '/'),
			value: m[1].trim()
		}))
	);
}

/** The whole ramp: a role for each kind of text, and the size it renders at at 100%. */
const RAMP = {
	caption: 11,
	small: 12,
	body: 13,
	label: 14,
	title: 17,
	heading: 21,
	display: 27
};

/** A declaration that takes its size from the ramp. */
const ROLE = new RegExp(`^(var\\(--type-(${Object.keys(RAMP).join('|')})\\)|inherit)$`);

describe('the type scale', () => {
	it('is declared once, in app.css, and every step is a multiple of the factor', () => {
		const steps = [
			...APP_CSS.matchAll(/--type-([\w-]+):\s*calc\(([\d.]+)px \* var\(--text-scale\)\);/g)
		];
		expect(Object.fromEntries(steps.map(([, role, px]) => [role, Number(px)]))).toEqual(RAMP);
	});

	// The old ramp had sixteen steps, four of which rendered the same 11px and three pairs of
	// which were half a pixel apart. A step nobody can tell from its neighbour is not
	// hierarchy, so the ramp keeps at least a pixel between any two.
	it('keeps every step visibly apart from the next', () => {
		const sizes = Object.values(RAMP).sort((a, b) => a - b);
		for (let i = 1; i < sizes.length; i++) {
			expect(sizes[i] - sizes[i - 1]).toBeGreaterThanOrEqual(1);
			expect(Number.isInteger(sizes[i])).toBe(true);
		}
	});

	it('carries the factor into the root font size, so em-based layout follows the text', () => {
		expect(APP_CSS).toContain('font-size: calc(16px * var(--text-scale));');
	});

	// The overlay is the one exception, and a narrow one: its caption size is a number the
	// operator sets for the room, so those two declarations are expressions over `--fs`, not
	// literals. Anything else with a raw px size is a component that will not grow.
	it('leaves no component declaring its own pixel size', () => {
		const literal = declarations().filter(({ value }) => /^[\d.]+px$/.test(value));
		expect(literal).toEqual([]);
	});

	it('is what every component actually uses', () => {
		const used = declarations().filter(({ file }) => !file.startsWith('routes/overlay/'));
		expect(used.length).toBeGreaterThan(0);
		for (const { file, value } of used) {
			expect(value, `${file} declares ${value}`).toMatch(ROLE);
		}
	});

	// The overlay's move-mode chrome is operator interface, not caption, so it takes its
	// sizes from the same ramp; only the caption rules there are expressions over `--fs`.
	it('is what the overlay chrome uses too', () => {
		const chrome = declarations().filter(
			({ file, value }) => file.startsWith('routes/overlay/') && !value.includes('--fs')
		);
		expect(chrome.length).toBeGreaterThan(0);
		for (const { file, value } of chrome) {
			expect(value, `${file} declares ${value}`).toMatch(ROLE);
		}
	});
});

/** Every declaration of `property` in the components' `<style>` blocks and in app.css below
 *  `:root`, with the file it came from. */
function styleDeclarations(property: string): Array<{ file: string; value: string }> {
	const root = APP_CSS.indexOf('\n}') + 2;
	return [
		{ file: 'app.css', css: APP_CSS.slice(root) },
		...sourceFiles(SRC).map((path) => {
			const source = readFileSync(path, 'utf8');
			return {
				file: path.slice(SRC.length + 1).replace(/\\/g, '/'),
				css: source.includes('<style') ? source.slice(source.indexOf('<style')) : ''
			};
		})
	].flatMap(({ file, css }) =>
		[...css.matchAll(new RegExp(`(?<![\\w-])${property}:\\s*([^;]+);`, 'g'))].map((m) => ({
			file,
			value: m[1].trim()
		}))
	);
}

// Small-capital labels had drifted to six trackings, from 0.06 to 0.16em, for one role. A
// heading's negative tracking is a different job and stays local.
describe('the tracking', () => {
	it('is one value for every small-capital label', () => {
		expect(APP_CSS).toMatch(/--tracking-caps:\s*0\.12em;/);
		const caps = styleDeclarations('letter-spacing').filter(({ value }) => !value.startsWith('-'));
		expect(caps.length).toBeGreaterThan(5);
		for (const { file, value } of caps) {
			expect(value, `${file} declares ${value}`).toBe('var(--tracking-caps)');
		}
	});
});

// Twelve line-heights, several 0.05 apart, became three. A single-line control keeps 1, and
// caption text keeps the leading the overlay's fitting code measures — it is the room's, not
// the interface's.
describe('the leading', () => {
	const CAPTION: Record<string, string[]> = {
		'routes/overlay/OverlayCaptionLine.svelte': ['1.34'],
		'routes/overlay/OverlayMoveChrome.svelte': ['1.34'],
		'lib/CaptionPreview.svelte': ['1.34'],
		// The operator's mirror of the caption, at display size.
		'lib/LiveTurns.svelte': ['1.3'],
		// A row of key caps: the leading is the cap's height, not a reading measure.
		'lib/KeyboardHelp.svelte': ['2']
	};

	it('is three steps, declared once', () => {
		const steps = [...APP_CSS.matchAll(/--leading-(\w+):\s*([\d.]+);/g)];
		expect(Object.fromEntries(steps.map(([, role, value]) => [role, Number(value)]))).toEqual({
			tight: 1.2,
			snug: 1.4,
			body: 1.5
		});
	});

	it('is what every line-height uses', () => {
		const leadings = styleDeclarations('line-height');
		expect(leadings.length).toBeGreaterThan(40);
		for (const { file, value } of leadings) {
			if (CAPTION[file]?.includes(value)) continue;
			expect(value, `${file} declares ${value}`).toMatch(
				/^(1|inherit|var\(--leading-(tight|snug|body)\))$/
			);
		}
	});
});

describe('clampTextScale', () => {
	it('passes the Windows range through untouched', () => {
		for (const factor of [1, 1.25, 1.45, 1.75, 2, 2.25]) {
			expect(clampTextScale(factor)).toBe(factor);
		}
	});

	it('holds anything past the slider at its edge', () => {
		expect(clampTextScale(0.2)).toBe(TEXT_SCALE_DEFAULT);
		expect(clampTextScale(9)).toBe(TEXT_SCALE_MAX);
	});

	// The factor crosses a JSON event boundary, so it can arrive as anything at all. A `NaN`
	// in `--text-scale` would invalidate every `calc()` in the stylesheet at once.
	it('falls back to no scaling for anything that is not a real number', () => {
		for (const junk of [NaN, Infinity, -Infinity, null, undefined, '2', {}]) {
			expect(clampTextScale(junk)).toBe(TEXT_SCALE_DEFAULT);
		}
	});
});

describe('applyTextScale', () => {
	function target() {
		const written: Record<string, string> = {};
		return {
			written,
			style: {
				setProperty: (name: string, value: string) => {
					written[name] = value;
				}
			}
		};
	}

	it('writes the clamped factor where the stylesheet reads it', () => {
		const root = target();
		applyTextScale(2.25, root);
		expect(root.written['--text-scale']).toBe('2.25');
	});

	it('never writes a value that would invalidate the stylesheet', () => {
		const root = target();
		applyTextScale('nonsense', root);
		expect(root.written['--text-scale']).toBe('1');
	});
});
