// Local Whisper in the real app: the Tiny model, then Rehearse, which plays the bundled English
// recording (`src-tauri/resources/fixtures/rehearsal-en.wav`) through the live pipeline. Its
// first sentence is about "the live caption system", which the Rust smoke test also listens for.
//
// The model comes from the cache the smoke test uses when `WHISPER_SMOKE_MODEL_CACHE` holds it,
// and is otherwise downloaded through the interface, as an operator would.

import { expect, test } from './fixtures';

test.use({ seedWhisperModel: true });

test('Whisper Tiny captions the English rehearsal recording', async ({ app }, testInfo) => {
	const { operator, overlay } = app;
	const announced = (text: string) => operator.getByRole('status').filter({ hasText: text });
	// Hugging Face on a cold runner; the app itself gives up only after 60 s without a byte.
	test.slow(!app.seededModel, 'downloads the model');

	await expect(operator.getByRole('button', { name: /^Local Whisper/ })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await operator.getByRole('combobox', { name: 'Whisper model' }).selectOption('tiny');
	const ready = announced('Model ready for offline transcription.');
	if (!app.seededModel) {
		await operator.getByRole('button', { name: 'Download model' }).click();
		await expect(ready).toHaveCount(1, { timeout: 5 * 60_000 });
	}
	await expect(ready).toHaveCount(1);

	const rehearse = operator.getByRole('button', { name: 'Rehearse' });
	await expect(rehearse).toBeEnabled();
	const started = Date.now();
	await rehearse.click();
	// Loading and verifying the model comes first, and a debug build hashes it slowly.
	await expect(announced('Captions are live.')).toHaveCount(1, { timeout: 60_000 });
	// Whisper's first window has to fill and be transcribed before anything appears, and this
	// runner may be a slow one; the overlay is sampled because each caption replaces the last.
	await expect
		.poll(async () => (await overlay.locator('body').innerText()).toLowerCase(), {
			message: 'a caption mentioning "caption" in the overlay',
			timeout: 2 * 60_000,
			intervals: [250]
		})
		.toContain('caption');
	const seconds = ((Date.now() - started) / 1000).toFixed(1);
	testInfo.annotations.push({ type: 'first caption', description: `${seconds} s after Rehearse` });
	console.log(`Whisper Tiny: first caption ${seconds} s after Rehearse`);

	await expect(operator.getByRole('region', { name: 'Transcript' })).toContainText(/caption/i);
	// No Stop: Whisper transcribes every queued second before it reports idle, which took
	// over a minute here on a busy machine. The fixture ends the process either way.
});
