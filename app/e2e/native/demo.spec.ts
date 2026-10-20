// The built-in demo, end to end in the real app: the one engine that needs no key, no model
// and no microphone, so it runs on any machine — a CI runner with no audio devices included.
// Its timeline is `src-tauri/src/ondevice/mod.rs`; the line below opens its English script.

import { expect, test } from './fixtures';

const FIRST_LINE = 'This is a built-in demonstration of the live caption display.';

test('the demo captions the overlay, pauses, resumes and stops, and closing asks first', async ({
	app
}) => {
	const { operator, overlay } = app;
	// The state twice: as a screen reader hears it, and as the pill in the bar shows it.
	const announced = (text: string) => operator.getByRole('status').filter({ hasText: text });
	const pill = (text: string) => operator.getByRole('banner').getByText(text, { exact: true });

	// Whisper is the first-launch engine and wants a model; the demo starts as it is.
	await operator.getByRole('button', { name: /^Built-in demo/ }).click();
	const start = operator.getByRole('button', { name: 'Start demo subtitles' });
	await expect(start).toBeEnabled();
	await start.click();

	// The overlay is a separate window fed by the core's caption events, not by this page, and
	// it shows each line for a second or two before the next one, so it is sampled often.
	await expect
		.poll(() => overlay.locator('body').innerText(), {
			message: 'the first demo line in the overlay',
			timeout: 15_000,
			intervals: [100]
		})
		.toContain(FIRST_LINE);
	await expect(announced('Captions are live.')).toHaveCount(1);
	await expect(pill('Demo')).toBeVisible();

	await operator.getByRole('button', { name: 'Pause', exact: true }).click();
	await expect(announced('Captions paused.')).toHaveCount(1);
	await expect(pill('Paused')).toBeVisible();
	await operator.getByRole('button', { name: 'Resume', exact: true }).click();
	await expect(announced('Captions are live.')).toHaveCount(1);
	await expect(pill('Demo')).toBeVisible();

	await operator.getByRole('button', { name: 'Stop captions' }).click();
	await expect(announced('Session idle.')).toHaveCount(1);
	await expect(pill('Idle')).toBeVisible();
	await expect(start).toBeEnabled();
	await expect(operator.getByRole('region', { name: 'Transcript' })).toContainText(FIRST_LINE);
	await expect(operator.getByRole('main').getByText('Unsaved', { exact: true })).toBeVisible();

	// The frame's X: the core holds the close while the transcript is unsaved and asks the page.
	await app.requestClose();
	const prompt = operator.getByRole('dialog', { name: 'Save this transcript before closing?' });
	await expect(prompt).toBeVisible();
	await prompt.getByRole('button', { name: 'Discard and close' }).click();
	await expect.poll(() => app.exitCode(), { message: 'the app exits on its own' }).toBe(0);
});
