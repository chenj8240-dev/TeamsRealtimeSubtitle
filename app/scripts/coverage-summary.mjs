// Turns Vitest's `coverage/coverage-summary.json` into Markdown for a CI job summary:
// `node scripts/coverage-summary.mjs >> "$GITHUB_STEP_SUMMARY"`. Totals first, then every file
// folded away, least-covered first, since those are the rows worth reading.
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const summary = JSON.parse(
	readFileSync(new URL('../coverage/coverage-summary.json', import.meta.url), 'utf8')
);
const metrics = ['lines', 'statements', 'functions', 'branches'];
const cells = (entry) =>
	metrics.map((m) => `${entry[m].pct}% (${entry[m].covered}/${entry[m].total})`);
const row = (name, entry) => `| ${[name, ...cells(entry)].join(' | ')} |`;
const header = [
	'| | Lines | Statements | Functions | Branches |',
	'| --- | --- | --- | --- | --- |'
];

const { total, ...files } = summary;
const byLines = Object.entries(files)
	.map(([path, entry]) => [relative(root, path).replaceAll('\\', '/'), entry])
	.sort(([a, x], [b, y]) => x.lines.pct - y.lines.pct || a.localeCompare(b));

console.log(
	[
		'### Frontend coverage',
		'',
		...header,
		row('**All files**', total),
		'',
		`<details><summary>${byLines.length} files, least covered first</summary>`,
		'',
		...header,
		...byLines.map(([path, entry]) => row(`\`${path}\``, entry)),
		'',
		'</details>',
		''
	].join('\n')
);
