// Horizontal overflow across the whole matrix — every state, in English, French and German, at
// 100, 150 and 225% text — at the operator window's minimum size, where long German and
// French labels have the least room. Any element whose content is wider than its box fails
// the run, unless it is listed below as meant.

import { expect, test } from '@playwright/test';
import { LOCALES, MINIMUM_WINDOW, openOperator, SCALES, STATE_NAMES } from './operator';
import { overflow, type Offender } from './probe';

/** Overflows that are part of the design. Each says why, and matches as narrowly as it can:
 *  an entry here must never be able to hide clipped text. */
const INTENDED: { reason: string; matches(o: Offender): boolean }[] = [
	{
		reason:
			"A dialog's close button is pulled 6px into the corner with a negative margin " +
			'(`.header :global(.dismiss)` in ModalPrompt.svelte), into the padding of the dialog, ' +
			'so it does not make the header row taller.',
		matches: (o) =>
			/\[role=dialog\] "[^"]*" › div\.header$/.test(o.path) && o.scrollWidth - o.clientWidth <= 6
	},
	{
		reason:
			"A level meter's peak marker rides the edge of a full-width carrier that is translated " +
			'across the track by the peak level, and the track clips it (LevelMeter.svelte). The ' +
			'track holds no text.',
		matches: (o) => /› div\.track\[role=meter\] "[^"]*"$/.test(o.path) && o.text === ''
	}
];

function describe(offenders: Offender[]): string {
	return [
		`${offenders.length} element(s) overflow horizontally:`,
		...offenders.map(
			(o) =>
				`  ${o.path}\n    "${o.text}"\n    content ${o.scrollWidth}px in a ${o.clientWidth}px box ` +
				`(overflow-x: ${o.overflowX})`
		)
	].join('\n');
}

test.use({ viewport: MINIMUM_WINDOW });

for (const locale of LOCALES) {
	for (const scale of SCALES) {
		test.describe(`${locale} at ${scale * 100}%`, () => {
			for (const state of STATE_NAMES) {
				test(state, async ({ page }) => {
					await openOperator(page, { state, locale, scale });
					const unexpected = (await overflow(page)).filter(
						(o) => !INTENDED.some((intended) => intended.matches(o))
					);
					expect(unexpected, describe(unexpected)).toEqual([]);
				});
			}
		});
	}
}
