// The failure message for a style snapshot: what changed, property by property.
//
// Playwright's own diff is by line, and a line holds a whole element, so on its own it says
// that an element changed and leaves the reader to spot where in a long line. This reads the
// committed snapshot and the new one and says it the other way round: each distinct change,
// once, with the elements it reached — `border-radius: 4px → 6px (9 elements)` — which is
// also what a token change looks like.

type Styles = Map<string, Map<string, string>>;

const LINE = /^(.*) \{ (.*) \}$/;

function parse(snapshot: string): Styles {
	const styles: Styles = new Map();
	for (const line of snapshot.split('\n')) {
		const match = LINE.exec(line);
		if (!match) continue;
		const declarations = match[2].split('; ').map((declaration) => {
			const colon = declaration.indexOf(': ');
			return [declaration.slice(0, colon), declaration.slice(colon + 2)] as const;
		});
		styles.set(match[1], new Map(declarations));
	}
	return styles;
}

/** Each distinct change between two snapshots with the elements it reached, or '' when the
 *  two hold the same values. A property missing from a line is the parent's value (inherited
 *  properties) or the unstyled element's (the rest), and prints as `(default)`. */
export function describeChanges(before: string, after: string, listed = 8): string {
	const old = parse(before);
	const now = parse(after);
	const changes = new Map<string, string[]>();
	const note = (change: string, path: string) =>
		changes.set(change, [...(changes.get(change) ?? []), path]);

	for (const [path, values] of now) {
		const previous = old.get(path);
		if (!previous) {
			note('element added', path);
			continue;
		}
		for (const property of new Set([...previous.keys(), ...values.keys()])) {
			const from = previous.get(property) ?? '(default)';
			const to = values.get(property) ?? '(default)';
			if (from !== to) note(`${property}: ${from} → ${to}`, path);
		}
	}
	for (const path of old.keys()) if (!now.has(path)) note('element removed', path);
	if (!changes.size) return '';

	const lines = [`Computed styles changed (${changes.size} distinct change(s)):`];
	for (const [change, paths] of changes) {
		lines.push(`  ${change}  — ${paths.length} element(s)`);
		for (const path of paths.slice(0, listed)) lines.push(`      ${path}`);
		if (paths.length > listed) lines.push(`      … and ${paths.length - listed} more`);
	}
	return lines.join('\n');
}
