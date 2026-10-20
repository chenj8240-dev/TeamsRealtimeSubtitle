/**
 * The typeface the audience reads, and how the app knows a face is actually there.
 *
 * Issue #55 left the route open: bundle more `@fontsource` families beside Archivo, or offer
 * faces Windows already ships. This picks the system faces, for three reasons.
 *
 * **Cost.** Every bundled weight is MSIX size for every user, including the ones who never
 * open this control. The overlay renders captions at weight 600, so a bundled face is not one
 * file but at least one per weight it is offered at.
 *
 * **No synthesized bold.** The worry with system faces was a fake bold at 40px, and it does
 * not arise. CSS font matching for a desired weight above 500 walks *up* first, so a family
 * with only 400 and 700 renders 600 as its real Bold. Segoe UI has a true Semibold. Nothing
 * offered here is synthesized.
 *
 * **Availability is checkable.** The remaining objection was that "Windows 11 ships it" is a
 * per-SKU assumption. It does not have to be assumed: `faceIsAvailable` measures the family
 * against the generic it would fall back to, which needs no permission and no Local Font
 * Access API. A face that is not installed never reaches the control.
 *
 * Every stack still ends in Archivo, which is bundled — so even a face that slips past the
 * probe degrades to the app's own type rather than to whatever the OS decides.
 */
import { readStored } from './persisted';

export type CaptionFaceId = 'archivo' | 'segoe' | 'verdana' | 'tahoma' | 'arial' | 'georgia';

export interface CaptionFace {
	id: CaptionFaceId;
	/** Shown in the control. A typeface name is a proper noun; it is not translated. */
	label: string;
	/** The family the stack asks for first, and the one availability is probed for. */
	family: string;
	/** The full CSS value, always ending somewhere certain to exist. */
	stack: string;
	/** True when the app ships the face itself, so it is never absent and never probed. */
	bundled?: boolean;
}

/** The bundled default, and the tail of every other stack. */
const FALLBACK = "'Archivo', system-ui, sans-serif";

/**
 * Ordered as offered. The list is short on purpose: this is a control an operator reaches for
 * once, minutes before a talk, and a menu of every installed font would be a worse answer
 * than six faces that are each good for a different room.
 */
export const CAPTION_FACES: readonly CaptionFace[] = [
	{ id: 'archivo', label: 'Archivo', family: 'Archivo', stack: FALLBACK, bundled: true },
	// The Windows interface face: the safest choice when captions share a screen with the OS.
	{ id: 'segoe', label: 'Segoe UI', family: 'Segoe UI', stack: `'Segoe UI', ${FALLBACK}` },
	// Drawn for the screen, with wide counters and unambiguous letterforms — the best of these
	// at the back of a large room, and the widest, which is why #54's measure is not a fixed
	// physical width across faces.
	{ id: 'verdana', label: 'Verdana', family: 'Verdana', stack: `Verdana, ${FALLBACK}` },
	// Verdana's narrower sibling: the same clarity when the caption region is tight.
	{ id: 'tahoma', label: 'Tahoma', family: 'Tahoma', stack: `Tahoma, Verdana, ${FALLBACK}` },
	{ id: 'arial', label: 'Arial', family: 'Arial', stack: `Arial, Helvetica, ${FALLBACK}` },
	// The one serif. Offered because captions usually sit under slides set in a sans, and a
	// contrasting face reads as a separate layer rather than as part of the deck.
	{
		id: 'georgia',
		label: 'Georgia',
		family: 'Georgia',
		stack: `Georgia, 'Times New Roman', ${FALLBACK}`
	}
];

export const DEFAULT_CAPTION_FACE: CaptionFaceId = 'archivo';
export const CAPTION_FACE_KEY = 'overlay.captionFace';

const BY_ID = new Map(CAPTION_FACES.map((face) => [face.id, face]));

export function isCaptionFace(value: unknown): value is CaptionFaceId {
	return typeof value === 'string' && BY_ID.has(value as CaptionFaceId);
}

/** The CSS `font-family` for a face id. An unknown id gives the default, never nothing: a
 *  caption with no family would paint in the browser's, which is not a choice anyone made. */
export function captionFaceStack(id: unknown): string {
	const face = isCaptionFace(id) ? BY_ID.get(id) : BY_ID.get(DEFAULT_CAPTION_FACE);
	return face!.stack;
}

/** Read the persisted face. Shared with the overlay through the same localStorage origin. */
export function loadCaptionFace(): CaptionFaceId {
	const stored = readStored(CAPTION_FACE_KEY);
	return isCaptionFace(stored) ? stored : DEFAULT_CAPTION_FACE;
}

/** Width of a probe string set in a given CSS `font-family` value. */
export type MeasureText = (fontFamily: string) => number;

/** Wide letters and narrow ones, so two faces have to agree about a lot to measure the same. */
const PROBE = 'mmmmmmmmmmwwwwwwwwwwiiiiiiiiii';

/** The generics a missing family falls through to. Three, because a face can legitimately
 *  measure the same as one of them — Arial beside a sans-serif default, say — and being wrong
 *  about that would hide a face that is installed. */
const GENERICS = ['monospace', 'sans-serif', 'serif'];

/**
 * Whether a family is installed, by the oldest trick there is: ask for it with a generic
 * behind it, and see whether the text comes out the same width as the generic alone. If the
 * family is missing the browser renders the generic and the two agree exactly.
 *
 * No permission, no Local Font Access API, nothing that behaves differently inside WebView2.
 */
export function faceIsAvailable(family: string, measure: MeasureText): boolean {
	return GENERICS.some((generic) => measure(`'${family}', ${generic}`) !== measure(generic));
}

/**
 * The faces this machine can actually render.
 *
 * The bundled default is never probed and never dropped: `@fontsource` loads asynchronously,
 * so a probe running at mount can genuinely find Archivo missing, and answering "no" there
 * would take the default away from the control that is meant to always offer it.
 *
 * `measure` is a parameter rather than a canvas so this stays a pure function: the rule is
 * testable without a DOM, and the DOM part is the four lines in `measureWithCanvas`.
 */
export function availableCaptionFaces(measure: MeasureText | null): readonly CaptionFace[] {
	// No way to measure is not evidence of absence. Offer everything and let the stacks do
	// their job: a face that turns out to be missing paints in Archivo, which is not a failure.
	if (!measure) return CAPTION_FACES;
	return CAPTION_FACES.filter((face) => face.bundled || faceIsAvailable(face.family, measure));
}

/** A canvas-backed measurer, or null where there is no canvas to measure with. */
export function measureWithCanvas(): MeasureText | null {
	if (typeof document === 'undefined') return null;
	const ctx = document.createElement('canvas').getContext('2d');
	if (!ctx) return null;
	return (fontFamily) => {
		// The weight and size the overlay actually renders at: a family can be installed at
		// one weight and not another, and this control has to answer for the caption.
		ctx.font = `600 72px ${fontFamily}`;
		return ctx.measureText(PROBE).width;
	};
}
