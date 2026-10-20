// The spacing and radius scales get the same guard as the type ramp in `typeScale.test.ts`:
// read the stylesheets and fail on anything that opted out. Components had drifted to 22
// pixel spacings beside 25 rem and em ones, and nine hand-written radii beside two tokens —
// each fine on its own, and together a window with no rhythm. A px gap is also one the
// operator's Windows text size cannot reach, which is why the scale is in rem.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');
const APP_CSS = readFileSync(join(SRC, 'app.css'), 'utf8');
const ROOT = APP_CSS.slice(APP_CSS.indexOf(':root'), APP_CSS.indexOf('\n}'));

/** The overlay's caption layout is measured by the fitting code, and its spacing is part of
 *  what is measured; the operator's own chrome in that window is not exempt. */
const CAPTION_LAYOUT = ['routes/overlay/+page.svelte', 'routes/overlay/OverlayCaptionLine.svelte'];

function sourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return sourceFiles(path);
		return entry.name.endsWith('.svelte') ? [path] : [];
	});
}

/** Every stylesheet the operator reads: each component's `<style>`, and app.css below `:root`. */
function stylesheets(): Array<{ file: string; css: string }> {
	return [
		{ file: 'app.css', css: APP_CSS.slice(APP_CSS.indexOf('\n}') + 2) },
		...sourceFiles(SRC)
			.map((path) => ({
				file: path.slice(SRC.length + 1).replace(/\\/g, '/'),
				source: readFileSync(path, 'utf8')
			}))
			.filter(({ file, source }) => !CAPTION_LAYOUT.includes(file) && source.includes('<style'))
			.map(({ file, source }) => ({ file, css: source.slice(source.indexOf('<style')) }))
	];
}

function declarations(property: RegExp): Array<{ file: string; value: string }> {
	return stylesheets().flatMap(({ file, css }) =>
		[...css.matchAll(new RegExp(`(?<![\\w-])(?:${property.source}):\\s*([^;]+);`, 'g'))].map(
			(m) => ({ file, value: m[1].trim() })
		)
	);
}

describe('the spacing scale', () => {
	it('is six steps of 4px, in rem', () => {
		const steps = [...ROOT.matchAll(/--space-(\d):\s*([\d.]+)rem;/g)].map(([, step, rem]) => [
			Number(step),
			Number(rem) * 16
		]);
		expect(steps).toEqual([
			[1, 4],
			[2, 8],
			[3, 12],
			[4, 16],
			[5, 24],
			[6, 32]
		]);
	});

	// A zero, `auto`, a nudge of a few pixels that lines a mark up with the text beside it (a
	// checkbox, a status dot), or a negative margin that pulls a control into a corner is not
	// spacing, and says so by being written in px. Room kept for a control inside a field is
	// that control's width plus a step.
	it('is what every padding, margin and gap uses', () => {
		const spacing = declarations(/padding(?:-[a-z]+)?|margin(?:-[a-z]+)?|gap|row-gap|column-gap/);
		expect(spacing.length).toBeGreaterThan(100);
		for (const { file, value } of spacing) {
			const parts = value.startsWith('calc(') ? [value] : value.split(/\s+/);
			for (const part of parts) {
				expect(part, `${file} declares ${value}`).toMatch(
					/^(var\(--space-[1-6]\)|calc\([\d.]+rem \+ var\(--space-[1-6]\)\)|0|auto|[0-3]px|-\d+px|0\.2rem)$/
				);
			}
		}
	});
});

// Windows 11 rounds what sits in a page by 4px and what floats above it by 8px; the names say
// which, rather than how big.
describe('the radius scale', () => {
	it('is named by role, at Windows 11 geometry', () => {
		const radii = Object.fromEntries(
			[...ROOT.matchAll(/--radius-([\w-]+):\s*([^;]+);/g)].map(([, role, value]) => [role, value])
		);
		expect(radii).toEqual({ control: '4px', card: '4px', overlay: '8px', pill: '999px' });
	});

	// The toolbar's brand mark is the app icon in miniature, so it rounds by the icon's own
	// proportion (224 of 1024) rather than by a step of the scale.
	it('is what every corner uses', () => {
		const radii = declarations(/border-radius/);
		expect(radii.length).toBeGreaterThan(20);
		for (const { file, value } of radii) {
			if (file === 'lib/OperatorToolbar.svelte' && value === '21.875%') continue;
			expect(value, `${file} declares ${value}`).toMatch(
				/^(var\(--radius-(control|card|overlay|pill)\)|50%|0)$/
			);
		}
	});
});

// 2rem appeared six times, 2.25rem three and 2.5rem two, and the language picker sat at
// 40px beside 36px selects. A control's box is one of the three button sizes.
describe('the control heights', () => {
	it('are the three button sizes', () => {
		const sizes = [...ROOT.matchAll(/--control-(sm|md|lg):\s*([\d.]+)rem;/g)].map(
			([, size, rem]) => [size, Number(rem) * 16]
		);
		expect(sizes).toEqual([
			['sm', 32],
			['md', 36],
			['lg', 40]
		]);
	});

	it('are what every control box uses', () => {
		const boxes = declarations(/(?:min-|max-)?(?:height|width)/).filter(({ value }) =>
			/^(2|2\.25|2\.5)rem$/.test(value)
		);
		expect(boxes).toEqual([]);
	});
});
