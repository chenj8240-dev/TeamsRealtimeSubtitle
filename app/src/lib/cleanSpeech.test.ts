import { get } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	addFillerWord,
	createFillerFilter,
	DEFAULT_FILLER_WORDS,
	FILLER_WORDS_KEY,
	isDefaultFillerWords,
	loadFillerWords,
	MAX_FILLER_WORD_LENGTH,
	MAX_FILLER_WORDS,
	normalizeFillerWords,
	removeFillerWord,
	saveFillerWords
} from './cleanSpeech';
import { persistedWith } from './persisted';

/** The built-in list's filter. */
const cleanSpeech = createFillerFilter(DEFAULT_FILLER_WORDS);

describe('display-only conservative hesitation cleanup', () => {
	it('cleans the requested sentence and its punctuation', () => {
		expect(cleanSpeech('Um, we need to, uh, validate the configuration before Monday.')).toBe(
			'We need to validate the configuration before Monday.'
		);
		expect(cleanSpeech('Euh, nous devons, heu, valider.')).toBe('Nous devons valider.');
		expect(cleanSpeech('um, uh, erm, hmm.')).toBe('');
	});
	it('preserves meaningful words, abbreviations, substrings and quotations', () => {
		const text =
			'So, well, I like the umbrella, human rhythm and HMM. “um” means hesitation; uh-oh!';
		expect(cleanSpeech(text)).toBe(text);
		expect(cleanSpeech('So, um, I think we should, uh, probably validate this.')).toBe(
			'So I think we should probably validate this.'
		);
		expect(cleanSpeech('ähm umami euhorie')).toBe('ähm umami euhorie');
	});
	it('waits for a token boundary in partial captions', () => {
		expect(cleanSpeech('Take the um', false)).toBe('Take the um');
		expect(cleanSpeech('Take the umbrella', false)).toBe('Take the umbrella');
		expect(cleanSpeech('Take, um, the umbrella', false)).toBe('Take the umbrella');
	});
	it('does not mutate the raw caption', () => {
		const caption = { text: 'Um, hello.', sourceText: 'Euh, bonjour.' };
		expect(cleanSpeech(caption.text)).toBe('Hello.');
		expect(caption).toEqual({ text: 'Um, hello.', sourceText: 'Euh, bonjour.' });
	});
});

describe('a custom filler list', () => {
	it('removes exactly the listed words, and nothing when the list is empty', () => {
		const clean = createFillerFilter(['bah', 'ben']);
		expect(clean('Bah, on verra, ben, demain.')).toBe('On verra demain.');
		expect(clean('Um, we start.')).toBe('Um, we start.');
		const none = createFillerFilter([]);
		expect(none('Um, uh, erm.')).toBe('Um, uh, erm.');
	});

	it('matches whole words in any script, ignoring case but never inside a longer word', () => {
		const clean = createFillerFilter(['ähm', 'ээ', 'eh', 'يعني']);
		expect(clean('Ähm, wir müssen, ähm, prüfen.')).toBe('Wir müssen prüfen.');
		expect(clean('Мы, ээ, начнём.')).toBe('Мы начнём.');
		expect(clean('هذا، يعني، مهم')).toBe('هذا مهم');
		// A neighbouring letter outside ASCII still makes a longer word: no ASCII `\b` here.
		expect(clean('ehé éeh ähmlich Kähm')).toBe('ehé éeh ähmlich Kähm');
	});

	it('keeps all-capital abbreviations only in scripts that have capitals', () => {
		const clean = createFillerFilter(['ээ', 'يعني']);
		expect(clean('Это ЭЭ.')).toBe('Это ЭЭ.');
		// Arabic has no case, so a listed word is never mistaken for an abbreviation.
		expect(clean('يعني، مهم')).toBe('مهم');
	});

	it('leaves the provider’s own spacing and punctuation alone', () => {
		expect(cleanSpeech('Euh, vous êtes prêts ?')).toBe('Vous êtes prêts ?');
		expect(cleanSpeech('Vous êtes prêts, euh ?')).toBe('Vous êtes prêts ?');
		expect(cleanSpeech('C’est, euh, compliqué !')).toBe('C’est compliqué !');
		expect(cleanSpeech('The value is um 42.')).toBe('The value is 42.');
		expect(cleanSpeech('Take,um,the umbrella.')).toBe('Take the umbrella.');
		expect(cleanSpeech('And then um.')).toBe('And then.');
	});

	it('treats an ellipsis as the end of a word, and drops it with a leading one', () => {
		expect(cleanSpeech('Euh… je pense que oui.')).toBe('Je pense que oui.');
		expect(cleanSpeech('Je pense, euh… que oui.')).toBe('Je pense… que oui.');
	});

	it('capitalizes the next word only when the removed opening word was capitalized', () => {
		expect(cleanSpeech('Um, we start.')).toBe('We start.');
		// A turn can begin mid-sentence; a lowercase opening stays lowercase.
		expect(cleanSpeech('um, and then we start.')).toBe('and then we start.');
	});

	it('keeps quoted words, including French spaced guillemets', () => {
		const text = 'Il a dit « euh » deux fois, et “um” une fois, et «heu».';
		expect(cleanSpeech(text)).toBe(text);
	});

	it('matches hyphenated and apostrophe words whole, with either apostrophe or hyphen', () => {
		const clean = createFillerFilter(['mm-hmm', "y'know"]);
		expect(clean('Mm-hmm, yes.')).toBe('Yes.');
		expect(clean('It is, y’know, fine; mm‑hmm.')).toBe('It is fine.');
		// A listed part of a compound does not reach into the compound.
		expect(createFillerFilter(['uh'])('Uh-huh, uh-oh.')).toBe('Uh-huh, uh-oh.');
	});

	it('updates a streaming caption as its last word completes', () => {
		const clean = createFillerFilter(['bah']);
		expect(clean('Nous allons, bah', false)).toBe('Nous allons, bah');
		expect(clean('Nous allons, bah,', false)).toBe('Nous allons');
		expect(clean('Nous allons, bah, voir', false)).toBe('Nous allons voir');
		expect(clean('Nous allons, bahut', false)).toBe('Nous allons, bahut');
		expect(clean('Nous allons, bah')).toBe('Nous allons');
	});

	it('escapes whatever it is given, so a word is never a pattern', () => {
		expect(createFillerFilter(['a.c'])('abc a.c.')).toBe('abc.');
	});
});

describe('editing the list', () => {
	it('trims, composes and rejects what cannot be matched as one word', () => {
		expect(addFillerWord([], '  bah  ')).toEqual({ list: ['bah'], word: 'bah' });
		expect(addFillerWord([], 'éh')).toEqual({ list: ['éh'], word: 'éh' });
		expect(addFillerWord([], '   ')).toEqual({ problem: 'blank' });
		expect(addFillerWord([], 'you know')).toEqual({ problem: 'phrase' });
		expect(addFillerWord([], '“um”')).toEqual({ problem: 'characters' });
		expect(addFillerWord([], 'um,')).toEqual({ problem: 'characters' });
		expect(addFillerWord([], '-um')).toEqual({ problem: 'characters' });
		expect(addFillerWord([], 'x'.repeat(MAX_FILLER_WORD_LENGTH + 1))).toEqual({
			problem: 'length'
		});
		expect(addFillerWord([], 'mm-hmm')).toEqual({ list: ['mm-hmm'], word: 'mm-hmm' });
		// Persian joins parts of a word with a zero-width non-joiner.
		expect(addFillerWord([], 'می‌گم')).toMatchObject({ word: 'می‌گم' });
	});

	it('rejects a duplicate whatever its case, and a word past the limit', () => {
		expect(addFillerWord(['um'], 'UM')).toEqual({ problem: 'duplicate' });
		const full = Array.from({ length: MAX_FILLER_WORDS }, (_, i) => `w${i}`);
		expect(addFillerWord(full, 'more')).toEqual({ problem: 'full' });
	});

	it('removes a word whatever its case, and leaves the rest in order', () => {
		expect(removeFillerWord(['um', 'Bah', 'uh'], 'bah')).toEqual(['um', 'uh']);
	});

	it('normalizes anything: bad entries go, duplicates collapse, order stays', () => {
		expect(normalizeFillerWords([' bah ', 7, 'BAH', '', 'you know', null, 'ben'])).toEqual([
			'bah',
			'ben'
		]);
		expect(normalizeFillerWords([])).toEqual([]);
	});

	it('knows the built-in list in any order and case', () => {
		expect(isDefaultFillerWords([...DEFAULT_FILLER_WORDS].reverse())).toBe(true);
		expect(isDefaultFillerWords(DEFAULT_FILLER_WORDS.map((w) => w.toUpperCase()))).toBe(true);
		expect(isDefaultFillerWords(DEFAULT_FILLER_WORDS.slice(1))).toBe(false);
		expect(isDefaultFillerWords([...DEFAULT_FILLER_WORDS.slice(1), 'bah'])).toBe(false);
	});
});

describe('the stored list', () => {
	function memoryStorage(initial: Record<string, string> = {}) {
		const values = new Map(Object.entries(initial));
		const storage = {
			values,
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => void values.set(key, value),
			removeItem: (key: string) => void values.delete(key)
		};
		vi.stubGlobal('localStorage', storage);
		return storage;
	}

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('starts existing users on the built-in list and stores nothing for it', () => {
		const storage = memoryStorage();
		const words = persistedWith(loadFillerWords, saveFillerWords);
		expect(get(words)).toEqual(DEFAULT_FILLER_WORDS);
		expect(storage.values.has(FILLER_WORDS_KEY)).toBe(false);
	});

	it('keeps a customized list across a restart', () => {
		const storage = memoryStorage();
		persistedWith(loadFillerWords, saveFillerWords).set(['um', 'bah']);
		expect(storage.values.get(FILLER_WORDS_KEY)).toBe('["um","bah"]');
		expect(get(persistedWith(loadFillerWords, saveFillerWords))).toEqual(['um', 'bah']);
	});

	it('keeps an intentionally empty list empty, and it removes nothing', () => {
		const storage = memoryStorage();
		persistedWith(loadFillerWords, saveFillerWords).set([]);
		expect(storage.values.get(FILLER_WORDS_KEY)).toBe('[]');
		const restarted = get(persistedWith(loadFillerWords, saveFillerWords));
		expect(restarted).toEqual([]);
		expect(createFillerFilter(restarted)('Um, uh, hello.')).toBe('Um, uh, hello.');
	});

	it('forgets a list reset to the defaults, so later defaults still reach it', () => {
		const storage = memoryStorage({ [FILLER_WORDS_KEY]: '["bah"]' });
		const words = persistedWith(loadFillerWords, saveFillerWords);
		expect(get(words)).toEqual(['bah']);
		words.set([...DEFAULT_FILLER_WORDS]);
		expect(storage.values.has(FILLER_WORDS_KEY)).toBe(false);
	});

	it('repairs what another build or a hand edit left behind', () => {
		const storage = memoryStorage({ [FILLER_WORDS_KEY]: '["bah"," bah ","two words",3]' });
		expect(get(persistedWith(loadFillerWords, saveFillerWords))).toEqual(['bah']);
		expect(storage.values.get(FILLER_WORDS_KEY)).toBe('["bah"]');
		memoryStorage({ [FILLER_WORDS_KEY]: '{"not":"a list"}' });
		expect(loadFillerWords()).toEqual(DEFAULT_FILLER_WORDS);
		memoryStorage({ [FILLER_WORDS_KEY]: 'not json' });
		expect(loadFillerWords()).toEqual(DEFAULT_FILLER_WORDS);
	});

	it('still works when storage refuses', () => {
		vi.stubGlobal('localStorage', {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			},
			removeItem: () => {
				throw new Error('blocked');
			}
		});
		const words = persistedWith(loadFillerWords, saveFillerWords);
		expect(get(words)).toEqual(DEFAULT_FILLER_WORDS);
		words.set(['bah']);
		expect(get(words)).toEqual(['bah']);
	});
});
