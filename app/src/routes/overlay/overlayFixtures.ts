// Content for previewing the overlay in a browser, where there is no core to send captions.
// Labelled preview text for layout and font checks — never evidence of live-provider behaviour.

import { isTargetLanguage } from '#lib/languages.js';
import type { Caption, TargetLanguage, Track } from '#lib/types.js';

const REMOTE_EARLIER =
	'Bienvenue à cette démonstration des sous-titres. Pendant une réunion, les phrases récentes restent disponibles pour suivre la discussion. Agrandissez la fenêtre pour afficher davantage de contexte, ou réduisez-la pour ne garder que les mots les plus récents. La taille des caractères reste celle que vous avez choisie.';

const ROOM: Caption = {
	turnId: 1,
	text: 'This is the room microphone. Its captions remain separate from the remote speaker above. Resize the overlay to see more of this conversation while keeping the newest words visible. Both speakers share the available height, and their labels identify where the audio comes from.',
	sourceText: '',
	final: true,
	origin: 'microphone',
	startMs: 0,
	endMs: 0
};

/** Font-fallback and right-to-left samples, chosen with `?language=` in the preview URL. */
const SAMPLES: Partial<Record<TargetLanguage, string>> = {
	ja: '字幕の表示テストです。会議の参加者が会話を理解できるように、日本語の文字と句読点を確認します。',
	ar: 'هذه معاينة لاختبار عرض الترجمة العربية. نتحقق من وضوح الحروف واتجاه النص من اليمين إلى اليسار، مع الأرقام 123.',
	he: 'זוהי תצוגה מקדימה לבדיקת כתוביות בעברית וכיוון הטקסט מימין לשמאל.',
	fa: 'این پیش‌نمایش برای بررسی نمایش زیرنویس فارسی و جهت متن از راست به چپ است.',
	ur: 'یہ اردو ذیلی عنوانات اور دائیں سے بائیں متن کی سمت جانچنے کا پیش منظر ہے۔'
};

export interface PreviewContent {
	current: Partial<Record<Track, Caption>>;
	previous: Partial<Record<Track, string>>;
	history: Partial<Record<Track, string>>;
	/** The caption language, when a language sample was asked for. */
	language?: TargetLanguage;
	/** The second caption language, for the two-language sample. */
	secondLanguage?: TargetLanguage;
}

/** One speaker captioned in two languages at once: `?language=bilingual`. */
function bilingualPreview(): PreviewContent {
	const turn = { turnId: 1, final: false, origin: 'microphone' as const, startMs: 0, endMs: 0 };
	return {
		current: {
			microphone: {
				...turn,
				text: 'Les sous-titres paraissent dans les deux langues de la salle en même temps.',
				sourceText: 'Captions appear in both of the room’s languages at the same time.'
			},
			'microphone:1': {
				...turn,
				lane: 1,
				text: 'Captions appear in both of the room’s languages at the same time.',
				sourceText: 'Captions appear in both of the room’s languages at the same time.'
			}
		},
		previous: {},
		history: {},
		language: 'fr',
		secondLanguage: 'en'
	};
}

/** Both origins visible (so the labels show), one finalized line and one live turn carrying a
 *  lead-in — or, when `language` names a sample, that sample alone. */
export function previewContent(language: string | null): PreviewContent {
	if (language === 'bilingual') return bilingualPreview();
	if (isTargetLanguage(language) && SAMPLES[language]) {
		return {
			current: { microphone: { ...ROOM, text: SAMPLES[language] } },
			previous: {},
			history: {},
			language
		};
	}
	return {
		current: {
			system: {
				turnId: 1,
				text: 'Les sous-titres utilisent la largeur disponible et le texte revient à la ligne lorsque la fenêtre devient plus étroite.',
				// Shown under the caption when Show the original speech is on.
				sourceText:
					'Captions use the available width, and the text wraps to a new line when the window becomes narrower.',
				final: false,
				origin: 'system',
				startMs: 0,
				endMs: 0
			},
			microphone: ROOM
		},
		previous: { system: REMOTE_EARLIER },
		history: { system: REMOTE_EARLIER }
	};
}
