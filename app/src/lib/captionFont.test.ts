import { afterEach, describe, expect, it } from 'vitest';
import {
	availableCaptionFaces,
	CAPTION_FACES,
	captionFaceStack,
	DEFAULT_CAPTION_FACE,
	faceIsAvailable,
	isCaptionFace,
	loadCaptionFace,
	type MeasureText
} from './captionFont';

// What makes this list different from a colour or a size: the app cannot make a font exist.
// Every rule below is about that — the stack has somewhere to fall to, the probe fails safe,
// and the one face the app ships is never the one that gets dropped.
describe('the caption faces', () => {
	it('offers each face once', () => {
		const ids = CAPTION_FACES.map((face) => face.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	// The whole point of a stack. A face that is missing, or that the probe wrongly let
	// through, has to land on something the app ships rather than on the browser's default —
	// which on a projector is the difference between the app's type and Times New Roman.
	it('ends every stack in a face the app itself ships', () => {
		for (const face of CAPTION_FACES) {
			expect(face.stack, face.id).toMatch(/'Archivo'/);
		}
	});

	it('asks for its own family first, which is the one availability is probed for', () => {
		for (const face of CAPTION_FACES) {
			const asked = face.stack.split(',')[0].replace(/'/g, '').trim();
			expect(asked, face.id).toBe(face.family);
		}
	});

	it('ships exactly one bundled face, and it is the default', () => {
		const bundled = CAPTION_FACES.filter((face) => face.bundled);
		expect(bundled.map((face) => face.id)).toEqual([DEFAULT_CAPTION_FACE]);
	});
});

describe('reading a stored face', () => {
	afterEach(() => {
		Reflect.deleteProperty(globalThis, 'localStorage');
	});

	function stored(value: string | null): void {
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			value: { getItem: () => value }
		});
	}

	it('accepts every id it offers, and nothing else', () => {
		for (const face of CAPTION_FACES) expect(isCaptionFace(face.id), face.id).toBe(true);
		for (const junk of ['', 'Comic Sans MS', 'archivo ', 42, null, undefined, {}])
			expect(isCaptionFace(junk), String(junk)).toBe(false);
	});

	// A value from an older build, or one edited by hand. Painting nothing is the failure
	// worth naming: a caption with no family is set in whatever the browser picks.
	it('falls back to the default rather than to no typeface at all', () => {
		expect(captionFaceStack('a face that was dropped two releases ago')).toBe(
			captionFaceStack(DEFAULT_CAPTION_FACE)
		);
		expect(captionFaceStack(undefined)).toBe(captionFaceStack(DEFAULT_CAPTION_FACE));
	});

	it('restores a face the operator chose', () => {
		stored('verdana');
		expect(loadCaptionFace()).toBe('verdana');
	});

	it('ignores a stored value it does not recognise', () => {
		stored('wingdings');
		expect(loadCaptionFace()).toBe(DEFAULT_CAPTION_FACE);
	});

	it('has an answer before anything has ever been stored', () => {
		stored(null);
		expect(loadCaptionFace()).toBe(DEFAULT_CAPTION_FACE);
		Reflect.deleteProperty(globalThis, 'localStorage');
		expect(loadCaptionFace()).toBe(DEFAULT_CAPTION_FACE);
	});
});

/** A machine with exactly `installed` present: anything else measures as its generic. */
function machineWith(installed: string[]): MeasureText {
	// One number per generic, and a distinct one per installed family — the same arithmetic
	// the real canvas does, without a canvas.
	const widthOf = (name: string) => name.length * 7 + 3;
	return (fontFamily) => {
		const [first, generic] = fontFamily.split(', ');
		const family = first.replace(/'/g, '');
		if (!generic) return widthOf(family);
		return installed.includes(family) ? widthOf(family) : widthOf(generic);
	};
}

describe('deciding whether a face is installed', () => {
	it('sees a face that renders differently from the generic behind it', () => {
		expect(faceIsAvailable('Verdana', machineWith(['Verdana']))).toBe(true);
	});

	it('does not see one that falls straight through to the generic', () => {
		expect(faceIsAvailable('Verdana', machineWith([]))).toBe(false);
	});

	// The reason there are three generics rather than one. A face that happens to measure
	// exactly like the sans-serif default would be declared missing by a single-generic probe
	// even though it is installed, and the operator would silently lose a choice.
	it('still sees a face that measures like one generic but not the others', () => {
		const GENERIC: Record<string, number> = { monospace: 100, 'sans-serif': 120, serif: 140 };
		// Arial is installed here, and happens to be exactly as wide as the sans-serif default.
		const measure: MeasureText = (fontFamily) => {
			const [first, generic] = fontFamily.split(', ');
			if (!generic) return GENERIC[first];
			return first === "'Arial'" ? GENERIC['sans-serif'] : GENERIC[generic];
		};
		expect(faceIsAvailable('Arial', measure)).toBe(true);
	});
});

describe('the offered list on a given machine', () => {
	it('drops the faces this machine does not have', () => {
		const offered = availableCaptionFaces(machineWith(['Verdana', 'Georgia']));
		expect(offered.map((face) => face.id)).toEqual([DEFAULT_CAPTION_FACE, 'verdana', 'georgia']);
	});

	// The bundled webfont loads asynchronously, so a probe running early genuinely reports it
	// missing. Trusting that would take the default off the list — the one face that is always
	// there is the one this must never drop.
	it('keeps the bundled default even when the probe cannot find it', () => {
		const offered = availableCaptionFaces(machineWith([]));
		expect(offered.map((face) => face.id)).toEqual([DEFAULT_CAPTION_FACE]);
	});

	// No canvas is not evidence of absence, and the cost of being wrong is asymmetric: an
	// offered face that turns out to be missing paints in Archivo, while a face wrongly
	// withheld is a choice the operator cannot get back.
	it('offers everything when there is no way to measure', () => {
		expect(availableCaptionFaces(null)).toEqual(CAPTION_FACES);
	});
});
