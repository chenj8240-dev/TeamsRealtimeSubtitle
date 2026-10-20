import { normalizeAppearance, type Appearance } from './appearance';
import { normalizeStartOptions } from './startOptions';
import type { StartOptions } from './types';

export const PROFILES_KEY = 'meeting.profiles';
/** The overlay window's rectangle in physical pixels, as `placement.rs` reads and sets it. */
export interface Placement {
	x: number;
	y: number;
	width: number;
	height: number;
}

const isInteger = (value: unknown): value is number => Number.isSafeInteger(value);

/** A stored rectangle, or null when it is not one the core would accept: whole pixels, a
 *  position that fits its `i32` and a size it can clamp. Shared by profiles and the placement
 *  remembered per display layout, both of which come out of storage that can hold anything. */
export function decodePlacement(value: unknown): Placement | null {
	if (!value || typeof value !== 'object') return null;
	const { x, y, width, height } = value as Record<string, unknown>;
	if (!isInteger(x) || !isInteger(y) || !isInteger(width) || !isInteger(height)) return null;
	const valid =
		Math.abs(x) <= 2147483647 &&
		Math.abs(y) <= 2147483647 &&
		width > 0 &&
		height > 0 &&
		width <= 16384 &&
		height <= 16384;
	return valid ? { x, y, width, height } : null;
}
export interface MeetingProfile {
	id: string;
	name: string;
	options: StartOptions;
	appearance: Appearance;
	placement: Placement | null;
}
export function decodeProfiles(raw: string | null): MeetingProfile[] {
	try {
		const data: unknown = JSON.parse(raw ?? '[]');
		if (!Array.isArray(data)) return [];
		const ids = new Set<string>();
		return data.flatMap((p) => {
			if (
				!p ||
				typeof p.id !== 'string' ||
				ids.has(p.id) ||
				typeof p.name !== 'string' ||
				!p.name.trim()
			)
				return [];
			ids.add(p.id);
			return [
				{
					id: p.id,
					name: p.name.trim().slice(0, 80),
					options: normalizeStartOptions(p.options),
					appearance: normalizeAppearance(p.appearance),
					placement: decodePlacement(p.placement)
				}
			];
		});
	} catch {
		return [];
	}
}
