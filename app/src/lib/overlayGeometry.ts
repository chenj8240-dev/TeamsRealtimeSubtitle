// Where the caption overlay was last placed, remembered per display layout so that it reopens
// there: on the projector when the projector is plugged in, on the laptop when it is alone.
//
// Kept in the interface, like every other preference, rather than in the core. Nothing has to
// happen before this window boots: the overlay is created centred, but it paints nothing until
// there are captions or move mode, and neither can begin before the operator window is up to
// ask for it — so moving the overlay as this window mounts shows no jump. The core supplies
// what only it can know: the layout's signature (`display_layout`) and a rectangle clamped to
// a visible work area (`set_overlay_placement`), which is how every restore is applied.

import { decodePlacement, type Placement } from './profiles';
import { readStored, writeStored } from './persisted';

export const OVERLAY_GEOMETRY_KEY = 'overlay.geometry';

/** How many display layouts keep a placement. An operator moves between a handful of rooms;
 *  past this many, the one used longest ago is dropped. */
export const MAX_LAYOUTS = 8;

/** Far longer than a real signature (about 25 characters a display), short enough that a
 *  corrupt value cannot be carried from run to run at any size. */
const MAX_LAYOUT_LENGTH = 1024;

export interface RememberedPlacement {
	/** `display_layout`'s signature for the displays the placement was made on. */
	layout: string;
	/** Physical pixels, as `get_overlay_placement` read them. */
	placement: Placement;
}

/** A signature as the core produces it: a short, non-empty string. */
export function isLayout(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= MAX_LAYOUT_LENGTH;
}

/** The stored list, most recently used first. Storage is shared with the overlay window and
 *  outlives updates, so it can hold anything: a malformed entry is dropped on its own, and a
 *  malformed value as a whole reads as nothing remembered. */
export function decodeGeometry(raw: string | null): RememberedPlacement[] {
	let data: unknown;
	try {
		data = JSON.parse(raw ?? '[]');
	} catch {
		return [];
	}
	if (!Array.isArray(data)) return [];
	const seen = new Set<string>();
	const list: RememberedPlacement[] = [];
	for (const entry of data) {
		if (!entry || typeof entry !== 'object') continue;
		const { layout, placement } = entry as Record<string, unknown>;
		const rect = decodePlacement(placement);
		if (!isLayout(layout) || !rect || seen.has(layout)) continue;
		seen.add(layout);
		list.push({ layout, placement: rect });
	}
	return list.slice(0, MAX_LAYOUTS);
}

/** `list` with `placement` as the one for `layout`, at the front; past the cap, the least
 *  recently used layout goes. */
export function remember(
	list: readonly RememberedPlacement[],
	layout: string,
	placement: Placement
): RememberedPlacement[] {
	const rest = list.filter((entry) => entry.layout !== layout);
	return [{ layout, placement }, ...rest].slice(0, MAX_LAYOUTS);
}

/**
 * What to restore on `layout`: its own placement when it has one, which also counts as using
 * it; otherwise the most recent placement on any layout, which the core then clamps onto a
 * display that is there. `layout` is null when the core could not say. Null when nothing is
 * remembered at all — a first launch, which keeps the overlay where it was created.
 */
export function recall(
	list: readonly RememberedPlacement[],
	layout: string | null
): { placement: Placement; list: RememberedPlacement[] } | null {
	const own = list.find((entry) => entry.layout === layout);
	if (own) return { placement: own.placement, list: remember(list, own.layout, own.placement) };
	const latest = list[0];
	return latest ? { placement: latest.placement, list: [...list] } : null;
}

/** Through `persisted.ts`, so storage that refuses access reads as nothing remembered. */
export function loadGeometry(): RememberedPlacement[] {
	return decodeGeometry(readStored(OVERLAY_GEOMETRY_KEY));
}

/** A refused write is ignored: the overlay is where it is, and the next save tries again. */
export function saveGeometry(list: readonly RememberedPlacement[]): void {
	writeStored(OVERLAY_GEOMETRY_KEY, JSON.stringify(list));
}
