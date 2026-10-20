import { afterEach, describe, expect, it } from 'vitest';
import {
	decodeGeometry,
	loadGeometry,
	MAX_LAYOUTS,
	OVERLAY_GEOMETRY_KEY,
	recall,
	remember,
	saveGeometry,
	type RememberedPlacement
} from './overlayGeometry';
import type { Placement } from './profiles';

const LAPTOP = '0,0 2560x1600 150%';
const ROOM = '0,0 2560x1600 150%; 2560,0 1920x1080 100%';
const strip: Placement = { x: 2608, y: 880, width: 1824, height: 160 };
const centred: Placement = { x: 640, y: 720, width: 1280, height: 160 };

afterEach(() => {
	Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('remembering a placement', () => {
	it('puts the newest first and keeps one placement per layout', () => {
		const once = remember([], LAPTOP, centred);
		const twice = remember(once, ROOM, strip);
		expect(twice).toEqual([
			{ layout: ROOM, placement: strip },
			{ layout: LAPTOP, placement: centred }
		]);
		const moved = { ...centred, y: 1400 };
		expect(remember(twice, LAPTOP, moved)).toEqual([
			{ layout: LAPTOP, placement: moved },
			{ layout: ROOM, placement: strip }
		]);
	});

	it(`keeps ${MAX_LAYOUTS} layouts and drops the one used longest ago`, () => {
		let list: RememberedPlacement[] = [];
		for (let i = 0; i <= MAX_LAYOUTS; i++) list = remember(list, `layout ${i}`, centred);
		expect(list).toHaveLength(MAX_LAYOUTS);
		expect(list[0].layout).toBe(`layout ${MAX_LAYOUTS}`);
		expect(list.map((entry) => entry.layout)).not.toContain('layout 0');
		// Restoring counts as use: the layout reopened on is not the next to go.
		const used = recall(list, 'layout 1')!.list;
		expect(remember(used, 'one more', centred).map((entry) => entry.layout)).toContain('layout 1');
	});
});

describe('choosing what to restore', () => {
	const list = [
		{ layout: LAPTOP, placement: centred },
		{ layout: ROOM, placement: strip }
	];

	it("picks the current layout's own placement and marks it as the most recent", () => {
		expect(recall(list, ROOM)).toEqual({
			placement: strip,
			list: [
				{ layout: ROOM, placement: strip },
				{ layout: LAPTOP, placement: centred }
			]
		});
	});

	it('falls back to the most recent placement on a layout it has not seen, or an unknown one', () => {
		for (const layout of ['0,0 1280x720 100%', null]) {
			expect(recall(list, layout)).toEqual({ placement: centred, list });
		}
	});

	it('has nothing to restore when nothing is remembered', () => {
		expect(recall([], ROOM)).toBeNull();
		expect(recall([], null)).toBeNull();
	});
});

describe('stored geometry', () => {
	it('round-trips through storage under its own key', () => {
		const values = new Map<string, string>();
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			value: {
				getItem: (key: string) => values.get(key) ?? null,
				setItem: (key: string, value: string) => void values.set(key, value)
			}
		});
		const list = remember(remember([], LAPTOP, centred), ROOM, strip);
		saveGeometry(list);
		expect(JSON.parse(values.get(OVERLAY_GEOMETRY_KEY)!)).toEqual(list);
		expect(loadGeometry()).toEqual(list);
	});

	it('reads as nothing remembered without storage', () => {
		expect(loadGeometry()).toEqual([]);
		expect(() => saveGeometry([])).not.toThrow();
	});

	it('ignores a malformed value as a whole', () => {
		for (const raw of [null, '', 'not json', '{"layout":"x"}', '42', 'null']) {
			expect(decodeGeometry(raw)).toEqual([]);
		}
	});

	it('drops malformed entries one by one and keeps the rest', () => {
		const raw = JSON.stringify([
			null,
			'a string',
			{ layout: ROOM, placement: strip },
			{ layout: '', placement: centred },
			{ layout: 42, placement: centred },
			{ layout: 'x'.repeat(1025), placement: centred },
			{ layout: 'no rect' },
			{ layout: 'fractional', placement: { ...centred, x: 1.5 } },
			{ layout: 'empty', placement: { ...centred, width: 0 } },
			{ layout: 'huge', placement: { ...centred, height: 20000 } },
			{ layout: 'beyond i32', placement: { ...centred, x: 2 ** 31 } },
			// A second entry for a layout is a stale duplicate; the first, newer one wins.
			{ layout: ROOM, placement: centred },
			{ layout: LAPTOP, placement: { ...centred, extra: true } }
		]);
		expect(decodeGeometry(raw)).toEqual([
			{ layout: ROOM, placement: strip },
			{ layout: LAPTOP, placement: centred }
		]);
	});

	it(`reads no more than ${MAX_LAYOUTS} layouts`, () => {
		const many = Array.from({ length: MAX_LAYOUTS + 4 }, (_, i) => ({
			layout: `layout ${i}`,
			placement: centred
		}));
		expect(decodeGeometry(JSON.stringify(many))).toEqual(many.slice(0, MAX_LAYOUTS));
	});
});
