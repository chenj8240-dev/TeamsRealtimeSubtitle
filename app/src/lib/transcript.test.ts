import { describe, expect, it } from 'vitest';
import {
	DEFAULT_LABELS,
	formatTranscript,
	groupTranscript,
	hasOriginalSpeech,
	transcriptFilename
} from './transcript';
import type { TranscriptLine } from './types';

describe('timed exports', () => {
	const mic: TranscriptLine = {
		id: 1,
		origin: 'microphone',
		text: 'Bonjour <room>\n\n& hello',
		sourceText: '',
		startMs: 1000,
		endMs: 3000
	};
	const system: TranscriptLine = {
		...mic,
		id: 2,
		origin: 'system',
		text: 'English',
		startMs: 0,
		endMs: 0
	};
	it('orders overlapping sources by start and gives instant finalizations a positive duration', () => {
		const result = formatTranscript([mic, system], 'srt');
		expect(result).toContain('1\n00:00:00,000 --> 00:00:00,001\n[System] English');
		expect(result).toContain(
			'2\n00:00:01,000 --> 00:00:03,000\n[Microphone] Bonjour &lt;room&gt; &amp; hello'
		);
	});
	it('writes WebVTT voice labels and hours beyond 24', () => {
		const result = formatTranscript([{ ...mic, startMs: 90000000, endMs: 90001000 }], 'vtt');
		expect(result).toContain('WEBVTT\n\n1\n25:00:00.000 --> 25:00:01.000');
		expect(result).toContain('<v Microphone>');
	});
	it('handles empty exports but refuses missing or invalid timings without losing text', () => {
		expect(formatTranscript([], 'vtt')).toBe('WEBVTT\n\n');
		expect(formatTranscript([], 'srt')).toBe('');
		for (const invalid of [undefined, -1, NaN])
			expect(() => formatTranscript([{ ...mic, startMs: invalid }], 'srt')).toThrow();
	});
});

/** The store keeps the log newest-first, so fixtures are written that way too. */
const lines: TranscriptLine[] = [
	{ id: 4, text: 'problématique.', sourceText: '', origin: 'microphone' },
	{ id: 3, text: 'Les fenêtres, ceci est un peu', sourceText: '', origin: 'microphone' },
	{ id: 2, text: 'Les sous-titres apparaissent sous.', sourceText: '', origin: 'system' },
	{ id: 1, text: 'Ça fonctionne.', sourceText: '', origin: 'microphone' }
];

describe('groupTranscript', () => {
	it('separates same-source speech after a five-second pause', () => {
		expect(
			groupTranscript([
				{ ...lines[0], id: 2, text: 'Next topic.', startMs: 7000, endMs: 8000 },
				{ ...lines[0], id: 1, text: 'First topic.', startMs: 1000, endMs: 2000 }
			]).map((p) => p.text)
		).toEqual(['First topic.', 'Next topic.']);
	});

	it('bounds paragraph aggregation without losing or splitting caption lines', () => {
		const source = Array.from({ length: 100 }, (_, i) => ({
			...lines[0],
			id: 100 - i,
			text: `Sentence ${100 - i}: ${'words '.repeat(20).trim()}.`
		}));
		const paragraphs = groupTranscript(source);
		expect(paragraphs.length).toBeGreaterThan(1);
		expect(paragraphs.every((p) => p.text.length <= 600)).toBe(true);
		expect(paragraphs.map((p) => p.text).join(' ')).toBe(
			[...source]
				.reverse()
				.map((l) => l.text)
				.join(' ')
		);
	});

	it('keeps a single long caption intact', () => {
		const text = 'word '.repeat(200).trim();
		expect(groupTranscript([{ ...lines[0], text }])[0].text).toBe(text);
	});

	it('orders lines chronologically and starts a paragraph on each source change', () => {
		expect(groupTranscript(lines)).toEqual([
			{ id: 1, origin: 'microphone', text: 'Ça fonctionne.', sourceText: '', lane: 0 },
			{
				id: 2,
				origin: 'system',
				text: 'Les sous-titres apparaissent sous.',
				sourceText: '',
				lane: 0
			},
			{
				id: 3,
				origin: 'microphone',
				text: 'Les fenêtres, ceci est un peu problématique.',
				sourceText: '',
				lane: 0
			}
		]);
	});

	it('drops blank lines', () => {
		const withBlank: TranscriptLine[] = [
			{ id: 2, text: '   ', sourceText: '', origin: 'system' },
			{ id: 1, text: 'Bonjour', sourceText: '', origin: 'system' }
		];
		expect(groupTranscript(withBlank)).toEqual([
			{ id: 1, origin: 'system', text: 'Bonjour', sourceText: '', lane: 0 }
		]);
	});
});

describe('formatTranscript', () => {
	it('exports plain text as labelled paragraphs without timestamps', () => {
		expect(formatTranscript(lines, 'text')).toBe(
			'Microphone\nÇa fonctionne.\n' +
				'\nSystem\nLes sous-titres apparaissent sous.\n' +
				'\nMicrophone\nLes fenêtres, ceci est un peu problématique.\n'
		);
	});

	it('exports Markdown with a stable heading and bold source labels', () => {
		const result = formatTranscript(lines, 'markdown', new Date('2026-09-21T10:00:00Z'));
		expect(result).toContain('# Live captions transcript');
		expect(result).toContain('**Microphone**');
		expect(result).toContain('**System**');
		expect(result.indexOf('Ça fonctionne.')).toBeLessThan(
			result.indexOf('Les sous-titres apparaissent sous.')
		);
		// The header keeps its export date — the transcript itself carries no clock times.
		// Asserted on the body only, since `toLocaleString` renders the header per locale.
		const body = result.slice(result.indexOf('**Microphone**'));
		expect(body).not.toMatch(/\d{1,2}[:.h]\d{2}/);
	});

	// Issue #23: the file is the part of this app that leaves the machine, so its headings and
	// its date follow the interface language rather than the formatter's defaults.
	it('writes its headings and its date in the language it is given', () => {
		const result = formatTranscript(lines, 'markdown', new Date('2026-09-21T10:00:00Z'), {
			title: 'Transcription des sous-titres',
			origin: { microphone: 'Microphone', system: 'Audio du système' },
			original: 'Original',
			tag: 'fr-FR'
		});

		expect(result).toContain('# Transcription des sous-titres');
		expect(result).toContain('**Audio du système**');
		expect(result).toMatch(/21\/09\/2026/);
	});

	it('says the same thing in plain text', () => {
		const result = formatTranscript(lines, 'text', new Date(), {
			title: 'Transcription des sous-titres',
			origin: { microphone: 'Micro', system: 'Système' },
			original: 'Original',
			tag: 'fr-FR'
		});

		expect(result).toContain(['Micro', 'Ça fonctionne.'].join('\n'));
		expect(result).toContain(['Système', 'Les sous-titres apparaissent sous.'].join('\n'));
	});
});

describe('transcriptFilename', () => {
	it('uses a filesystem-safe local timestamp and requested extension', () => {
		const date = new Date(2026, 8, 21, 9, 7, 5);
		expect(transcriptFilename(date, 'text')).toBe('transcript-20260921-090705.txt');
		expect(transcriptFilename(date, 'markdown')).toBe('transcript-20260921-090705.md');
	});
});

describe('bilingual export', () => {
	// Newest first, as the store holds them.
	const translated: TranscriptLine[] = [
		{
			id: 2,
			origin: 'microphone',
			text: 'the colonial archive.',
			sourceText: 'l’archive coloniale.',
			startMs: 2000,
			endMs: 3000
		},
		{
			id: 1,
			origin: 'microphone',
			text: 'We begin with',
			sourceText: 'Nous commençons par',
			startMs: 0,
			endMs: 1500
		}
	];
	const at = new Date('2026-09-24T10:00:00Z');

	it('joins the original speech into its paragraph alongside the translation', () => {
		expect(groupTranscript(translated)).toEqual([
			{
				id: 1,
				origin: 'microphone',
				text: 'We begin with the colonial archive.',
				sourceText: 'Nous commençons par l’archive coloniale.',
				lane: 0
			}
		]);
		expect(hasOriginalSpeech(translated)).toBe(true);
		expect(hasOriginalSpeech(translated.map((line) => ({ ...line, sourceText: ' ' })))).toBe(false);
	});

	it('leaves every format unchanged unless asked', () => {
		for (const format of ['markdown', 'text', 'vtt', 'srt'] as const)
			expect(formatTranscript(translated, format, at)).not.toContain('Nous commençons');
	});

	it('puts the original under each paragraph in text and Markdown', () => {
		const options = { original: true };
		expect(formatTranscript(translated, 'text', at, DEFAULT_LABELS, options)).toBe(
			'Microphone\nWe begin with the colonial archive.\n' +
				'Original: Nous commençons par l’archive coloniale.\n'
		);
		expect(formatTranscript(translated, 'markdown', at, DEFAULT_LABELS, options)).toContain(
			'\n**Microphone**\n\nWe begin with the colonial archive.\n\n' +
				'> *Original:* Nous commençons par l’archive coloniale.\n'
		);
	});

	it('sets the original as each cue’s italic second line in WebVTT and SubRip', () => {
		const options = { original: true };
		const vtt = formatTranscript(translated, 'vtt', at, DEFAULT_LABELS, options);
		expect(vtt).toContain('<v Microphone>We begin with</v>\n<i>Nous commençons par</i>\n');
		const srt = formatTranscript(translated, 'srt', at, DEFAULT_LABELS, options);
		expect(srt).toContain(
			'00:00:02,000 --> 00:00:03,000\n[Microphone] the colonial archive.\n<i>l’archive coloniale.</i>\n'
		);
		// A line with no original gains no empty italic line.
		const bare = formatTranscript(
			[{ ...translated[1], sourceText: '' }],
			'srt',
			at,
			DEFAULT_LABELS,
			options
		);
		expect(bare).not.toContain('<i>');
	});

	// Whisper's translate task writes English with no transcription of what was said. Such a
	// transcript offers no bilingual export, and asked for one anyway, writes exactly what it
	// would without: no "Original:" heading over nothing.
	it('writes a translation with no original speech as if the original were not asked for', () => {
		const english = translated.map((line) => ({ ...line, sourceText: '' }));
		expect(hasOriginalSpeech(english)).toBe(false);
		for (const format of ['markdown', 'text', 'vtt', 'srt'] as const) {
			const asked = formatTranscript(english, format, at, DEFAULT_LABELS, { original: true });
			expect(asked).toBe(formatTranscript(english, format, at));
			expect(asked).not.toContain('Original');
			expect(asked).not.toContain('<i>');
		}
	});
});
