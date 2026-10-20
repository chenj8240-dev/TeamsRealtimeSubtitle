// The French catalog.
//
// The wording follows the French Store copy in `docs/store-listing.md`, which was written
// first and is what a French-speaking operator will have read before installing:
// **surimpression** for the overlay, **transcription** for the transcript, **démonstration
// intégrée** for the built-in demo, **zone de notification** for the tray, **Gestionnaire
// d'informations d'identification Windows** for Credential Manager.
//
// Two typographic conventions, both invisible in a diff and both enforced by `i18n.test.ts`
// rather than left to good intentions:
//
// - The space before a colon, question mark, semicolon or exclamation mark is a
//   **non-breaking space** (U+00A0), as French requires. Without it a line break can strand
//   the punctuation on its own line — and in a rail this dense, that is where lines break.
// - The apostrophe is the typographic one (U+2019), not the straight quote, matching the
//   Store copy.
//
// Product names are not translated (Gemini, OpenAI, Voxtral, WASAPI, Zoom, Teams, Markdown),
// and neither are the two Windows setting paths an operator has to find on their own screen.

import type { Messages } from './en';

export const fr: Messages = {
	design: {
		smartSummary: 'La transcription intelligente retire les hésitations et les faux départs.',
		captions: 'Sous-titres',
		reading: 'Lecture',
		app: 'Application',
		applies: 'Les modifications s’appliquent immédiatement.',
		clearFilters: 'Effacer les filtres',
		newProfile: 'Enregistrer la configuration…',
		rename: 'Renommer',
		saveName: 'Enregistrer le nom',
		manageProfiles: 'Gérer les profils',
		desktopOnly:
			'Ouvrez l’application de bureau pour charger les profils et consulter les sessions enregistrées.',
		selectSession: 'Choisissez une session à lire ou à exporter.',
		custom: 'Personnaliser…',
		trayOpen: 'Ouvrir la fenêtre',
		trayQuit: 'Quitter',
		trayStop: 'Arrêter la session',
		trayShow: 'Afficher les sous-titres',
		trayHide: 'Masquer les sous-titres'
	},
	usability: {
		hold: 'Durée des sous-titres terminés (secondes)',
		holdHint:
			'Adapter à la fenêtre et Compact uniquement. La lecture stable conserve les sous-titres jusqu’à leur défilement ou l’arrêt de la session.',
		pace: 'Actualisation des sous-titres',
		immediate: 'Immédiate',
		steady: 'Plus stable',
		paceHint:
			'Le mode plus stable regroupe les résultats partiels toutes les 450 ms. Le texte final apparaît immédiatement. Les corrections du fournisseur restent possibles.',
		preview: 'Aperçu de l’apparence',
		bright: 'Diapositive claire',
		dark: 'Diapositive sombre',
		sample: 'Des sous-titres lisibles aident chacun à suivre la conversation.',
		preset: 'Préréglages de lecture',
		standard: 'Standard',
		projector: 'Grande salle',
		contrast: 'Contraste élevé',
		previewHint:
			'Exemple à la taille choisie ; la surimpression peut avoir une largeur différente.',
		geminiSmart:
			'Les sous-titres Gemini utilisent la transcription intelligente : Google retire les hésitations et les faux départs avant de renvoyer la transcription finale. Masquer les hésitations est un filtre local supplémentaire ; le désactiver ne désactive pas le nettoyage de Google.',
		profiles: 'Profils de réunion',
		profileName: 'Nom du profil',
		saveProfile: 'Enregistrer la configuration',
		loadProfile: 'Charger le profil',
		deleteProfile: 'Supprimer le profil',
		confirmDelete: 'Supprimer définitivement',
		profileHint:
			'Enregistre la configuration, l’apparence et la position sur ce PC, sans clé API. Chargez à l’arrêt et vérifiez les périphériques. Sélectionnez à nouveau l’application à capturer.',
		profileLoaded: 'Profil chargé. Vérifiez les périphériques et la position avant de démarrer.',
		profileMissing:
			'Un périphérique audio est absent ; celui par défaut de Windows est sélectionné. Vérifiez-le avant de démarrer.',
		profileSaved: 'Profil enregistré.',
		chooseProfile: 'Choisir un profil',
		title: 'Titre de la session',
		saveTitle: 'Enregistrer le titre',
		search: 'Rechercher dans les titres et les transcriptions',
		from: 'À partir du',
		to: 'Jusqu’au',
		dateFormat: 'AAAA-MM-JJ',
		chooseDate: 'Choisir une date',
		invalidDate: 'Saisissez une date valide : AAAA-MM-JJ.',
		language: 'Langue des sous-titres',
		allLanguages: 'Toutes les langues',
		unknownLanguage: 'Détection automatique / inconnue',
		noMatches: 'Aucune session correspondante.',
		titleSaved: 'Titre de la session enregistré.',
		shortcuts: 'Raccourcis clavier',
		shortcutHint:
			'Lorsque la fenêtre principale est active, hors des champs de saisie et des boîtes de dialogue.',
		shortcutStart: 'Démarrer / arrêter la session',
		shortcutOverlay: 'Afficher / masquer la surimpression',
		shortcutSize: 'Agrandir / réduire les sous-titres',
		shortcutDirection: 'Permuter les deux premiers favoris avant de démarrer avec F2',
		shortcutPause: 'Mettre en pause / reprendre les sous-titres',
		listening: 'À l’écoute — aucun signal audio récent',
		audio: 'Réception audio',
		captions: 'Réception des sous-titres',
		stale:
			'Le son arrive, mais aucun sous-titre depuis 15 secondes. Vérifiez le fournisseur et la connexion.',
		connecting: 'Connexion…',
		reconnecting: 'Reconnexion…',
		paused: 'En pause — la capture continue, rien n’est envoyé',
		error: 'Source arrêtée avec une erreur',
		idle: 'Source arrêtée',
		activity: 'État des entrées en direct',
		titleHint: 'Laissez vide pour utiliser la date de la session.'
	},
	locale: {
		/** Name of this language, written in this language, for the language selector. */
		name: 'Français',
		/** BCP 47 tag used for dates, times and number formatting. */
		tag: 'fr-FR',
		label: 'Langue de l’interface',
		note: 'Change l’application, pas les sous-titres.'
	},

	// The product's own name is not translated — the Store lists it in English, and inventing a
	// French one would give the same app a third name. The line under it is prose, so it is.
	app: {
		name: 'Live Translation & Subtitles'
	},

	keys: {
		ctrl: 'Ctrl',
		shift: 'Maj',
		space: 'Espace',
		o: 'O',
		up: '↑',
		down: '↓',
		p: 'P',
		f2: 'F2'
	},

	state: {
		idle: 'Inactif',
		connecting: 'Connexion',
		running: 'En direct',
		reconnecting: 'Reconnexion',
		paused: 'En pause',
		error: 'Erreur',
		/** Shown in place of "Live" while the bundled demonstration is playing. */
		demo: 'Démo'
	},

	/** Spoken by the status region on a state change. Never drawn. */
	announce: {
		idle: 'Session inactive.',
		connecting: 'Connexion au moteur de sous-titrage.',
		running: 'Les sous-titres sont en direct.',
		reconnecting: 'Connexion perdue — reconnexion en cours.',
		paused: 'Sous-titres en pause. Rien n’est envoyé au moteur de sous-titrage.',
		error: 'Erreur de session.'
	},

	mode: {
		translate: 'Traduction',
		transcribe: 'Sous-titres'
	},

	source: {
		microphone: 'Micro de la salle',
		system: 'Audio système',
		both: 'Les deux',
		/** The microphone tile and meter while the built-in demonstration is selected. */
		demo: 'Audio de démo',
		/** The source chip during a rehearsal, which plays a bundled recording. */
		sample: 'Échantillon'
	},

	whisper: {
		cost: 'Sur cet ordinateur — aucun frais d’API',
		title: 'Transcription locale',
		language: 'Langue parlée',
		auto: 'Détection automatique',
		languageHint:
			'Transcrire dans la langue parlée. Choisissez une langue si vous la connaissez ; la détection automatique couvre les langues prises en charge.',
		model: 'Modèle Whisper',
		tiny: 'Tiny — le plus rapide',
		base: 'Base — équilibré',
		small: 'Small — plus précis',
		download: 'Télécharger le modèle',
		remove: 'Supprimer le modèle',
		cancel: 'Annuler le téléchargement',
		ready: 'Modèle prêt pour la transcription hors ligne.',
		missing: 'Téléchargez un modèle avant de démarrer.',
		downloading: 'Téléchargement du modèle…',
		privacy:
			'Le son est traité sur cet ordinateur. Le son en attente est conservé dans un fichier temporaire, supprimé à la fin du traitement. Aucun frais d’API.',
		hint: 'Les modèles prennent en charge 99 langues. La précision et la vitesse varient selon la langue et l’ordinateur.',
		processing: 'Finalisation de la transcription…',
		pending: 'Son en attente de traitement',
		discard: 'Abandonner le son restant',
		discardConfirm:
			'Abandonner le son restant ? Les sous-titres déjà produits seront conservés, mais la transcription sera incomplète.',
		cpuUnsupported: (missing: string) =>
			`Indisponible sur ce processeur (il lui manque ${missing}). Les autres moteurs fonctionnent.`,
		translateTitle: 'Traduction locale vers l’anglais',
		translateLanguageHint:
			'La langue à partir de laquelle Whisper traduit. Choisissez-la si vous la connaissez ; la détection automatique couvre les langues prises en charge.',
		translateHint:
			'Traduit la parole de l’une des 99 langues prises en charge vers l’anglais uniquement. Choisissez Small : Tiny et Base traduisent mal.'
	},
	engine: {
		whisper: 'Whisper',
		'whisper-translate': 'Whisper',
		gemini: 'Gemini',
		'gemini-transcribe': 'Gemini',
		openai: 'OpenAI',
		mistral: 'Voxtral',
		ondevice: 'Démo intégrée'
	},

	language: {
		searchHint:
			'Saisissez un nom ou un code. ↑/↓ pour parcourir ; Tab pour épingler la langue active.',
		favourites: 'Favoris',
		all: 'Toutes les langues',
		noMatches: 'Aucune langue correspondante.',
		second: 'Deuxième langue de sous-titrage',
		secondNone: 'Aucune',
		secondHint:
			'Sous-titre dans les deux langues à la fois. Chaque source ouvre une seconde session de traduction, ce qui double le coût.',
		pin: (language: string) => `Épingler ${language}`,
		unpin: (language: string) => `Désépingler ${language}`,
		unsupported: (engine: string, language: string) =>
			`${engine} ne prend pas en charge la langue ${language} — choisissez une autre langue.`,
		englishOnly: 'Whisper traduit uniquement vers l’anglais, sans deuxième langue de sous-titrage.',
		/** Target-language chip when the engine detects the spoken language itself. */
		auto: 'Auto'
	},

	provider: {
		vendor: {
			whisper: 'Whisper local',
			'whisper-translate': 'Whisper local',
			gemini: 'Google Gemini',
			'gemini-transcribe': 'Google Gemini',
			openai: 'OpenAI',
			mistral: 'Mistral Voxtral',
			ondevice: 'Démo intégrée'
		},
		/** Shown in the mono face under the vendor. Model ids are not translated; the
		 *  demonstration has no model, so it describes itself instead. */
		model: {
			whisper: 'Whisper multilingue',
			'whisper-translate': 'Hors ligne · vers l’anglais uniquement',
			ondevice: 'Échantillon fourni · déterministe'
		},
		costNote: {
			whisper:
				'Le son est traité sur cet ordinateur. Le son en attente est conservé dans un fichier temporaire, supprimé à la fin du traitement. Aucun frais d’API.',
			'whisper-translate':
				'Le son est traité sur cet ordinateur. Le son en attente est conservé dans un fichier temporaire, supprimé à la fin du traitement. Aucun frais d’API.',
			gemini:
				'Gemini : l’entrée est facturée au temps réel, la sortie uniquement pendant la traduction — les pauses et les changements de diapositive font baisser ce montant.',
			'gemini-transcribe':
				'Gemini : l’audio entrant est facturé au temps réel, le texte de la transcription uniquement lorsque quelqu’un parle.',
			openai:
				'OpenAI : l’audio entrant et le texte sortant sont facturés à la minute tant que le flux reste ouvert.',
			mistral: 'Voxtral : facturé à la minute d’audio transmis, tant que la session reste ouverte.',
			ondevice:
				'Démonstration intégrée : aucun audio en direct n’est capté, aucun service n’est contacté et rien n’est facturé.'
		}
	},

	cost: {
		/** Appended to a published rate: "$3.06" + "/hr". */
		perHour: '/h',
		free: 'Gratuit',
		twoLanguages: '×2 langues',
		estimate: 'Coût est.',
		twoSources: '×2 sources'
	},

	applications: {
		recovery:
			'La capture de l’application sélectionnée s’est arrêtée. Sélectionnez-la à nouveau après sa fermeture ou son redémarrage. Les autres sons système ne sont jamais sélectionnés automatiquement.',
		mode: 'Capture du son système',
		output: 'Tout le son de la sortie sélectionnée',
		application: 'Une application',
		choose: 'Sélectionner une application',
		refresh: 'Actualiser les applications',
		unsupported:
			'La capture par application nécessite Windows build 20348 ou ultérieur. Choisissez explicitement tout le son de la sortie pour utiliser ce mode.',
		hint: 'Capture l’application sélectionnée et ses processus enfants, y compris ses notifications. Pour un navigateur, plusieurs onglets peuvent être inclus.',
		missing: 'Application indisponible — sélectionnez-la à nouveau',
		empty: 'Aucune fenêtre d’application accessible. Ouvrez l’application, puis actualisez.',
		reselect: 'Arrêter et sélectionner une application'
	},
	devices: {
		refresh: 'Actualiser les appareils',
		refreshing: 'Actualisation des appareils…',
		output: 'Sortie audio système',
		missing: 'Appareil sélectionné indisponible',
		retry: 'Arrêter et relancer la session',
		fallback: 'Arrêter et relancer avec l’appareil par défaut',
		recovery:
			'Un appareil de capture a échoué. La relance termine la session en cours, y compris toute source encore active, puis démarre une nouvelle session. Votre transcription est conservée.',
		idleFallback:
			'Un appareil audio mémorisé est indisponible. La prochaine session utilisera le choix par défaut de Windows.'
	},
	rail: {
		locked: 'Session verrouillée',
		lockedNote: 'Arrêtez la session pour modifier l’un de ces réglages.',
		demoNote:
			'Une démonstration intégrée est en cours — ni le microphone ni l’audio système ne sont captés.',
		rehearsalNote:
			'Un enregistrement d’échantillon est en cours — rien de ce qui se dit dans la salle n’est capté.',
		chip: {
			mode: 'Mode',
			source: 'Source',
			roomReads: 'La salle lit',
			engine: 'Moteur'
		},
		arriving: 'Audio entrant',
		stop: 'Arrêter les sous-titres',
		stopping: 'Arrêt…',
		pause: 'Pause',
		resume: 'Reprendre',
		pauseNote:
			'En pause : le moteur de sous-titrage est déconnecté et rien n’est facturé. Les vumètres continuent d’afficher la salle.',

		step: {
			whatToShow: 'Ce qu’il faut afficher',
			whereFrom: 'D’où vient l’audio',
			engine: 'Moteur',
			/** Step 03's heading, which asks a different question per mode. */
			roomReads: 'La salle lit',
			demoLanguage: 'Langue de la démo',
			spokenLanguage: 'Langue parlée'
		},

		translate: {
			title: 'Traduction en direct',
			desc: 'La parole est détectée puis traduite dans la langue que lit la salle.'
		},
		transcribe: {
			title: 'Sous-titres',
			desc: 'Transcrivez la parole localement avec Whisper ou via Voxtral ou Gemini. Export en texte, Markdown, SRT ou VTT.'
		},

		sourceHint:
			'L’audio système capte les applications utilisant la sortie choisie — Zoom, Teams, un onglet de navigateur, un lecteur multimédia.',
		demoSourceHint:
			'Utilise un échantillon déterministe fourni avec l’application. Choisissez Whisper, Voxtral ou Gemini pour des sous-titres en direct du microphone ou de l’audio système.',
		micDevice: 'Périphérique microphone',
		systemDefault: 'Périphérique par défaut',
		/** Appended to the name of the device Windows would pick on its own. */
		isDefault: (name: string) => `${name} (par défaut)`,

		autoDetectHint: (engine: string) =>
			`${engine} détecte lui-même la langue parlée et écrit les sous-titres dans cette même langue. Aucune langue cible n’est nécessaire.`,
		flipHint: 'Permuter les deux premiers favoris avant de démarrer avec',
		demoLanguageHint:
			'Choisissez la langue de la démonstration intégrée. Ce mode illustre la surimpression et l’export ; il n’écoute pas la salle.'
	},

	settings: {
		heading: 'Paramètres',
		openLabel: 'Ouvrir les paramètres',
		closeLabel: 'Fermer les paramètres',
		appearance: 'Apparence des sous-titres',
		/** Says where to look while choosing. The stand-in caption the overlay shows in
		 *  placement mode is set in whatever is chosen here, so placement is the preview. */
		appearanceNote:
			'Placez la surimpression pour juger ces réglages sur le projecteur — le sous-titre témoin adopte ce qui est choisi ici.'
	},

	history: {
		stored: 'L’historique des transcriptions reste enregistré localement jusqu’à sa suppression.',
		heading: 'Historique des transcriptions',
		enable: 'Enregistrer automatiquement les sessions en local',
		privacy:
			'Désactivé par défaut. Enregistre les lignes finalisées à partir de maintenant. La désactivation conserve les sessions existantes ; supprimez-les ici. Aucun audio n’est enregistré.',
		retry: 'Réessayer l’enregistrement',
		refresh: 'Actualiser',
		empty: 'Aucune session enregistrée.',
		failed: 'Impossible de mettre à jour l’historique.',
		auto: 'Langue détectée automatiquement',
		sameLanguage: 'Sous-titres dans la même langue',
		unfinished: 'En cours ou interrompue · durée au dernier enregistrement',
		unreadable: 'Session illisible',
		delete: 'Supprimer',
		confirmDelete: 'Supprimer définitivement',
		cancel: 'Annuler',
		copy: 'Copier la transcription',
		copied: 'Transcription copiée.',
		fullTranscript: 'Transcription enregistrée'
	},
	overlayControls: {
		stable: 'Lecture stable',
		cleanSpeech: 'Masquer les hésitations',
		cleanSpeechHint:
			'Uniquement dans la superposition. La transcription conserve le texte original.',
		showOriginal: 'Afficher la parole originale sous la traduction',
		showOriginalHint:
			'Une ligne plus petite sous chaque sous-titre traduit, pour qui suit la langue de l’orateur. Traduction uniquement ; pas en lecture stable.',
		fillerWords: {
			heading: 'Mots à masquer',
			hint: 'Un mot de la liste est masqué partout où il apparaît seul, quel que soit son sens. Des mots comme « alors », « bon » ou « genre » portent souvent du sens : les ajouter peut supprimer du contenu réel.',
			empty: 'La liste est vide : rien n’est masqué.',
			add: 'Ajouter un mot',
			addButton: 'Ajouter',
			remove: (word: string) => `Retirer « ${word} »`,
			reset: 'Rétablir les mots par défaut',
			added: (word: string) => `« ${word} » ajouté.`,
			removed: (word: string) => `« ${word} » retiré.`,
			restored: 'Mots par défaut rétablis.',
			problem: {
				phrase: 'Ajoutez un mot à la fois. Les expressions ne sont pas prises en charge.',
				characters:
					'Utilisez des lettres et des chiffres. Un trait d’union ou une apostrophe ne peut que relier les parties d’un mot.',
				length: (max: number) => `Un mot peut compter au plus ${max} caractères.`,
				duplicate: (word: string) => `« ${word} » figure déjà dans la liste.`,
				full: (max: number) => `La liste contient au plus ${max} mots. Retirez-en un d’abord.`
			}
		},

		heading: 'Surimpression',
		captionSize: 'Taille des sous-titres',
		smaller: 'Réduire les sous-titres',
		larger: 'Agrandir les sous-titres',
		captionLayout: 'Disposition des sous-titres',
		fitWindow: 'Adapter à la fenêtre',
		compact: 'Compact',
		captionWidth: 'Largeur des lignes',
		narrower: 'Raccourcir les lignes de sous-titres',
		wider: 'Allonger les lignes de sous-titres',
		captionFace: 'Police des sous-titres',
		faceDefault: (label: string) => `${label} (par défaut)`,
		captionColour: 'Couleur des sous-titres',
		scrimColour: 'Couleur du fond',
		swatch: {
			white: 'Blanc',
			paleYellow: 'Jaune pâle',
			mint: 'Menthe',
			paleBlue: 'Bleu pâle',
			charcoal: 'Anthracite',
			black: 'Noir',
			green: 'Vert foncé',
			navy: 'Bleu marine'
		},
		scrimOpacity: 'Intensité du fond',
		weakerScrim: 'Fond plus discret derrière les sous-titres',
		strongerScrim: 'Fond plus marqué derrière les sous-titres',
		contrast: (ratio: string) => `Contraste ${ratio}:1`,
		contrastOk: 'Lisible sur une diapositive claire comme sur une sombre.',
		contrastLow: (step: string, target: string) =>
			`${step} descend sous ${target}:1 sur une diapositive claire ou sombre.`,
		contrastStep: {
			live: 'Le sous-titre en cours',
			final: 'Une ligne terminée',
			label: 'L’étiquette du locuteur',
			lead: 'La ligne précédente en rappel'
		},
		reset: 'Rétablir',
		resetLabel: 'Rétablir l’apparence par défaut de la surimpression',
		move: 'Déplacer les sous-titres',
		done: 'Terminé',
		moveLabel: 'Déplacer les sous-titres',
		moveDoneLabel: 'Terminer le déplacement de la surimpression',
		show: 'Afficher les sous-titres',
		hide: 'Masquer les sous-titres',
		showLabel: 'Afficher la surimpression',
		hideLabel: 'Masquer la surimpression'
	},

	window: {
		heading: 'Fenêtre',
		minimizeToTray: 'Réduire dans la zone de notification',
		keepRunning:
			'Garder l’application active dans la zone de notification quand je ferme cette fenêtre',
		keepRunningNote:
			'Désactivé par défaut : le bouton de fermeture quitte l’application comme d’habitude. Activé, fermer la fenêtre laisse la session sous-titrer, et l’icône de la zone de notification est le moyen d’y revenir.',
		needsDesktop:
			'Nécessite l’application de bureau — un aperçu dans un navigateur n’a pas de zone de notification.'
	},

	stage: {
		browserBanner: {
			before:
				'Exécution dans un navigateur sans le runtime Tauri — les commandes sont désactivées. Lancez',
			command: 'npm run tauri dev',
			after: 'pour la capture audio, la traduction et les sous-titres.'
		},
		onScreen: 'À l’écran maintenant',
		newestLast: 'Le plus récent en bas',
		twoSpeakers: 'Deux intervenants · le plus récent en bas',
		origin: {
			microphone: 'Salle',
			system: 'Distant',
			demo: 'Démo'
		},
		originSub: {
			microphone: 'micro',
			system: 'système',
			demo: 'échantillon'
		},
		waitingTranslation: 'Les sous-titres traduits apparaîtront ici et dans la surimpression.',
		waitingSubtitles: 'Les sous-titres en direct apparaîtront ici et dans la surimpression.',
		waitingDemo: 'Les sous-titres de démonstration apparaîtront ici et dans la surimpression.'
	},

	preflight: {
		kicker: 'Avant de démarrer',
		heading: 'Prêt quand vous l’êtes',
		intro:
			'Quatre vérifications, puis Démarrer en haut de la fenêtre. Tout ce qui se trouve à gauche se verrouille pendant le sous-titrage : rien ne peut être modifié par accident en pleine session.',

		demoRow: {
			title: 'Démo intégrée · aucune clé nécessaire',
			checking: 'Vérification de la démonstration intégrée…',
			ready:
				'Prête — les sous-titres de l’échantillon fourni illustrent la surimpression sans microphone, sans compte, sans clé, sans pack de langue et sans réseau.',
			checkFailed: 'La démonstration intégrée n’a pas pu être vérifiée.'
		},

		audio: {
			/** Row title: names whatever is being checked. */
			title: {
				microphone: 'Micro de la salle',
				system: 'Audio système',
				both: 'Audio',
				demo: 'Audio de démo'
			},
			/** What was heard, in the past tense, once a test has confirmed it. */
			heard: {
				microphone: 'Le micro de la salle captait du son',
				system: 'Le rebouclage WASAPI recevait du son',
				both: 'Le micro de la salle et le rebouclage WASAPI recevaient tous les deux du son',
				demo: 'L’échantillon fourni est prêt — aucun microphone n’est ouvert'
			},
			/** The same fact in the present tense, while the test is still running. English
			 *  used to reach this by replacing "was" with "is"; that does not survive
			 *  translation, so both tenses are written out. */
			hearing: {
				microphone: 'Le micro de la salle capte du son — arrêtez le test quand vous êtes satisfait',
				system: 'Le rebouclage WASAPI reçoit du son — arrêtez le test quand vous êtes satisfait',
				both: 'Le micro de la salle et le rebouclage WASAPI reçoivent tous les deux du son — arrêtez le test quand vous êtes satisfait',
				demo: 'L’échantillon fourni est prêt — aucun microphone n’est ouvert'
			},
			listening: 'Écoute en cours — parlez dans le micro ou lancez un son',
			unchecked:
				'Pas encore vérifié — l’audio n’est surveillé que pendant un test ou une session en cours',
			test: 'Tester l’audio',
			retest: 'Retester',
			stopTest: 'Arrêter le test'
		},

		overlay: {
			title: 'Placement de la surimpression',
			placed: 'Placée — les sous-titres apparaîtront là où vous les avez verrouillés',
			unplaced: 'Pas encore placée — les sous-titres se placeront en bas au centre de cet écran',
			place: 'Déplacer les sous-titres',
			adjust: 'Déplacer les sous-titres',
			done: 'Terminé',
			placeLabel: 'Déplacer les sous-titres',
			adjustLabel: 'Déplacer les sous-titres',
			doneLabel: 'Terminer le placement de la surimpression'
		},

		cost: {
			title: 'Coût en cours',
			billed: 'Facturé à la minute d’audio transmis, tant que la session reste ouverte',
			free: 'Intégré à l’application — rien n’est facturé'
		},

		start: {
			translate: 'Démarrer la traduction',
			subtitles: 'Démarrer les sous-titres',
			demo: 'Démarrer la démo',
			starting: 'Démarrage…'
		},
		rehearse: {
			action: 'Répéter',
			hint: 'Fait passer un enregistrement fourni dans la chaîne en direct — aucun microphone nécessaire.',
			demoHint: 'Démarrer la démo lance déjà la démonstration intégrée.'
		},
		privacy: {
			memoryOnly: 'La transcription reste en mémoire jusqu’à ce que vous l’enregistriez.',
			spooled:
				'La transcription reste en mémoire et est copiée localement jusqu’à ce que vous l’enregistriez.',
			demo: 'La démo intégrée reste entièrement à l’intérieur de l’application.',
			cloud: (vendor: string) => `Rien ne quitte la machine, hormis l’audio envoyé à ${vendor}.`
		}
	},

	key: {
		title: (name: string) => `Clé ${name}`,
		saved:
			'Enregistrée dans le Gestionnaire d’informations d’identification Windows · lue uniquement par le cœur Rust',
		desc: {
			before:
				'Enregistrée dans le Gestionnaire d’informations d’identification Windows, utilisée uniquement depuis le cœur Rust. Nécessite l’accès à',
			after: '.'
		},
		getKey: 'Obtenir une clé',
		opensInBrowser: ' (s’ouvre dans votre navigateur)',
		placeholder: (name: string) => `Collez votre clé API ${name}`,
		save: 'Enregistrer',
		saving: 'Enregistrement…',
		replace: 'Remplacer',
		remove: 'Supprimer',
		cancel: 'Annuler'
	},

	transcript: {
		heading: 'Transcription',
		jumpToLatest: 'Aller aux derniers sous-titres',
		lines: (n: number) => (n === 1 ? '1 ligne' : `${n} lignes`),
		unsaved: 'Non enregistrée',
		saved: 'Enregistrée',
		saveAs: 'Enregistrer sous…',
		format: 'Format d’export',
		plainText: 'Texte brut',
		includeOriginal: 'Inclure la parole originale',
		noTiming:
			'Cette transcription récupérée ne contient pas d’horodatage. Enregistrez-la en texte ou en Markdown.',
		clear: 'Effacer',
		confirmClear: 'Supprimer les lignes non enregistrées ?',
		savedTo: 'Enregistrée dans',
		savedAnnouncement: (path: string) => `Transcription enregistrée dans ${path}`,
		staleBefore: 'Les lignes ajoutées depuis l’enregistrement dans',
		staleAfter: 'ne sont pas encore sur le disque.',
		longSession: (threshold: number) =>
			`Cette session est longue et rien n’en a été enregistré depuis qu’elle a dépassé ${threshold} lignes. Rien n’est supprimé, mais enregistrez-la maintenant pour qu’un plantage ne l’emporte pas.`,
		emptyTranslate:
			'Les traductions finalisées s’accumulent ici, prêtes à être exportées dans le format de votre choix.',
		emptySubtitles:
			'Les sous-titres finalisés s’accumulent ici, prêts à être exportés dans le format de votre choix.',
		side: {
			microphone: 'Salle',
			system: 'Distant'
		},
		recovery: {
			title: 'Conserver une copie de récupération locale pendant le sous-titrage',
			note: 'Écrit les lignes finalisées sur ce PC toutes les quelques secondes, afin qu’un plantage ou une coupure de courant n’emporte pas la session. Ne quitte jamais la machine, ne contient ni audio ni clé API, et est supprimée dès que vous enregistrez, effacez ou désactivez cette option.',
			needsDesktop:
				'Nécessite l’application de bureau — un aperçu dans un navigateur n’a nulle part où l’écrire.'
		}
	},

	// What the saved file says. Issue #23 puts the transcript's headings in the interface
	// language: an operator working in French is writing a French document, and the file is
	// the part of this app that leaves the machine.
	export: {
		title: 'Transcription des sous-titres en direct',
		original: 'Original',
		origin: {
			microphone: 'Microphone',
			system: 'Système'
		}
	},

	prompt: {
		unsaved: {
			title: 'Enregistrer cette transcription avant de fermer ?',
			sessionEnded: 'La session a été arrêtée et les derniers sous-titres ont été récupérés.',
			body: (lines: number) =>
				lines === 1
					? '1 ligne n’a pas été enregistrée. Fermer sans enregistrer la supprime.'
					: `${lines} lignes n’ont pas été enregistrées. Fermer sans enregistrer les supprime.`,
			failed: (error: string) => `Enregistrement impossible : ${error}`,
			save: 'Enregistrer et fermer',
			saving: 'Enregistrement…',
			discard: 'Supprimer et fermer',
			cancel: 'Annuler',
			note: 'Choisissez où enregistrer la transcription. Annuler laisse l’application ouverte.'
		},
		recovery: {
			title: 'Récupérer la transcription de votre dernière session ?',
			body: (lines: number, savedAt: string) =>
				`L’application s’est fermée alors que ${lines === 1 ? '1 ligne non enregistrée était encore' : `${lines} lignes non enregistrées étaient encore`} dans le journal. Elles ont été copiées localement à ${savedAt} et n’ont pas quitté ce PC.`,
			restore: 'Restaurer la transcription',
			delete: 'La supprimer',
			noteBefore: 'Les deux réponses suppriment le fichier de récupération situé à',
			noteAfter:
				'. Restaurer recharge les lignes dans le journal, toujours non enregistrées, pour que vous puissiez les enregistrer où vous le souhaitez.'
		},
		activeSession: {
			title: 'Une session de sous-titrage est en cours',
			body: (elapsed: string) =>
				`Les sous-titres sont en direct depuis ${elapsed}. Fermer arrête la session, attend les derniers sous-titres, puis quitte l’application.`,
			noteBefore:
				'Pour ranger la fenêtre sans rien arrêter, utilisez Réduire dans la zone de notification — ou activez',
			noteEmphasis:
				'Garder l’application active dans la zone de notification quand je ferme cette fenêtre',
			noteAfter: '.',
			keep: 'Continuer le sous-titrage',
			stop: 'Arrêter et fermer',
			whisperPending: (seconds: number) =>
				`Whisper local doit encore traiter ${seconds} s de son. La fermeture lui laisse quelques secondes, puis abandonne le reste ; la transcription sera donc incomplète.`
		},
		trayHide: {
			title: 'Live Translation va rester actif',
			bodyBefore:
				'Vous avez demandé que la fermeture de cette fenêtre laisse l’application active dans la zone de notification : elle va donc disparaître de la barre des tâches',
			bodyRunning: 'et continuer à sous-titrer.',
			bodyIdle: 'mais rester prête.',
			bodyAfter:
				'Son icône reste dans la zone de notification, à côté de l’horloge — vous pouvez y ouvrir l’application, afficher ou masquer la surimpression, arrêter la session ou quitter.',
			noteBefore: 'Dit une seule fois. Désactivez-le de nouveau avec',
			noteEmphasis:
				'Garder l’application active dans la zone de notification quand je ferme cette fenêtre',
			noteAfter: '.',
			hide: 'Compris — réduire dans la zone de notification',
			quit: 'Quitter plutôt'
		}
	},

	overlay: {
		placeholder: (size: number) =>
			`Les sous-titres se placeront ici, sur deux lignes en ${size} px.`,
		dragToPlace: 'Glisser pour placer',
		moveMode: 'Mode déplacement',
		paused: 'Les sous-titres sont en pause sur la surimpression',
		keysLocks: 'verrouille',
		keysCancels: 'annule',
		keysNudge: 'déplacent',
		keyEnter: 'Entrée',
		keyEscape: 'Échap',
		keyArrows: 'Flèches',
		size: 'Taille',
		smaller: 'Réduire les sous-titres',
		larger: 'Agrandir les sous-titres',
		snapToBottom: 'Aligner en bas',
		lock: 'Verrouiller en place',
		origin: {
			microphone: 'Salle',
			system: 'Distant'
		}
	},

	// One sentence per failure the core can name (`src-tauri/src/errors.rs`). The technical
	// detail is appended in parentheses by `describeError`, so none of these end in a full
	// stop. Keep the ids and the keys in step: `errors.test.ts` reads the Rust file and fails
	// if a failure the core can report has no sentence here.
	error: {
		whisperModel: 'Le modèle Whisper n’a pas pu être préparé',
		whisperSession: 'La transcription locale n’a pas pu se terminer ; elle peut être incomplète',
		whisperCpu:
			'Whisper local ne peut pas fonctionner sur ce processeur ; choisissez un autre moteur, par exemple la démonstration intégrée',
		deviceEnumeration: 'Windows n’a pas pu énumérer les appareils audio',
		keychain: 'Le Gestionnaire d’informations d’identification Windows a refusé la demande',
		demoUnavailable: 'La démonstration intégrée n’a pas pu être préparée',
		sessionStart: 'La session n’a pas pu démarrer',
		sessionPause: 'La session n’a pas pu être mise en pause ni reprise',
		audioTestStart: 'Le test audio n’a pas pu ouvrir cette source',
		overlayWindow: 'La fenêtre de surimpression n’a pas répondu',
		operatorWindow: 'La fenêtre principale n’a pas répondu',
		transcriptWrite: 'La transcription n’a pas pu être écrite',
		recoveryWrite: 'La copie de récupération n’a pas pu être écrite',
		recoveryRead: 'La copie de récupération de votre dernière session n’a pas pu être lue',
		recoveryDelete: 'La copie de récupération n’a pas pu être supprimée',
		historyStorage: 'Le dossier de l’historique n’a pu être ni lu ni modifié',
		taskFailed: 'Une tâche en arrière-plan s’est arrêtée de façon inattendue',
		micStream:
			'Le microphone a cessé d’envoyer de l’audio. Vérifiez la connexion dans Paramètres Windows > Système > Son (ms-settings:sound), puis réessayez',
		micCapture:
			'La capture du microphone a échoué. Si l’accès est bloqué, activez-le dans Paramètres Windows > Confidentialité et sécurité > Microphone (ms-settings:privacy-microphone), puis redémarrez',
		systemCapture:
			'La capture de l’audio système a échoué. Vérifiez la sortie sélectionnée dans Paramètres Windows > Système > Son (ms-settings:sound), puis réessayez',
		providerRejected:
			'Le fournisseur a refusé la connexion — vérifiez la clé API et l’accès au modèle',
		providerStopped: 'Le fournisseur a mis fin à la session',
		providerReconnecting: 'La connexion a été perdue ; reconnexion en cours'
	}
};
