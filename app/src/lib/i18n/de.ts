// The German catalog.
//
// Terminology is kept consistent with the German Windows shell, because the operator has to
// find these things on their own screen: **Infobereich** for the tray (not "Tray"),
// **Windows-Anmeldeinformationsverwaltung** for Credential Manager, and the settings paths
// under **Windows-Einstellungen**. The `ms-settings:` URIs are not translated — they are
// identifiers the operator types or clicks.
//
// **Overlay** and **Engine** are kept as they are: both are current in German software and
// both are what the Store listing will say. **Untertitel** covers captions and subtitles
// alike, **Transkript** the transcript, **Vorabprüfung** the pre-flight, **Probelauf** the
// rehearsal.
//
// The interface addresses the operator formally (Sie), which is what a tool used in front of
// a room should do.
//
// Product names are not translated (Gemini, OpenAI, Voxtral, WASAPI, Zoom, Teams, Markdown),
// and neither is the app's own name — the Store lists it in English, and inventing a German
// one would give the same app a third name.

import type { Messages } from './en';

export const de: Messages = {
	design: {
		smartSummary: 'Intelligente Transkription entfernt Füllwörter und Fehlstarts.',
		captions: 'Untertitel',
		reading: 'Lesen',
		app: 'App',
		applies: 'Änderungen werden sofort angewendet.',
		clearFilters: 'Filter zurücksetzen',
		newProfile: 'Aktuelle Einrichtung speichern…',
		rename: 'Umbenennen',
		saveName: 'Namen speichern',
		manageProfiles: 'Profile verwalten',
		desktopOnly:
			'Öffnen Sie die Desktop-App, um Profile zu laden und gespeicherte Sitzungen anzuzeigen.',
		selectSession: 'Wählen Sie eine Sitzung zum Lesen oder Exportieren.',
		custom: 'Benutzerdefiniert…',
		trayOpen: 'Fenster öffnen',
		trayQuit: 'Beenden',
		trayStop: 'Sitzung beenden',
		trayShow: 'Untertitel einblenden',
		trayHide: 'Untertitel ausblenden'
	},
	usability: {
		hold: 'Anzeigedauer fertiger Untertitel (Sekunden)',
		holdHint:
			'Nur für Fensterbreite und Kompakt. Stabiles Lesen behält Untertitel, bis sie herausrollen oder die Sitzung endet.',
		pace: 'Aktualisierung der Untertitel',
		immediate: 'Sofort',
		steady: 'Ruhiger',
		paceHint:
			'Ruhiger bündelt vorläufige Ergebnisse alle 450 ms. Fertiger Text erscheint sofort. Korrekturen des Anbieters bleiben möglich.',
		preview: 'Vorschau',
		bright: 'Helle Folie',
		dark: 'Dunkle Folie',
		sample: 'Gut lesbare Untertitel helfen allen, dem Gespräch zu folgen.',
		preset: 'Lesevoreinstellungen',
		standard: 'Standard',
		projector: 'Großer Raum',
		contrast: 'Hoher Kontrast',
		previewHint:
			'Beispiel in der gewählten Schriftgröße; das Overlay kann eine andere Breite haben.',
		geminiSmart:
			'Gemini-Untertitel verwenden Smart-Transkription: Google entfernt Füllwörter und Fehlstarts vor der endgültigen Transkription. Füllwörter ausblenden ist ein zusätzlicher lokaler Overlay-Filter; das Ausschalten deaktiviert Googles Bereinigung nicht.',
		profiles: 'Besprechungsprofile',
		profileName: 'Profilname',
		saveProfile: 'Aktuelle Einstellungen speichern',
		loadProfile: 'Profil laden',
		deleteProfile: 'Profil löschen',
		confirmDelete: 'Endgültig löschen',
		profileHint:
			'Speichert Einstellungen, Aussehen und Overlay-Position lokal, ohne API-Schlüssel. Nur bei gestoppter Sitzung laden und Geräte prüfen. Anwendungen müssen erneut ausgewählt werden.',
		profileLoaded: 'Profil geladen. Geräte und Overlay-Position vor dem Start prüfen.',
		profileMissing:
			'Ein Audiogerät fehlt; der Windows-Standard ist ausgewählt. Vor dem Start prüfen.',
		profileSaved: 'Profil gespeichert.',
		chooseProfile: 'Profil auswählen',
		title: 'Sitzungstitel',
		saveTitle: 'Titel speichern',
		search: 'Titel und Transkripte durchsuchen',
		from: 'Ab Datum',
		to: 'Bis Datum',
		dateFormat: 'JJJJ-MM-TT',
		chooseDate: 'Datum auswählen',
		invalidDate: 'Geben Sie ein gültiges Datum ein: JJJJ-MM-TT.',
		language: 'Untertitelsprache',
		allLanguages: 'Alle Sprachen',
		unknownLanguage: 'Automatisch erkannt / unbekannt',
		noMatches: 'Keine passenden Sitzungen.',
		titleSaved: 'Sitzungstitel gespeichert.',
		shortcuts: 'Tastenkombinationen',
		shortcutHint:
			'Wenn das Hauptfenster fokussiert ist, außerhalb von Eingabefeldern und Dialogen.',
		shortcutStart: 'Sitzung starten / stoppen',
		shortcutOverlay: 'Overlay ein- / ausblenden',
		shortcutSize: 'Untertitel vergrößern / verkleinern',
		shortcutDirection: 'Vor dem Start die ersten beiden Favoriten tauschen mit F2',
		shortcutPause: 'Untertitel pausieren / fortsetzen',
		listening: 'Bereit — kein aktuelles Audiosignal',
		audio: 'Audio wird empfangen',
		captions: 'Untertitel werden empfangen',
		stale:
			'Audio trifft ein, aber seit 15 Sekunden keine Untertitel. Anbieter und Verbindung prüfen.',
		connecting: 'Verbindung wird hergestellt…',
		reconnecting: 'Verbindung wird wiederhergestellt…',
		paused: 'Pausiert – die Aufnahme läuft weiter, nichts wird gesendet',
		error: 'Quelle mit Fehler gestoppt',
		idle: 'Quelle gestoppt',
		activity: 'Status der Live-Eingänge',
		titleHint: 'Leer lassen, um das Sitzungsdatum zu verwenden.'
	},
	locale: {
		/** Name of this language, written in this language, for the language selector. */
		name: 'Deutsch',
		/** BCP 47 tag used for dates, times and number formatting. */
		tag: 'de-DE',
		label: 'Sprache der Oberfläche',
		note: 'Ändert die App, nicht die Untertitel.'
	},

	app: {
		name: 'Live Translation & Subtitles'
	},

	keys: {
		ctrl: 'Strg',
		shift: 'Umschalt',
		space: 'Leertaste',
		o: 'O',
		up: '↑',
		down: '↓',
		p: 'P',
		f2: 'F2'
	},

	state: {
		idle: 'Inaktiv',
		connecting: 'Verbindet',
		running: 'Live',
		reconnecting: 'Neuverbindung',
		paused: 'Pausiert',
		error: 'Fehler',
		/** Shown in place of "Live" while the bundled demonstration is playing. */
		demo: 'Demo'
	},

	/** Spoken by the status region on a state change. Never drawn. */
	announce: {
		idle: 'Sitzung inaktiv.',
		connecting: 'Verbindung zur Untertitel-Engine wird hergestellt.',
		running: 'Untertitel sind live.',
		reconnecting: 'Verbindung verloren – Neuverbindung läuft.',
		paused: 'Untertitel pausiert. Es wird nichts an die Untertitel-Engine gesendet.',
		error: 'Sitzungsfehler.'
	},

	mode: {
		translate: 'Übersetzung',
		transcribe: 'Untertitel'
	},

	source: {
		microphone: 'Raummikrofon',
		system: 'Systemaudio',
		both: 'Beides',
		/** The microphone tile and meter while the built-in demonstration is selected. */
		demo: 'Demo-Audio',
		/** The source chip during a rehearsal, which plays a bundled recording. */
		sample: 'Beispiel'
	},

	whisper: {
		cost: 'Auf diesem Computer — keine API-Kosten',
		title: 'Lokale Transkription',
		language: 'Gesprochene Sprache',
		auto: 'Automatisch erkennen',
		languageHint:
			'In der gesprochenen Sprache transkribieren. Wählen Sie die Sprache, wenn sie bekannt ist; die automatische Erkennung umfasst die unterstützten Sprachen.',
		model: 'Whisper-Modell',
		tiny: 'Tiny — am schnellsten',
		base: 'Base — ausgewogen',
		small: 'Small — genauer',
		download: 'Modell herunterladen',
		remove: 'Modell entfernen',
		cancel: 'Download abbrechen',
		ready: 'Modell für die Offline-Transkription bereit.',
		missing: 'Laden Sie vor dem Start ein Modell herunter.',
		downloading: 'Modell wird heruntergeladen…',
		privacy:
			'Audio wird auf diesem Computer verarbeitet. Ausstehendes Audio wird vorübergehend in einer Datei gespeichert, die nach der Verarbeitung gelöscht wird. Keine API-Kosten.',
		hint: 'Die Modelle unterstützen 99 Sprachen. Genauigkeit und Geschwindigkeit hängen von Sprache und Computer ab.',
		processing: 'Transkript wird fertiggestellt…',
		pending: 'Noch zu verarbeitendes Audio',
		discard: 'Restliches Audio verwerfen',
		discardConfirm:
			'Restliches Audio verwerfen? Bereits erstellte Untertitel bleiben erhalten, das Transkript wird jedoch unvollständig.',
		cpuUnsupported: (missing: string) =>
			`Auf diesem Prozessor nicht verfügbar (es fehlt ${missing}). Die anderen Engines funktionieren.`,
		translateTitle: 'Lokale Übersetzung ins Englische',
		translateLanguageHint:
			'Die Sprache, aus der Whisper übersetzt. Wählen Sie sie, wenn sie bekannt ist; die automatische Erkennung umfasst die unterstützten Sprachen.',
		translateHint:
			'Übersetzt Sprache in jeder der 99 unterstützten Sprachen ausschließlich ins Englische. Wählen Sie Small: Tiny und Base übersetzen schlecht.'
	},
	engine: {
		whisper: 'Whisper',
		'whisper-translate': 'Whisper',
		gemini: 'Gemini',
		'gemini-transcribe': 'Gemini',
		openai: 'OpenAI',
		mistral: 'Voxtral',
		ondevice: 'Integrierte Demo'
	},

	language: {
		searchHint: 'Name oder Code eingeben. Mit ↑/↓ navigieren; mit Tab die aktive Sprache anheften.',
		favourites: 'Favoriten',
		all: 'Alle Sprachen',
		noMatches: 'Keine passenden Sprachen.',
		second: 'Zweite Untertitelsprache',
		secondNone: 'Keine',
		secondHint:
			'Untertitelt gleichzeitig in beiden Sprachen. Jede Quelle öffnet eine zweite Übersetzungssitzung – das verdoppelt die Kosten.',
		pin: (language: string) => `Anheften: ${language}`,
		unpin: (language: string) => `Lösen: ${language}`,
		unsupported: (engine: string, language: string) =>
			`${engine} unterstützt ${language} nicht — wählen Sie eine andere Sprache.`,
		englishOnly:
			'Whisper übersetzt nur ins Englische, daher gibt es keine zweite Untertitelsprache.',
		/** Target-language chip when the engine detects the spoken language itself. */
		auto: 'Auto'
	},

	provider: {
		vendor: {
			whisper: 'Lokales Whisper',
			'whisper-translate': 'Lokales Whisper',
			gemini: 'Google Gemini',
			'gemini-transcribe': 'Google Gemini',
			openai: 'OpenAI',
			mistral: 'Mistral Voxtral',
			ondevice: 'Integrierte Demo'
		},
		/** Shown in the mono face under the vendor. Model ids are not translated; the
		 *  demonstration has no model, so it describes itself instead. */
		model: {
			whisper: 'Mehrsprachiges Whisper',
			'whisper-translate': 'Offline · nur ins Englische',
			ondevice: 'Mitgeliefertes Beispiel · deterministisch'
		},
		costNote: {
			whisper:
				'Audio wird auf diesem Computer verarbeitet. Ausstehendes Audio wird vorübergehend in einer Datei gespeichert, die nach der Verarbeitung gelöscht wird. Keine API-Kosten.',
			'whisper-translate':
				'Audio wird auf diesem Computer verarbeitet. Ausstehendes Audio wird vorübergehend in einer Datei gespeichert, die nach der Verarbeitung gelöscht wird. Keine API-Kosten.',
			gemini:
				'Gemini: Die Eingabe wird nach Echtzeit abgerechnet, die Ausgabe nur während der Übersetzung – Pausen und Folienwechsel senken die Kosten.',
			'gemini-transcribe':
				'Gemini: Eingehendes Audio wird nach Echtzeit abgerechnet, Transkripttext nur, während jemand spricht.',
			openai:
				'OpenAI: Eingehendes Audio und ausgehender Text werden pro Minute abgerechnet, solange der Stream offen bleibt.',
			mistral:
				'Voxtral: Abrechnung pro Minute übertragenem Audio, solange die Sitzung offen bleibt.',
			ondevice:
				'Integrierte Demonstration: Es wird kein Live-Audio aufgenommen, kein Dienst kontaktiert und nichts abgerechnet.'
		}
	},

	cost: {
		/** Appended to a published rate: "$3.06" + "/hr". */
		perHour: '/Std.',
		free: 'Kostenlos',
		twoLanguages: '×2 Sprachen',
		estimate: 'Gesch. Kosten',
		twoSources: '×2 Quellen'
	},

	applications: {
		recovery:
			'Die Aufnahme der ausgewählten Anwendung wurde beendet. Wählen Sie sie erneut aus, sobald sie geschlossen oder neu gestartet wurde. Anderes Systemaudio wird nie automatisch ausgewählt.',
		mode: 'Systemaufnahme',
		output: 'Gesamtes Audio der ausgewählten Ausgabe',
		application: 'Eine Anwendung',
		choose: 'Anwendung auswählen',
		refresh: 'Anwendungen aktualisieren',
		unsupported:
			'Die Anwendungsaufnahme erfordert Windows-Build 20348 oder neuer. Wählen Sie ausdrücklich das gesamte Ausgabeaudio, um diesen Modus zu verwenden.',
		hint: 'Nimmt die ausgewählte Anwendung und ihre Unterprozesse auf, einschließlich ihrer Benachrichtigungen. Bei einem Browser können mehrere Tabs enthalten sein.',
		missing: 'Anwendung nicht verfügbar – erneut auswählen',
		empty:
			'Keine zugänglichen Anwendungsfenster gefunden. Öffnen Sie die Anwendung und aktualisieren Sie.',
		reselect: 'Beenden und Anwendung auswählen'
	},
	devices: {
		refresh: 'Geräte aktualisieren',
		refreshing: 'Geräte werden aktualisiert…',
		output: 'Systemaudio-Ausgabe',
		missing: 'Ausgewähltes Gerät nicht verfügbar',
		retry: 'Sitzung beenden und erneut versuchen',
		fallback: 'Beenden und mit Standardgerät erneut versuchen',
		recovery:
			'Ein Aufnahmegerät ist ausgefallen. Ein erneuter Versuch beendet die laufende Sitzung einschließlich aller noch aktiven Quellen und startet eine neue. Ihr Transkript bleibt erhalten.',
		idleFallback:
			'Ein gespeichertes Audiogerät ist nicht verfügbar. Die nächste Sitzung verwendet den Windows-Standard.'
	},
	rail: {
		locked: 'Sitzung gesperrt',
		lockedNote: 'Beenden Sie die Sitzung, um hieran etwas zu ändern.',
		demoNote:
			'Eine integrierte Demonstration läuft – es wird kein Mikrofon- oder Systemaudio aufgenommen.',
		rehearsalNote: 'Eine Beispielaufnahme läuft – im Raum wird nichts aufgenommen.',
		chip: {
			mode: 'Modus',
			source: 'Quelle',
			roomReads: 'Der Raum liest',
			engine: 'Engine'
		},
		arriving: 'Audio kommt an',
		stop: 'Untertitel beenden',
		stopping: 'Wird beendet…',
		pause: 'Pausieren',
		resume: 'Fortsetzen',
		pauseNote:
			'Pausiert: Die Untertitel-Engine ist getrennt, und es fallen keine Kosten an. Die Pegelanzeigen zeigen weiter den Raum.',

		step: {
			whatToShow: 'Was angezeigt wird',
			whereFrom: 'Woher das Audio kommt',
			engine: 'Engine',
			/** Step 03's heading, which asks a different question per mode. */
			roomReads: 'Der Raum liest',
			demoLanguage: 'Demo-Sprache',
			spokenLanguage: 'Gesprochene Sprache'
		},

		translate: {
			title: 'Live-Übersetzung',
			desc: 'Sprache wird erkannt und in die Sprache übersetzt, die der Raum liest.'
		},
		transcribe: {
			title: 'Untertitel',
			desc: 'Sprache lokal mit Whisper oder über Voxtral oder Gemini transkribieren. Export als Text, Markdown, SRT oder VTT.'
		},

		sourceHint:
			'Systemaudio nimmt Anwendungen auf, die über die ausgewählte Ausgabe laufen – Zoom, Teams, einen Browser-Tab, einen Medienplayer.',
		demoSourceHint:
			'Verwendet ein mitgeliefertes deterministisches Beispiel. Wählen Sie Whisper, Voxtral oder Gemini für Live-Untertitel von Mikrofon oder Systemaudio.',
		micDevice: 'Mikrofongerät',
		systemDefault: 'Systemstandard',
		/** Appended to the name of the device Windows would pick on its own. */
		isDefault: (name: string) => `${name} (Standard)`,

		autoDetectHint: (engine: string) =>
			`${engine} erkennt die gesprochene Sprache selbst und schreibt Untertitel in derselben Sprache. Eine Zielsprache ist nicht nötig.`,
		flipHint: 'Vor dem Start die ersten beiden Favoriten tauschen mit',
		demoLanguageHint:
			'Wählen Sie die Sprache der integrierten Demonstration. Dieser Modus führt Overlay und Export vor; er hört den Raum nicht ab.'
	},

	settings: {
		heading: 'Einstellungen',
		openLabel: 'Einstellungen öffnen',
		closeLabel: 'Einstellungen schließen',
		appearance: 'Darstellung der Untertitel',
		/** Says where to look while choosing. The stand-in caption the overlay shows in
		 *  placement mode is set in whatever is chosen here, so placement is the preview. */
		appearanceNote:
			'Platzieren Sie das Overlay, um dies auf dem Projektor zu beurteilen – der Platzhalter-Untertitel wird in dem gesetzt, was Sie hier wählen.'
	},

	history: {
		stored: 'Der Transkriptverlauf wird lokal gespeichert, bis Sie ihn löschen.',
		heading: 'Transkriptverlauf',
		enable: 'Sitzungen automatisch lokal speichern',
		privacy:
			'Standardmäßig deaktiviert. Speichert ab jetzt abgeschlossene Zeilen. Beim Deaktivieren bleiben vorhandene Sitzungen erhalten; löschen Sie diese hier. Audio wird nicht gespeichert.',
		retry: 'Speichern wiederholen',
		refresh: 'Aktualisieren',
		empty: 'Noch keine gespeicherten Sitzungen.',
		failed: 'Der Transkriptverlauf konnte nicht aktualisiert werden.',
		auto: 'Automatisch erkannte Sprache',
		sameLanguage: 'Gleichsprachige Untertitel',
		unfinished: 'Laufend oder unterbrochen · Dauer bis zur letzten Speicherung',
		unreadable: 'Unlesbare Sitzung',
		delete: 'Löschen',
		confirmDelete: 'Endgültig löschen',
		cancel: 'Abbrechen',
		copy: 'Transkript kopieren',
		copied: 'Transkript kopiert.',
		fullTranscript: 'Gespeichertes Transkript'
	},
	overlayControls: {
		stable: 'Ruhiger Lesemodus',
		cleanSpeech: 'Fülllaute ausblenden',
		cleanSpeechHint: 'Nur in der Einblendung. Das Transkript behält den Originaltext.',
		showOriginal: 'Originalwortlaut unter der Übersetzung zeigen',
		showOriginalHint:
			'Eine kleinere Zeile unter jeder übersetzten Untertitelzeile – für alle, die der Sprache der vortragenden Person folgen. Nur bei Übersetzung, nicht im ruhigen Lesemodus.',
		fillerWords: {
			heading: 'Auszublendende Wörter',
			hint: 'Ein Wort aus der Liste wird überall ausgeblendet, wo es für sich steht, unabhängig von seiner Bedeutung. Wörter wie „also“, „halt“ oder „so“ tragen oft Bedeutung; wer sie hinzufügt, kann echten Inhalt entfernen.',
			empty: 'Die Liste ist leer, daher wird nichts ausgeblendet.',
			add: 'Wort hinzufügen',
			addButton: 'Hinzufügen',
			remove: (word: string) => `„${word}“ entfernen`,
			reset: 'Standardwörter wiederherstellen',
			added: (word: string) => `„${word}“ hinzugefügt.`,
			removed: (word: string) => `„${word}“ entfernt.`,
			restored: 'Standardwörter wiederhergestellt.',
			problem: {
				phrase: 'Fügen Sie jeweils ein Wort hinzu. Wortgruppen werden nicht unterstützt.',
				characters:
					'Verwenden Sie Buchstaben und Ziffern. Bindestriche und Apostrophe dürfen nur Wortteile verbinden.',
				length: (max: number) => `Ein Wort darf höchstens ${max} Zeichen lang sein.`,
				duplicate: (word: string) => `„${word}“ steht bereits in der Liste.`,
				full: (max: number) =>
					`Die Liste fasst höchstens ${max} Wörter. Entfernen Sie zuerst eines.`
			}
		},

		heading: 'Overlay',
		captionSize: 'Untertitelgröße',
		smaller: 'Kleinere Untertitel',
		larger: 'Größere Untertitel',
		captionLayout: 'Untertitel-Layout',
		fitWindow: 'An Fenster anpassen',
		compact: 'Kompakt',
		captionWidth: 'Zeilenbreite',
		narrower: 'Kürzere Untertitelzeilen',
		wider: 'Längere Untertitelzeilen',
		captionFace: 'Untertitel-Schriftart',
		faceDefault: (label: string) => `${label} (Standard)`,
		captionColour: 'Untertitelfarbe',
		scrimColour: 'Hintergrundfarbe',
		swatch: {
			white: 'Weiß',
			paleYellow: 'Hellgelb',
			mint: 'Mint',
			paleBlue: 'Hellblau',
			charcoal: 'Anthrazit',
			black: 'Schwarz',
			green: 'Dunkelgrün',
			navy: 'Marineblau'
		},
		scrimOpacity: 'Hintergrundstärke',
		weakerScrim: 'Schwächerer Hintergrund hinter den Untertiteln',
		strongerScrim: 'Stärkerer Hintergrund hinter den Untertiteln',
		contrast: (ratio: string) => `Kontrast ${ratio}:1`,
		contrastOk: 'Lesbar über einer hellen wie über einer dunklen Folie.',
		contrastLow: (step: string, target: string) =>
			`${step} liegt über einer hellen oder einer dunklen Folie unter ${target}:1.`,
		contrastStep: {
			live: 'Der laufende Untertitel',
			final: 'Eine fertige Zeile',
			label: 'Die Sprecherkennzeichnung',
			lead: 'Die vorherige Zeile, die nachläuft'
		},
		reset: 'Zurücksetzen',
		resetLabel: 'Overlay auf das Standardaussehen zurücksetzen',
		move: 'Untertitel verschieben',
		done: 'Fertig',
		moveLabel: 'Untertitel verschieben',
		moveDoneLabel: 'Verschieben des Overlays beenden',
		show: 'Untertitel einblenden',
		hide: 'Untertitel ausblenden',
		showLabel: 'Overlay einblenden',
		hideLabel: 'Overlay ausblenden'
	},

	window: {
		heading: 'Fenster',
		minimizeToTray: 'In den Infobereich minimieren',
		keepRunning: 'Im Infobereich weiterlaufen lassen, wenn ich dieses Fenster schließe',
		keepRunningNote:
			'Standardmäßig aus, sodass die Schaltfläche zum Schließen wie gewohnt beendet. Ist die Option an, untertitelt die Sitzung nach dem Schließen weiter, und das Symbol im Infobereich ist der Weg zurück.',
		needsDesktop: 'Erfordert die Desktop-App – eine Browser-Vorschau hat keinen Infobereich.'
	},

	stage: {
		browserBanner: {
			before:
				'Läuft im Browser ohne die Tauri-Laufzeit – die Bedienelemente sind deaktiviert. Starten Sie mit',
			command: 'npm run tauri dev',
			after: 'für Audioaufnahme, Übersetzung und Untertitel.'
		},
		onScreen: 'Jetzt auf dem Bildschirm',
		newestLast: 'Neueste unten',
		twoSpeakers: 'Zwei Sprechende · neueste unten',
		origin: {
			microphone: 'Raum',
			system: 'Remote',
			demo: 'Demo'
		},
		originSub: {
			microphone: 'Mikrofon',
			system: 'System',
			demo: 'Beispiel'
		},
		waitingTranslation: 'Übersetzte Untertitel erscheinen hier und im Overlay.',
		waitingSubtitles: 'Live-Untertitel erscheinen hier und im Overlay.',
		waitingDemo: 'Demonstrations-Untertitel erscheinen hier und im Overlay.'
	},

	preflight: {
		kicker: 'Vorabprüfung',
		heading: 'Bereit, wenn Sie es sind',
		intro:
			'Vier Prüfungen, dann die Start-Schaltfläche oben im Fenster. Alles auf der linken Seite wird gesperrt, während Untertitel laufen, damit mitten in der Sitzung nichts versehentlich geändert wird.',

		demoRow: {
			title: 'Integrierte Demo · kein Schlüssel nötig',
			checking: 'Die integrierte Demonstration wird geprüft…',
			/** The core names the readiness state; these word it. Kept here rather than in
			 *  `ondevice/mod.rs` so the German interface does not read them in English. */
			ready:
				'Bereit – mitgelieferte Beispiel-Untertitel können das Overlay ohne Mikrofon, Konto, Schlüssel, Sprachpaket oder Netzwerk vorführen.',
			checkFailed: 'Die integrierte Demonstration konnte nicht geprüft werden.'
		},

		audio: {
			/** Row title: names whatever is being checked. */
			title: {
				microphone: 'Raummikrofon',
				system: 'Systemaudio',
				both: 'Audio',
				demo: 'Demo-Audio'
			},
			/** What was heard, in the past tense, once a test has confirmed it. */
			heard: {
				microphone: 'Das Raummikrofon hat Ton aufgenommen',
				system: 'Der WASAPI-Loopback hat Ton empfangen',
				both: 'Sowohl das Raummikrofon als auch der WASAPI-Loopback haben Ton empfangen',
				demo: 'Mitgeliefertes Beispiel ist bereit – es wird kein Mikrofon geöffnet'
			},
			/** The same fact in the present tense, while the test is still running. English
			 *  used to reach this by replacing "was" with "is"; that does not survive
			 *  translation, so both tenses are written out. */
			hearing: {
				microphone:
					'Das Raummikrofon nimmt Ton auf – beenden Sie den Test, wenn Sie zufrieden sind',
				system: 'Der WASAPI-Loopback empfängt Ton – beenden Sie den Test, wenn Sie zufrieden sind',
				both: 'Sowohl das Raummikrofon als auch der WASAPI-Loopback empfangen Ton – beenden Sie den Test, wenn Sie zufrieden sind',
				demo: 'Mitgeliefertes Beispiel ist bereit – es wird kein Mikrofon geöffnet'
			},
			listening: 'Es wird zugehört – sprechen Sie ins Mikrofon oder spielen Sie Audio ab',
			unchecked:
				'Noch nicht geprüft – Audio wird nur während eines Tests oder einer laufenden Sitzung überwacht',
			test: 'Audio testen',
			retest: 'Erneut testen',
			stopTest: 'Test beenden'
		},

		overlay: {
			title: 'Overlay-Platzierung',
			placed: 'Platziert – Untertitel erscheinen dort, wo Sie sie verankert haben',
			unplaced: 'Noch nicht platziert – Untertitel sitzen unten mittig auf diesem Bildschirm',
			place: 'Untertitel verschieben',
			adjust: 'Untertitel verschieben',
			done: 'Fertig',
			placeLabel: 'Untertitel verschieben',
			adjustLabel: 'Untertitel verschieben',
			doneLabel: 'Platzieren des Overlays beenden'
		},

		cost: {
			title: 'Laufende Kosten',
			billed: 'Abrechnung pro Minute übertragenem Audio, solange die Sitzung offen ist',
			free: 'In der App enthalten – es wird nichts abgerechnet'
		},

		start: {
			translate: 'Übersetzung starten',
			subtitles: 'Untertitel starten',
			demo: 'Demo-Untertitel starten',
			starting: 'Wird gestartet…'
		},
		rehearse: {
			action: 'Probelauf',
			hint: 'Spielt eine mitgelieferte Beispielaufnahme durch die Live-Pipeline – kein Mikrofon nötig.',
			demoHint: 'Demo-Untertitel starten führt die integrierte Demonstration bereits aus.'
		},
		privacy: {
			memoryOnly: 'Das Transkript bleibt im Arbeitsspeicher, bis Sie es speichern.',
			spooled:
				'Das Transkript bleibt im Arbeitsspeicher und wird lokal zwischengespeichert, bis Sie es speichern.',
			demo: 'Die integrierte Demo bleibt vollständig in der App.',
			cloud: (vendor: string) => `Außer Audio an ${vendor} verlässt nichts den Rechner.`
		}
	},

	key: {
		title: (name: string) => `${name}-Schlüssel`,
		saved: 'In der Windows-Anmeldeinformationsverwaltung gespeichert · nur vom Rust-Kern gelesen',
		desc: {
			before:
				'In der Windows-Anmeldeinformationsverwaltung gespeichert, nur vom Rust-Kern verwendet. Benötigt Zugriff auf',
			after: '.'
		},
		getKey: 'Schlüssel holen',
		opensInBrowser: ' (öffnet sich im Browser)',
		placeholder: (name: string) => `${name}-API-Schlüssel einfügen`,
		save: 'Speichern',
		saving: 'Wird gespeichert…',
		replace: 'Ersetzen',
		remove: 'Entfernen',
		cancel: 'Abbrechen'
	},

	transcript: {
		heading: 'Transkript',
		jumpToLatest: 'Zum Neuesten springen',
		lines: (n: number) => (n === 1 ? '1 Zeile' : `${n} Zeilen`),
		unsaved: 'Nicht gespeichert',
		saved: 'Gespeichert',
		saveAs: 'Speichern unter…',
		format: 'Exportformat',
		plainText: 'Reiner Text',
		includeOriginal: 'Originalwortlaut einschließen',
		noTiming:
			'Dieses wiederhergestellte Transkript hat keine Zeitangaben. Speichern Sie es als Text oder Markdown.',
		clear: 'Leeren',
		confirmClear: 'Nicht gespeicherte Zeilen verwerfen?',
		savedTo: 'Gespeichert unter',
		savedAnnouncement: (path: string) => `Transkript gespeichert unter ${path}`,
		staleBefore: 'Zeilen, die seit dem Speichern unter',
		staleAfter: 'hinzugekommen sind, liegen noch nicht auf der Festplatte.',
		longSession: (threshold: number) =>
			`Dies ist eine lange Sitzung, und seit sie über ${threshold} Zeilen hinausgewachsen ist, wurde nichts davon gespeichert. Es geht nichts verloren, aber speichern Sie jetzt, damit ein Absturz sie nicht mitnehmen kann.`,
		emptyTranslate:
			'Fertige Übersetzungen sammeln sich hier und können im gewählten Format exportiert werden.',
		emptySubtitles:
			'Fertige Untertitel sammeln sich hier und können im gewählten Format exportiert werden.',
		side: {
			microphone: 'Raum',
			system: 'Remote'
		},
		recovery: {
			title: 'Während des Untertitelns eine lokale Wiederherstellungskopie behalten',
			note: 'Schreibt die fertigen Zeilen alle paar Sekunden auf diesen PC, damit ein Absturz oder ein Stromausfall die Sitzung nicht mitnimmt. Verlässt nie den Rechner, enthält weder Audio noch API-Schlüssel und wird gelöscht, sobald Sie speichern, leeren oder dies ausschalten.',
			needsDesktop: 'Erfordert die Desktop-App – eine Browser-Vorschau hat keinen Ort dafür.'
		}
	},

	// What the saved file says. Issue #23 puts the transcript's headings in the interface
	// language: an operator working in German is writing a German document, and the file is
	// the part of this app that leaves the machine.
	export: {
		title: 'Transkript der Live-Untertitel',
		original: 'Original',
		origin: {
			microphone: 'Mikrofon',
			system: 'System'
		}
	},

	prompt: {
		unsaved: {
			title: 'Dieses Transkript vor dem Schließen speichern?',
			sessionEnded: 'Die Sitzung wurde beendet und die letzten Untertitel wurden erfasst.',
			body: (lines: number) =>
				lines === 1
					? '1 Zeile wurde nicht gespeichert. Schließen ohne Speichern verwirft sie.'
					: `${lines} Zeilen wurden nicht gespeichert. Schließen ohne Speichern verwirft sie.`,
			failed: (error: string) => `Speichern nicht möglich: ${error}`,
			save: 'Speichern und schließen',
			saving: 'Wird gespeichert…',
			discard: 'Verwerfen und schließen',
			cancel: 'Abbrechen',
			note: 'Wählen Sie, wo das Transkript gespeichert werden soll. Abbrechen lässt die App geöffnet.'
		},
		recovery: {
			title: 'Transkript der letzten Sitzung wiederherstellen?',
			body: (lines: number, savedAt: string) =>
				`Die App wurde mit ${lines === 1 ? '1 nicht gespeicherten Zeile' : `${lines} nicht gespeicherten Zeilen`} im Protokoll geschlossen. Sie wurden um ${savedAt} lokal zwischengespeichert und haben diesen PC nicht verlassen.`,
			restore: 'Transkript wiederherstellen',
			delete: 'Löschen',
			noteBefore: 'Beide Antworten entfernen die Zwischenspeicherdatei unter',
			noteAfter:
				'. Beim Wiederherstellen werden die Zeilen wieder ins Protokoll geladen, weiterhin ungespeichert, sodass Sie sie dort ablegen können, wo Sie sie haben möchten.'
		},
		activeSession: {
			title: 'Eine Untertitelsitzung läuft',
			body: (elapsed: string) =>
				`Untertitel laufen seit ${elapsed} live. Beim Schließen wird die Sitzung beendet, auf die letzten Untertitel gewartet und die App danach geschlossen.`,
			noteBefore:
				'Um das Fenster wegzulegen, ohne etwas zu beenden, verwenden Sie In den Infobereich minimieren – oder aktivieren Sie',
			noteEmphasis: 'Im Infobereich weiterlaufen lassen, wenn ich dieses Fenster schließe',
			noteAfter: '.',
			keep: 'Weiter untertiteln',
			stop: 'Beenden und schließen',
			whisperPending: (seconds: number) =>
				`Lokales Whisper muss noch ${seconds} s Audio verarbeiten. Beim Schließen bekommt es dafür einige Sekunden, danach wird der Rest verworfen und das Transkript bleibt unvollständig.`
		},
		trayHide: {
			title: 'Live Translation läuft weiter',
			bodyBefore:
				'Sie haben festgelegt, dass die App beim Schließen dieses Fensters im Infobereich weiterläuft, also verschwindet sie aus der Taskleiste',
			bodyRunning: 'und untertitelt weiter.',
			bodyIdle: 'bleibt aber bereit.',
			bodyAfter:
				'Ihr Symbol bleibt im Infobereich neben der Uhr – von dort öffnen Sie die App, blenden das Overlay ein oder aus, beenden die Sitzung oder schließen die App.',
			noteBefore: 'Wird einmal gesagt. Wieder ausschalten mit',
			noteEmphasis: 'Im Infobereich weiterlaufen lassen, wenn ich dieses Fenster schließe',
			noteAfter: '.',
			hide: 'Verstanden – in den Infobereich',
			quit: 'Stattdessen beenden'
		}
	},

	overlay: {
		placeholder: (size: number) => `Untertitel sitzen hier, zwei Zeilen mit ${size} px.`,
		dragToPlace: 'Zum Platzieren ziehen',
		moveMode: 'Verschiebemodus',
		paused: 'Untertitel sind im Overlay pausiert',
		keysLocks: 'verankert',
		keysCancels: 'bricht ab',
		keysNudge: 'verschieben',
		keyEnter: 'Eingabe',
		keyEscape: 'Esc',
		keyArrows: 'Pfeiltasten',
		size: 'Größe',
		smaller: 'Kleinere Untertitel',
		larger: 'Größere Untertitel',
		snapToBottom: 'Unten ausrichten',
		lock: 'An Position verankern',
		origin: {
			microphone: 'Raum',
			system: 'Remote'
		}
	},

	// One sentence per failure the core can name (`src-tauri/src/errors.rs`). The technical
	// detail is appended in parentheses by `describeError`, so none of these end in a full
	// stop. Keep the ids and the keys in step: `errors.test.ts` reads the Rust file and fails
	// if a failure the core can report has no sentence here.
	error: {
		whisperModel: 'Das Whisper-Modell konnte nicht vorbereitet werden',
		whisperCpu:
			'Lokales Whisper kann auf diesem Prozessor nicht laufen; wählen Sie eine andere Engine, etwa die integrierte Demo',
		whisperSession:
			'Die lokale Transkription konnte nicht abgeschlossen werden; das Transkript ist möglicherweise unvollständig',
		deviceEnumeration: 'Windows konnte die Audiogeräte nicht auflisten',
		keychain: 'Die Windows-Anmeldeinformationsverwaltung hat die Anfrage abgelehnt',
		demoUnavailable: 'Die integrierte Demonstration konnte nicht vorbereitet werden',
		sessionStart: 'Die Sitzung konnte nicht gestartet werden',
		sessionPause: 'Die Sitzung konnte nicht pausiert oder fortgesetzt werden',
		audioTestStart: 'Der Audiotest konnte diese Quelle nicht öffnen',
		overlayWindow: 'Das Overlay-Fenster hat nicht reagiert',
		operatorWindow: 'Das Hauptfenster hat nicht reagiert',
		transcriptWrite: 'Das Transkript konnte nicht geschrieben werden',
		recoveryWrite: 'Die Wiederherstellungskopie konnte nicht geschrieben werden',
		recoveryRead: 'Die Wiederherstellungskopie der letzten Sitzung konnte nicht gelesen werden',
		recoveryDelete: 'Die Wiederherstellungskopie konnte nicht gelöscht werden',
		historyStorage: 'Der Verlaufsordner konnte nicht gelesen oder geändert werden',
		taskFailed: 'Eine Hintergrundaufgabe wurde unerwartet beendet',
		micStream:
			'Das Mikrofon sendet kein Audio mehr. Prüfen Sie die Verbindung unter Windows-Einstellungen > System > Sound (ms-settings:sound) und versuchen Sie es erneut',
		micCapture:
			'Die Mikrofonaufnahme ist fehlgeschlagen. Falls der Zugriff blockiert ist, aktivieren Sie ihn unter Windows-Einstellungen > Datenschutz und Sicherheit > Mikrofon (ms-settings:privacy-microphone) und starten Sie erneut',
		systemCapture:
			'Die Aufnahme des Systemaudios ist fehlgeschlagen. Prüfen Sie die ausgewählte Ausgabe unter Windows-Einstellungen > System > Sound (ms-settings:sound) und versuchen Sie es erneut',
		providerRejected:
			'Der Anbieter hat die Verbindung abgelehnt – prüfen Sie den API-Schlüssel und den Modellzugriff',
		providerStopped: 'Der Anbieter hat die Sitzung beendet',
		providerReconnecting: 'Die Verbindung wurde unterbrochen; Neuverbindung läuft'
	}
};
