// The English catalog, and the shape every other catalog has to match.
//
// `Messages` is `typeof en`, so a locale that is missing a key, has an extra one, or types a
// message as a string where English takes parameters fails `npm run check` — the completeness
// check issue #23 asks for is the type system, with `i18n.test.ts` as a second pass for
// anything structural typing cannot see (an empty string, a key left in English).
//
// Conventions:
//
// - Parameterised messages are functions, so word order stays the translator's decision. A
//   language that puts the count last can do so; a `{0}` placeholder could not.
// - Anything with a plural takes the count and decides for itself. English needs two forms,
//   French agrees differently, and neither is the other's business.
// - Proper nouns (Gemini, OpenAI, Voxtral, WASAPI, F2) are repeated in every catalog rather
//   than pulled out, because deciding whether a product name is translated is exactly the
//   kind of thing a translator has to be able to decide.

export const en = {
	design: {
		smartSummary: 'Smart transcription removes fillers and false starts.',
		captions: 'Captions',
		reading: 'Reading',
		app: 'App',
		applies: 'Changes apply immediately.',
		clearFilters: 'Clear filters',
		newProfile: 'Save current setup…',
		rename: 'Rename',
		saveName: 'Save name',
		manageProfiles: 'Manage profiles',
		desktopOnly: 'Open the desktop app to load profiles and browse saved sessions.',
		selectSession: 'Choose a session to read or export it.',
		custom: 'Custom…',
		trayOpen: 'Open window',
		trayQuit: 'Quit',
		trayStop: 'Stop session',
		trayShow: 'Show caption overlay',
		trayHide: 'Hide caption overlay'
	},
	usability: {
		hold: 'Keep finished captions (seconds)',
		holdHint:
			'Fit window and Compact only. Stable reading keeps captions until they scroll out or the session stops.',
		pace: 'Caption updates',
		immediate: 'Immediate',
		steady: 'Steadier',
		paceHint:
			'Steadier groups partial updates every 450 ms. Completed text appears immediately. It reduces changes but cannot prevent provider corrections.',
		preview: 'Appearance preview',
		bright: 'Bright slide',
		dark: 'Dark slide',
		sample: 'Clear captions help everyone follow the conversation.',
		preset: 'Reading presets',
		standard: 'Standard',
		projector: 'Large room',
		contrast: 'High contrast',
		previewHint: 'Sample at your chosen text size; the actual overlay may have a different width.',
		geminiSmart:
			'Gemini subtitles use Smart transcription: Google removes fillers and false starts before returning the final transcript. Hide filler words is an additional local overlay filter; switching it off does not disable Google’s cleanup.',
		profiles: 'Meeting profiles',
		profileName: 'Profile name',
		saveProfile: 'Save current setup',
		loadProfile: 'Load profile',
		deleteProfile: 'Delete profile',
		confirmDelete: 'Delete permanently',
		profileHint:
			'Saves setup, appearance and overlay position on this PC, without API keys. Load while stopped; check the selected devices before starting. Applications must be selected again.',
		profileLoaded: 'Profile loaded. Check the devices and overlay position before starting.',
		profileMissing:
			'An audio device is unavailable; the Windows default is selected. Check it before starting.',
		profileSaved: 'Profile saved.',
		chooseProfile: 'Choose a profile',
		title: 'Session title',
		saveTitle: 'Save title',
		search: 'Search titles and transcript text',
		from: 'From date',
		to: 'To date',
		dateFormat: 'YYYY-MM-DD',
		chooseDate: 'Choose a date',
		invalidDate: 'Enter a valid date: YYYY-MM-DD.',
		language: 'Caption language',
		allLanguages: 'All languages',
		unknownLanguage: 'Auto-detected / unknown',
		noMatches: 'No matching sessions.',
		titleSaved: 'Session title saved.',
		shortcuts: 'Keyboard shortcuts',
		shortcutHint: 'While the operator window is focused, outside text fields and dialogs.',
		shortcutStart: 'Start / stop session',
		shortcutOverlay: 'Show / hide overlay',
		shortcutSize: 'Increase / decrease caption size',
		shortcutDirection: 'Swap the first two favourites before starting with F2',
		shortcutPause: 'Pause / resume captions',
		listening: 'Listening — no recent audio signal',
		audio: 'Receiving audio',
		captions: 'Receiving captions',
		stale:
			'Audio is arriving, but no captions have arrived for 15 seconds. Check the provider and connection.',
		connecting: 'Connecting…',
		reconnecting: 'Reconnecting…',
		paused: 'Paused — capture continues, nothing is sent',
		error: 'Source stopped with an error',
		idle: 'Source stopped',
		activity: 'Live input status',
		titleHint: 'Leave blank to use the session date.'
	},
	locale: {
		/** Name of this language, written in this language, for the language selector. */
		name: 'English',
		/** BCP 47 tag used for dates, times and number formatting. */
		tag: 'en-GB',
		label: 'Interface language',
		note: 'Changes the app, not the captions.'
	},

	app: {
		name: 'Live Translation & Subtitles'
	},

	// Key names as printed on this language's keyboards, joined with + the way Windows writes
	// a key combination.
	keys: {
		ctrl: 'Ctrl',
		shift: 'Shift',
		space: 'Space',
		o: 'O',
		up: '↑',
		down: '↓',
		p: 'P',
		f2: 'F2'
	},

	state: {
		idle: 'Idle',
		connecting: 'Connecting',
		running: 'Live',
		reconnecting: 'Reconnecting',
		paused: 'Paused',
		error: 'Error',
		/** Shown in place of "Live" while the bundled demonstration is playing. */
		demo: 'Demo'
	},

	/** Spoken by the status region on a state change. Never drawn. */
	announce: {
		idle: 'Session idle.',
		connecting: 'Connecting to the caption engine.',
		running: 'Captions are live.',
		reconnecting: 'Connection lost — reconnecting.',
		paused: 'Captions paused. Nothing is being sent to the caption engine.',
		error: 'Session error.'
	},

	mode: {
		translate: 'Translation',
		transcribe: 'Subtitles'
	},

	source: {
		microphone: 'Room mic',
		system: 'System audio',
		both: 'Both',
		/** The microphone tile and meter while the built-in demonstration is selected. */
		demo: 'Demo audio',
		/** The source chip during a rehearsal, which plays a bundled recording. */
		sample: 'Sample'
	},

	whisper: {
		cost: 'On this computer — no API charges',
		title: 'Local transcription',
		language: 'Spoken language',
		auto: 'Detect automatically',
		languageHint:
			'Transcribe in the language being spoken. Choose a language when you know it; automatic detection works across the supported languages.',
		model: 'Whisper model',
		tiny: 'Tiny — fastest',
		base: 'Base — balanced',
		small: 'Small — more accurate',
		download: 'Download model',
		remove: 'Remove model',
		cancel: 'Cancel download',
		ready: 'Model ready for offline transcription.',
		missing: 'Download a model before starting.',
		downloading: 'Downloading model…',
		privacy:
			'Audio is processed on this computer. Pending audio uses a temporary file, deleted when processing ends. No API charges.',
		hint: 'Models support 99 languages. Accuracy and processing speed vary by language and computer.',
		processing: 'Finishing the transcript…',
		pending: 'Audio waiting to be processed',
		discard: 'Discard remaining audio',
		discardConfirm:
			'Discard the remaining audio? Captions already produced will be kept, but the transcript will be incomplete.',
		/** The engine row's reason on a processor the build cannot run on; `missing` lists the
		 *  absent instruction sets, e.g. "AVX, AVX2". */
		cpuUnsupported: (missing: string) =>
			`Not available on this processor (it lacks ${missing}). The other engines still work.`,
		/** The same engine running its translate task: English captions from any of its
		 *  languages. */
		translateTitle: 'Local translation into English',
		translateLanguageHint:
			'The language Whisper translates from. Choose it when you know it; automatic detection works across the supported languages.',
		translateHint:
			'Translates speech in any of the 99 supported languages into English only. Choose Small: Tiny and Base translate poorly.'
	},
	engine: {
		whisper: 'Whisper',
		'whisper-translate': 'Whisper',
		gemini: 'Gemini',
		'gemini-transcribe': 'Gemini',
		openai: 'OpenAI',
		mistral: 'Voxtral',
		ondevice: 'Built-in demo'
	},

	language: {
		searchHint: 'Type a name or code. Use ↑/↓ to browse; Tab to pin the active language.',
		favourites: 'Favourites',
		all: 'All languages',
		noMatches: 'No matching languages.',
		second: 'Second caption language',
		secondNone: 'None',
		secondHint:
			'Captions in both languages at once. Each source runs a second translation session, so this doubles the cost.',
		pin: (language: string) => `Pin ${language}`,
		unpin: (language: string) => `Unpin ${language}`,
		unsupported: (engine: string, language: string) =>
			`${engine} does not support ${language} — choose another language.`,
		/** In place of the second-language picker, for the engine that writes English only. */
		englishOnly: 'Whisper translates into English only, so there is no second caption language.',
		/** Target-language chip when the engine detects the spoken language itself. */
		auto: 'Auto'
	},

	provider: {
		vendor: {
			whisper: 'Local Whisper',
			'whisper-translate': 'Local Whisper',
			gemini: 'Google Gemini',
			'gemini-transcribe': 'Google Gemini',
			openai: 'OpenAI',
			mistral: 'Mistral Voxtral',
			ondevice: 'Built-in demo'
		},
		/** Shown in the mono face under the vendor. Model ids are not translated; the
		 *  demonstration has no model, so it describes itself instead. */
		model: {
			whisper: 'Multilingual Whisper',
			'whisper-translate': 'Offline · into English only',
			ondevice: 'Bundled sample · deterministic'
		},
		costNote: {
			whisper:
				'Audio is processed on this computer. Pending audio uses a temporary file, deleted when processing ends. No API charges.',
			'whisper-translate':
				'Audio is processed on this computer. Pending audio uses a temporary file, deleted when processing ends. No API charges.',
			gemini:
				'Gemini: input billed on wall clock, output only while it translates — pauses and slide changes lower this.',
			'gemini-transcribe':
				'Gemini: audio in is billed on wall clock, transcript text only while someone is speaking.',
			openai:
				'OpenAI: audio in and text out are billed per minute for as long as the stream stays open.',
			mistral:
				'Voxtral: billed per minute of audio streamed, for as long as the session stays open.',
			ondevice:
				'Bundled demonstration: no live audio is captured, no service is contacted, and nothing is billed.'
		}
	},

	cost: {
		/** Appended to a published rate: "$3.06" + "/hr". */
		perHour: '/hr',
		free: 'Free',
		twoLanguages: '×2 languages',
		estimate: 'Est. cost',
		twoSources: '×2 sources'
	},

	applications: {
		recovery:
			'Capture of the selected application stopped. Select it again after it closes or restarts. Other system audio is never selected automatically.',
		mode: 'System capture',
		output: 'All audio on the selected output',
		application: 'One application',
		choose: 'Select an application',
		refresh: 'Refresh applications',
		unsupported:
			'Application capture requires Windows build 20348 or later. Choose all output audio explicitly to use that mode.',
		hint: 'Captures the selected application and its child processes, including its notifications. A browser selection may include multiple tabs.',
		missing: 'Application unavailable — select it again',
		empty: 'No accessible application windows found. Open the application and refresh.',
		reselect: 'Stop and select an application'
	},
	devices: {
		refresh: 'Refresh devices',
		refreshing: 'Refreshing devices…',
		output: 'System audio output',
		missing: 'Selected device unavailable',
		retry: 'Stop and retry session',
		fallback: 'Stop and retry with default device',
		recovery:
			'A capture device failed. Retrying ends the current session, including any source still running, and starts a new session. Your transcript is kept.',
		idleFallback:
			'A saved audio device is unavailable. The next session will use the Windows default.'
	},
	rail: {
		locked: 'Session locked',
		lockedNote: 'Stop the session to change any of these.',
		demoNote: 'A bundled demonstration is playing — no microphone or system audio is captured.',
		rehearsalNote: 'A sample recording is playing — nothing in the room is being captured.',
		chip: {
			mode: 'Mode',
			source: 'Source',
			roomReads: 'Room reads',
			engine: 'Engine'
		},
		arriving: 'Audio arriving',
		stop: 'Stop captions',
		stopping: 'Stopping…',
		pause: 'Pause',
		resume: 'Resume',
		pauseNote:
			'Paused: the caption engine is disconnected and nothing is billed. The meters keep showing the room.',

		step: {
			whatToShow: 'What to show',
			whereFrom: 'Where the audio comes from',
			engine: 'Engine',
			/** Step 03's heading, which asks a different question per mode. */
			roomReads: 'The room reads',
			demoLanguage: 'Demo language',
			spokenLanguage: 'Spoken language'
		},

		translate: {
			title: 'Live translation',
			desc: 'Speech is detected and translated into the language the room reads.'
		},
		transcribe: {
			title: 'Subtitles',
			desc: 'Transcribe speech locally with Whisper or through Voxtral or Gemini. Export as text, Markdown, SRT or VTT.'
		},

		sourceHint:
			'System audio captures apps playing through the selected output — Zoom, Teams, a browser tab, a media player.',
		demoSourceHint:
			'Uses a bundled deterministic sample. Choose Whisper, Voxtral or Gemini for live microphone or system-audio subtitles.',
		micDevice: 'Microphone device',
		systemDefault: 'System default',
		/** Appended to the name of the device Windows would pick on its own. */
		isDefault: (name: string) => `${name} (default)`,

		autoDetectHint: (engine: string) =>
			`${engine} auto-detects the spoken language and writes same-language subtitles. No translation target is needed.`,
		flipHint: 'Swap the first two favourites before starting with',
		demoLanguageHint:
			'Choose the bundled demonstration language. This mode demonstrates the overlay and export; it does not listen to the room.'
	},

	settings: {
		heading: 'Settings',
		openLabel: 'Open settings',
		closeLabel: 'Close settings',
		appearance: 'Caption appearance',
		/** Says where to look while choosing. The stand-in caption the overlay shows in
		 *  placement mode is set in whatever is chosen here, so placement is the preview. */
		appearanceNote:
			'Place the overlay to judge these on the projector — the stand-in caption is set in what you choose here.'
	},

	history: {
		stored: 'Transcript history is saved locally until you delete it.',
		heading: 'Transcript history',
		enable: 'Automatically save sessions locally',
		privacy:
			'Off by default. Saves finalized lines from now on. Turning this off keeps existing sessions; delete them here. No audio is saved.',
		retry: 'Retry saving',
		refresh: 'Refresh',
		empty: 'No saved sessions yet.',
		failed: 'Transcript history could not be updated.',
		auto: 'Auto-detected speech',
		sameLanguage: 'Same-language captions',
		unfinished: 'In progress or interrupted · duration through last save',
		unreadable: 'Unreadable session',
		delete: 'Delete',
		confirmDelete: 'Delete permanently',
		cancel: 'Cancel',
		copy: 'Copy transcript',
		copied: 'Transcript copied.',
		fullTranscript: 'Saved transcript'
	},
	overlayControls: {
		stable: 'Stable reading',
		cleanSpeech: 'Hide filler words',
		cleanSpeechHint: 'Overlay only. The transcript keeps the original text.',
		showOriginal: 'Show the original speech under translations',
		showOriginalHint:
			'A smaller line under each translated caption, for people following the speaker’s own language. Translation only; not in Stable reading.',
		fillerWords: {
			heading: 'Words to hide',
			hint: 'A listed word is hidden wherever it stands on its own, whatever it means there. Words such as “like”, “well” or “so” often carry meaning, so adding them can remove real content.',
			empty: 'The list is empty, so nothing is hidden.',
			add: 'Add a word',
			addButton: 'Add',
			remove: (word: string) => `Remove “${word}”`,
			reset: 'Reset to defaults',
			added: (word: string) => `“${word}” added.`,
			removed: (word: string) => `“${word}” removed.`,
			restored: 'Default words restored.',
			problem: {
				phrase: 'Add one word at a time. Phrases are not supported.',
				characters:
					'Use letters and numbers. Hyphens and apostrophes can only join parts of a word.',
				length: (max: number) => `A word can be at most ${max} characters long.`,
				duplicate: (word: string) => `“${word}” is already in the list.`,
				full: (max: number) => `The list holds up to ${max} words. Remove one first.`
			}
		},

		heading: 'Overlay',
		captionSize: 'Caption size',
		smaller: 'Smaller captions',
		larger: 'Larger captions',
		captionLayout: 'Caption layout',
		fitWindow: 'Fit window',
		compact: 'Compact',
		captionWidth: 'Line width',
		narrower: 'Shorter caption lines',
		wider: 'Longer caption lines',
		captionFace: 'Caption typeface',
		faceDefault: (label: string) => `${label} (default)`,
		captionColour: 'Caption colour',
		scrimColour: 'Backing colour',
		// The quick-pick colours, named for a screen reader.
		swatch: {
			white: 'White',
			paleYellow: 'Pale yellow',
			mint: 'Mint',
			paleBlue: 'Pale blue',
			charcoal: 'Charcoal',
			black: 'Black',
			green: 'Dark green',
			navy: 'Navy'
		},
		scrimOpacity: 'Backing strength',
		weakerScrim: 'Weaker backing behind the captions',
		strongerScrim: 'Stronger backing behind the captions',
		contrast: (ratio: string) => `Contrast ${ratio}:1`,
		contrastOk: 'Readable over a bright slide and a dark one.',
		contrastLow: (step: string, target: string) =>
			`${step} falls below ${target}:1 over a bright or a dark slide.`,
		contrastStep: {
			live: 'The live caption',
			final: 'A finished line',
			label: 'The speaker label',
			lead: 'The previous line trailing in'
		},
		reset: 'Reset',
		resetLabel: 'Reset the overlay to how it looks by default',
		move: 'Move overlay',
		done: 'Done',
		moveLabel: 'Move overlay',
		moveDoneLabel: 'Finish moving the overlay',
		show: 'Show overlay',
		hide: 'Hide overlay',
		showLabel: 'Show the overlay',
		hideLabel: 'Hide the overlay'
	},

	window: {
		heading: 'Window',
		minimizeToTray: 'Minimize to tray',
		keepRunning: 'Keep running in the tray when I close this window',
		keepRunningNote:
			'Off by default, so the close button quits as usual. With it on, closing leaves the session captioning and the tray icon is how you get back.',
		needsDesktop: 'Needs the desktop app — a browser preview has no tray.'
	},

	stage: {
		browserBanner: {
			before: 'Running in a browser without the Tauri runtime — controls are disabled. Launch with',
			command: 'npm run tauri dev',
			after: 'for audio capture, translation, and subtitles.'
		},
		onScreen: 'On screen now',
		newestLast: 'Newest at the bottom',
		twoSpeakers: 'Two speakers · newest at the bottom',
		origin: {
			microphone: 'Room',
			system: 'Remote',
			demo: 'Demo'
		},
		originSub: {
			microphone: 'mic',
			system: 'system',
			demo: 'sample'
		},
		waitingTranslation: 'Translated captions will appear here and on the overlay.',
		waitingSubtitles: 'Live subtitles will appear here and on the overlay.',
		waitingDemo: 'Demonstration subtitles will appear here and on the overlay.'
	},

	preflight: {
		kicker: 'Pre-flight',
		heading: 'Ready when you are',
		intro:
			'Four checks, then Start at the top of the window. Everything on the left locks while captions are running, so nothing can be changed by accident mid-session.',

		demoRow: {
			title: 'Built-in demo · no key needed',
			checking: 'Checking the bundled demonstration…',
			/** The core names the readiness state; these word it. Kept here rather than in
			 *  `ondevice/mod.rs` so the French interface does not read them in English. */
			ready:
				'Ready — bundled sample captions can demonstrate the overlay without a microphone, account, key, language pack, or network.',
			checkFailed: 'The bundled demonstration could not be checked.'
		},

		audio: {
			/** Row title: names whatever is being checked. */
			title: {
				microphone: 'Room mic',
				system: 'System audio',
				both: 'Audio',
				demo: 'Demo audio'
			},
			/** What was heard, in the past tense, once a test has confirmed it. */
			heard: {
				microphone: 'The room mic was picking up sound',
				system: 'WASAPI loopback was receiving sound',
				both: 'Both the room mic and WASAPI loopback were receiving sound',
				demo: 'Bundled sample is ready — no microphone is opened'
			},
			/** The same fact in the present tense, while the test is still running. English
			 *  used to reach this by replacing "was" with "is"; that does not survive
			 *  translation, so both tenses are written out. */
			hearing: {
				microphone: 'The room mic is picking up sound — stop the test when you are satisfied',
				system: 'WASAPI loopback is receiving sound — stop the test when you are satisfied',
				both: 'Both the room mic and WASAPI loopback are receiving sound — stop the test when you are satisfied',
				demo: 'Bundled sample is ready — no microphone is opened'
			},
			listening: 'Listening — say something into the mic or play some audio',
			unchecked: 'Not checked yet — audio is only monitored during a test or a running session',
			test: 'Test audio',
			retest: 'Re-test',
			stopTest: 'Stop test'
		},

		overlay: {
			title: 'Overlay placement',
			placed: 'Placed — captions will appear where you locked them',
			unplaced: 'Not placed yet — captions will sit bottom-centre on this display',
			place: 'Move overlay',
			adjust: 'Move overlay',
			done: 'Done',
			placeLabel: 'Move overlay',
			adjustLabel: 'Move overlay',
			doneLabel: 'Finish placing the overlay'
		},

		cost: {
			title: 'Running cost',
			billed: 'Billed per minute of streamed audio, for as long as the session is open',
			free: 'Built into the app — nothing is billed'
		},

		start: {
			translate: 'Start translating',
			subtitles: 'Start subtitles',
			demo: 'Start demo subtitles',
			starting: 'Starting…'
		},
		rehearse: {
			action: 'Rehearse',
			hint: 'Plays a bundled sample recording through the live pipeline — no microphone needed.',
			demoHint: 'Start demo subtitles already runs the bundled demonstration.'
		},
		privacy: {
			memoryOnly: 'Transcript is held in memory until you save it.',
			spooled: 'Transcript is held in memory and spooled locally until you save it.',
			demo: 'The bundled demo stays entirely inside the app.',
			cloud: (vendor: string) => `Nothing leaves the machine except audio to ${vendor}.`
		}
	},

	key: {
		title: (name: string) => `${name} key`,
		saved: 'Saved in Windows Credential Manager · read only by the Rust core',
		desc: {
			before: 'Stored in Windows Credential Manager, used only from the Rust core. Needs access to',
			after: '.'
		},
		getKey: 'Get a key',
		opensInBrowser: ' (opens in your browser)',
		placeholder: (name: string) => `Paste your ${name} API key`,
		save: 'Save',
		saving: 'Saving…',
		replace: 'Replace',
		remove: 'Remove',
		cancel: 'Cancel'
	},

	transcript: {
		heading: 'Transcript',
		jumpToLatest: 'Jump to latest',
		lines: (n: number) => (n === 1 ? '1 line' : `${n} lines`),
		unsaved: 'Unsaved',
		saved: 'Saved',
		saveAs: 'Save as…',
		format: 'Export format',
		plainText: 'Plain text',
		includeOriginal: 'Include original speech',
		noTiming: 'This recovered transcript has no timing. Save it as text or Markdown.',
		clear: 'Clear',
		confirmClear: 'Discard unsaved lines?',
		savedTo: 'Saved to',
		savedAnnouncement: (path: string) => `Transcript saved to ${path}`,
		staleBefore: 'Lines added since the save to',
		staleAfter: 'are not on disk yet.',
		longSession: (threshold: number) =>
			`This is a long session and none of it has been saved since it grew past ${threshold} lines. Nothing is being dropped, but save it now so a crash cannot take it.`,
		emptyTranslate: 'Finalized translations collect here, ready to export in your chosen format.',
		emptySubtitles: 'Finalized subtitles collect here, ready to export in your chosen format.',
		side: {
			microphone: 'Room',
			system: 'Remote'
		},
		recovery: {
			title: 'Keep a local recovery copy while captioning',
			note: 'Writes the finalized lines to this PC every few seconds so a crash or a power cut cannot take the session. Never leaves the machine, holds no audio and no API key, and is deleted as soon as you save, clear, or switch this off.',
			needsDesktop: 'Needs the desktop app — a browser preview has nowhere to write it.'
		}
	},

	// What the saved file says. Issue #23 puts the transcript's headings in the interface
	// language: an operator working in French is writing a French document, and the file is
	// the part of this app that leaves the machine.
	export: {
		title: 'Live captions transcript',
		original: 'Original',
		origin: {
			microphone: 'Microphone',
			system: 'System'
		}
	},

	prompt: {
		unsaved: {
			title: 'Save this transcript before closing?',
			sessionEnded: 'The session has been stopped and the last captions collected.',
			body: (lines: number) =>
				lines === 1
					? '1 line has not been saved. Closing without saving discards it.'
					: `${lines} lines have not been saved. Closing without saving discards them.`,
			failed: (error: string) => `Could not save: ${error}`,
			save: 'Save and close',
			saving: 'Saving…',
			discard: 'Discard and close',
			cancel: 'Cancel',
			note: 'Choose where to save the transcript. Cancel keeps the app open.'
		},
		recovery: {
			title: 'Recover the transcript from your last session?',
			body: (lines: number, savedAt: string) =>
				`The app closed with ${lines === 1 ? '1 unsaved line' : `${lines} unsaved lines`} still in the log. They were spooled locally at ${savedAt} and have not left this PC.`,
			restore: 'Restore the transcript',
			delete: 'Delete it',
			noteBefore: 'Either answer removes the spool file at',
			noteAfter:
				'. Restoring loads the lines back into the log, still unsaved, so you can save them where you want them.'
		},
		activeSession: {
			title: 'A caption session is running',
			body: (elapsed: string) =>
				`Captions have been live for ${elapsed}. Closing stops the session, waits for the last captions to arrive, and then quits.`,
			noteBefore:
				'To put the window away without stopping anything, use Minimize to tray — or turn on',
			noteEmphasis: 'Keep running in the tray when I close this window',
			noteAfter: '.',
			keep: 'Keep captioning',
			stop: 'Stop and close',
			whisperPending: (seconds: number) =>
				`Local Whisper still has ${seconds} s of audio to process. Closing gives it a few seconds, then discards the rest, so the transcript will be incomplete.`
		},
		trayHide: {
			title: 'Live Translation will keep running',
			bodyBefore:
				'You asked for closing this window to leave the app running in the tray, so it will disappear from the taskbar',
			bodyRunning: 'and keep captioning.',
			bodyIdle: 'but stay ready.',
			bodyAfter:
				'Its icon stays in the notification area, next to the clock — open it, show or hide the overlay, stop the session, or quit from there.',
			noteBefore: 'Said once. Turn it off again with',
			noteEmphasis: 'Keep running in the tray when I close this window',
			noteAfter: '.',
			hide: 'Got it — hide to the tray',
			quit: 'Quit instead'
		}
	},

	overlay: {
		placeholder: (size: number) => `Captions will sit here, two lines at ${size} px.`,
		dragToPlace: 'Drag to place',
		moveMode: 'Move mode',
		paused: 'Captions are paused on the overlay',
		keysLocks: 'locks',
		keysCancels: 'cancels',
		keysNudge: 'nudge',
		keyEnter: 'Enter',
		keyEscape: 'Esc',
		keyArrows: 'Arrows',
		size: 'Size',
		smaller: 'Smaller captions',
		larger: 'Larger captions',
		snapToBottom: 'Snap to bottom',
		lock: 'Lock into place',
		origin: {
			microphone: 'Room',
			system: 'Remote'
		}
	},

	// One sentence per failure the core can name (`src-tauri/src/errors.rs`). The technical
	// detail is appended in parentheses by `describeError`, so none of these end in a full
	// stop. Keep the ids and the keys in step: `errors.test.ts` reads the Rust file and fails
	// if a failure the core can report has no sentence here.
	error: {
		whisperModel: 'The Whisper model could not be prepared',
		whisperSession: 'Local transcription could not finish; the transcript may be incomplete',
		whisperCpu:
			'Local Whisper cannot run on this processor; choose another engine, such as the built-in demo',
		deviceEnumeration: 'Windows could not list the audio devices',
		keychain: 'Windows Credential Manager refused the request',
		demoUnavailable: 'The built-in demonstration could not be prepared',
		sessionStart: 'The session could not be started',
		sessionPause: 'The session could not be paused or resumed',
		audioTestStart: 'The audio test could not open that source',
		overlayWindow: 'The overlay window did not respond',
		operatorWindow: 'The operator window did not respond',
		transcriptWrite: 'The transcript could not be written',
		recoveryWrite: 'The recovery copy could not be written',
		recoveryRead: 'The recovery copy from your last session could not be read',
		recoveryDelete: 'The recovery copy could not be deleted',
		historyStorage: 'The history folder could not be read or changed',
		taskFailed: 'A background task stopped unexpectedly',
		micStream:
			'The microphone stopped sending audio. Check the connection in Windows Settings > System > Sound (ms-settings:sound), then retry',
		micCapture:
			'Microphone capture failed. If access is blocked, enable it under Windows Settings > Privacy & security > Microphone (ms-settings:privacy-microphone), then start again',
		systemCapture:
			'System audio capture failed. Check the selected output in Windows Settings > System > Sound (ms-settings:sound), then retry',
		providerRejected: 'The provider rejected the connection — check the API key and model access',
		providerStopped: 'The provider ended the session',
		providerReconnecting: 'The connection dropped; reconnecting'
	}
};

export type Messages = typeof en;
