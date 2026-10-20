# Partner Center listing text — 1.7.1

Prepared for **1.7.1 / MSIX 1.7.1.0**, tagged on 20 October 2026; not submitted. The last
confirmed Store release is 1.6.1 (MSIX 1.6.1.0), which already has the wave-to-words icon and
the refreshed interface, so What's new covers the changes since 1.6.1. Paste each block into
its named field after the [release checks](store-updates.md#release-171-handoff).
These descriptions lead with the actual captioning workflow; the scripted demo is a secondary
setup aid.

1.7.1 is 1.7.0, which was not submitted, plus a fix that shows the app icon on the taskbar and
in Start without a coloured square; What's new gains one sentence on it.

For 1.7.0 the descriptions, features, short descriptions and requirements in all three
languages add offline translation into English with Whisper (which retires the line that
Whisper does not translate) and the overlay reopening where it was placed, and say that
Whisper on x64 needs a processor with AVX2. The certification notes add that processor rule
and an optional translation route. What's new also says that the overlay moves onto a connected
screen when the projector is unplugged mid-session
([#139](https://github.com/fmadore/Live-translation/pull/139), merged after the release
candidate). The plain-language pass from 1.6.1 stands. The German
edits are parity additions only; the native-speaker review is still pending.

Every paragraph inside a block is one unwrapped line, because Partner Center keeps line
breaks; blank lines separate paragraphs. Prettier ignores Markdown in this repository
(`.prettierignore`), so nothing re-wraps them.

Microsoft's [listing field documentation](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/add-and-edit-store-listing-info)
allows 10,000 characters for Description, 1,500 for What's new, and 20 features of 200
characters each. Short description accepts 1,000 characters, but only the first 270 appear
in some views. All three short descriptions below fit within 270 characters.

## English (United States)

### Description — full text

```text
Put live captions over any meeting, lecture, video call or slide deck. Live Translation & Subtitles transcribes speech on your own PC with Whisper: download a model once, and captions run offline with no account or subscription. Whisper can also translate into English offline. When your audience needs another language, add cloud translation with your own Google Gemini or OpenAI API key; provider usage charges may apply.

Captions appear in a transparent overlay that stays on top of your slides, call or any other Windows app, and lets clicks pass through to the window beneath. It reopens where you last placed it, remembered for each display setup. Choose what to listen to: a room microphone, the audio playing on your PC, a single app, or the microphone and system audio together.

For offline subtitles, pick a multilingual Whisper model and one of 99 spoken languages, or let the app detect the language. The Tiny, Base and Small models download separately, at about 31, 57 and 182 MiB. Once a model is installed, recognition runs on your CPU with no account, API key or internet connection. Speed and accuracy depend on the computer, the model and the language. Whisper captions in the language being spoken, or translates it into English; for translation, choose Small, as Tiny and Base translate poorly. For any other language, use cloud translation.

For multilingual audiences, translate with Gemini into 78 languages or with OpenAI into 13. Show two languages at once, or set the original speech beneath the translation in Fit window or Compact when the engine provides it. A second language opens another cloud session for each audio source and adds to provider usage. Gemini and Mistral also offer cloud subtitles in the spoken language, with your own API key.

Tune captions for the room: typeface, size, colours, backing, how long lines stay on screen and how quickly they update. Choose Fit window, Compact or Stable reading, with support for right-to-left scripts. The optional filler filter hides hesitations from the overlay; edit its word list while the raw transcript stays intact. Save meeting profiles for the rooms you use often, and pause during breaks without splitting the session.

Export transcripts as text, Markdown, SRT or WebVTT. Turn on local history to save finalized captions as you go, then name, search, reopen, copy, export and delete past sessions. History and crash recovery stay off until you enable them. With Whisper, Stop lets queued audio finish so the transcript is complete.

With Whisper, audio stays on your PC; speech waiting to be processed sits in a temporary file that is deleted automatically. With a cloud engine, audio goes straight to the provider you chose. API keys are kept in Windows Credential Manager. The developer receives no audio, keys, transcripts or telemetry, and the app sells no subscriptions, credits or API access.

Use the interface in English, French or German, whatever the caption language. The operator window works from the keyboard and with Narrator, and follows Windows text size and contrast themes. An optional English/French demo lets you try the display without any setup; it plays a prepared script and does not recognize speech.

Requires Windows 11 and the Microsoft Edge WebView2 Runtime, with native x64 and ARM64 packages. On x64, Whisper needs a processor with AVX2; the cloud engines work without it. Download a Whisper model before using it offline, and allow access to the audio source you select. Capturing a single app also captures its child processes and notifications, and may include several browser tabs.
```

### Features — one feature per line

```text
Offline Whisper captions in 99 spoken languages, or automatic language detection
Download Tiny, Base or Small once, then transcribe without an account, API key or internet
Offline translation into English with Whisper, from any of its 99 languages, with no API key
Cloud translation with your own Gemini or OpenAI key; provider usage charges may apply
Two translation languages at once, plus optional original speech when available
Capture a microphone, system audio, a single app, or microphone and system audio together
Transparent, always-on-top, click-through captions over slides and video calls
Overlay reopens where you last placed it, remembered for each display setup
Fit window, Compact and Stable reading, with adjustable appearance and right-to-left support
Pause and resume, reusable meeting profiles, searchable languages and favourites
Editable filler-word filter for the overlay, with raw transcripts preserved
Text, Markdown, SRT and WebVTT export, including available original speech
Optional local transcript history with titles, search, reopening and deletion
Keyboard shortcuts and Narrator support; follows Windows text size and contrast themes
English, French and German interface; native Windows x64 and ARM64
```

### Short description

```text
Free live captions over meetings, calls and slides. Transcribe offline with Whisper in 99 languages or translate into English, or use your own cloud API key for other languages. Capture a microphone or any app, show two caption languages and export the transcript.
```

### What's new in this version — 1.7.1

```text
Translate into English offline: Local Whisper now turns speech in any of its 99 languages into English captions on your PC, with no account, API key or internet connection once a model is downloaded. Choose the Small model; Tiny and Base translate poorly.

The overlay reopens where you last placed it, remembered for each display setup, and keeps its size when moved between screens with different scaling. If the projector is unplugged during a session, the overlay moves onto a connected screen.

Cloud sessions now reconnect on their own when a provider drops the connection, reports a temporary error or the network stalls, and Gemini waits for the translation of the last words on Pause or Stop. Whisper is faster, about twice as fast in our ARM64 tests, downloads models through your Windows proxy and captions the last words before a pause straight away. On x64, Whisper now needs a processor with AVX2.

The app icon now shows on the taskbar and in Start without a coloured square behind it.

Also: support for 24-bit microphones, both caption languages in history, a remembered export format, quicker quitting during a long Whisper backlog, and fixes for Test audio and Narrator labels.
```

## Français (France)

### Description — texte complet

```text
Affichez des sous-titres en direct sur vos réunions, cours, appels vidéo et présentations. Live Translation & Subtitles transcrit la parole sur votre propre PC avec Whisper. Après le téléchargement unique d'un modèle, les sous-titres fonctionnent hors ligne, sans compte ni abonnement. Whisper peut aussi traduire vers l'anglais hors ligne. Si votre public a besoin d'une autre langue, ajoutez la traduction cloud avec votre propre clé API Google Gemini ou OpenAI ; des frais d'utilisation du fournisseur peuvent s'appliquer.

Les sous-titres s'affichent dans une surimpression transparente qui reste au-dessus de vos diapositives, de votre appel ou de toute autre application Windows, et laisse passer les clics vers la fenêtre en dessous. Elle se rouvre là où vous l'avez placée, mémorisée pour chaque configuration d'écrans. Choisissez la source : un microphone de salle, l'audio joué sur votre PC, une application précise, ou le microphone et l'audio système ensemble.

Pour les sous-titres hors ligne, choisissez un modèle Whisper multilingue et l'une des 99 langues parlées, ou laissez l'application détecter la langue. Les modèles Tiny, Base et Small se téléchargent séparément et pèsent environ 31, 57 et 182 Mio. Une fois le modèle installé, la reconnaissance s'effectue sur le processeur de votre PC, sans compte, clé API ni connexion Internet. La vitesse et la précision dépendent de l'ordinateur, du modèle et de la langue. Whisper sous-titre dans la langue parlée ou traduit la parole vers l'anglais ; pour traduire, choisissez Small, car Tiny et Base traduisent mal. Pour toute autre langue, utilisez la traduction cloud.

Pour un public multilingue, traduisez avec Gemini vers 78 langues ou avec OpenAI vers 13. Affichez deux langues à la fois, ou placez le texte original sous la traduction en mode Adapter à la fenêtre ou Compact lorsque le moteur le fournit. Une seconde langue ouvre une session cloud supplémentaire par source audio et augmente l'utilisation facturée par le fournisseur. Gemini et Mistral proposent aussi des sous-titres cloud dans la langue parlée, avec votre propre clé API.

Adaptez les sous-titres à la salle : police, taille, couleurs, fond, durée d'affichage et rythme des mises à jour. Choisissez Adapter à la fenêtre, Compact ou Lecture stable, avec prise en charge des écritures de droite à gauche. Le filtre d'hésitations facultatif les masque dans la surimpression, et vous pouvez modifier sa liste de mots sans toucher à la transcription originale. Enregistrez des profils de réunion pour vos salles habituelles et faites une pause sans scinder la session.

Exportez les transcriptions en texte, Markdown, SRT ou WebVTT. Activez l'historique local pour enregistrer les sous-titres finalisés au fil de la session, puis nommez, recherchez, rouvrez, copiez, exportez et supprimez vos sessions. L'historique et la copie de récupération restent désactivés tant que vous ne les activez pas. Avec Whisper, la commande Arrêter laisse l'audio en attente finir son traitement pour que la transcription soit complète.

Avec Whisper, l'audio reste sur votre PC ; la parole en attente de traitement est placée dans un fichier temporaire supprimé automatiquement. Avec un moteur cloud, l'audio est envoyé directement au fournisseur choisi. Les clés API sont conservées dans le Gestionnaire d'informations d'identification Windows. Le développeur ne reçoit ni audio, ni clé, ni transcription, ni télémétrie, et l'application ne vend ni abonnement, ni crédits, ni accès API.

Utilisez l'interface en français, anglais ou allemand, quelle que soit la langue des sous-titres. La fenêtre de contrôle s'utilise au clavier et avec le Narrateur, et suit la taille du texte et les thèmes de contraste de Windows. Une démo facultative en français et en anglais permet d'essayer l'affichage sans configuration ; elle déroule un script préparé et ne reconnaît pas la parole.

Nécessite Windows 11 et Microsoft Edge WebView2 Runtime, avec des paquets x64 et ARM64 natifs. Sur x64, Whisper nécessite un processeur compatible AVX2 ; les moteurs cloud fonctionnent sans. Téléchargez un modèle Whisper avant de l'utiliser hors ligne et autorisez l'accès à la source audio choisie. La capture d'une application inclut aussi ses processus enfants et ses notifications, et peut inclure plusieurs onglets d'un navigateur.
```

### Fonctionnalités — une fonctionnalité par ligne

```text
Sous-titres Whisper hors ligne dans 99 langues parlées, ou détection automatique de la langue
Téléchargez Tiny, Base ou Small, puis transcrivez sans compte, clé API ni connexion Internet
Traduction hors ligne vers l'anglais avec Whisper, depuis ses 99 langues, sans clé API
Traduction cloud avec votre clé Gemini ou OpenAI ; des frais d'utilisation peuvent s'appliquer
Deux langues de traduction à la fois et affichage facultatif du texte original disponible
Captez un microphone, l'audio système, une application précise, ou le microphone et l'audio système ensemble
Sous-titres transparents, toujours visibles et traversables par les clics, sur vos diapositives et appels
La surimpression se rouvre là où vous l'avez placée, pour chaque configuration d'écrans
Adapter à la fenêtre, Compact et Lecture stable ; apparence réglable et écritures de droite à gauche
Pause et reprise, profils de réunion, recherche de langues et favoris
Liste d'hésitations modifiable pour la surimpression, avec conservation de la transcription originale
Export texte, Markdown, SRT et WebVTT, avec texte original lorsqu'il est disponible
Historique local facultatif avec titres, recherche, réouverture et suppression
Raccourcis clavier et prise en charge du Narrateur ; suit la taille du texte et les thèmes de contraste de Windows
Interface en français, anglais et allemand ; versions Windows x64 et ARM64 natives
```

### Description courte

```text
Sous-titres en direct gratuits sur vos réunions, appels et présentations. Transcrivez hors ligne avec Whisper en 99 langues ou traduisez vers l'anglais, et vers d'autres langues avec votre clé API cloud. Captez un micro ou une application et exportez la transcription.
```

### Nouveautés de cette version — 1.7.1

```text
Traduisez vers l'anglais hors ligne : Whisper local transforme désormais la parole de l'une de ses 99 langues en sous-titres anglais sur votre PC, sans compte, clé API ni connexion Internet une fois le modèle téléchargé. Choisissez le modèle Small ; Tiny et Base traduisent mal.

La surimpression se rouvre là où vous l'avez placée, mémorisée pour chaque configuration d'écrans, et garde sa taille quand vous la déplacez entre des écrans à mise à l'échelle différente. Si le projecteur est débranché en cours de session, elle passe sur un écran connecté.

Les sessions cloud se reconnectent d'elles-mêmes lorsqu'un fournisseur coupe la connexion, signale une erreur temporaire ou que le réseau se bloque, et Gemini attend la traduction des derniers mots lors d'une pause ou d'un arrêt. Whisper est plus rapide, environ deux fois plus dans nos tests sur ARM64, télécharge les modèles via le proxy de Windows et sous-titre aussitôt les derniers mots avant une pause. Sur x64, Whisper nécessite désormais un processeur compatible AVX2.

L'icône de l'application s'affiche désormais dans la barre des tâches et le menu Démarrer sans carré coloré derrière elle.

Également : prise en charge des micros 24 bits, deux langues de sous-titres dans l'historique, format d'export mémorisé, fermeture plus rapide pendant un long traitement Whisper et corrections du test audio et des libellés lus par le Narrateur.
```

## Deutsch (Deutschland)

### Beschreibung — vollständiger Text

```text
Verfolgen Sie Besprechungen, Vorträge und Videoanrufe mit Untertiteln direkt über Ihren Inhalten. Live Translation & Subtitles transkribiert Sprache lokal mit Whisper nach einem einmaligen Modelldownload und übersetzt sie auf Wunsch offline ins Englische. Optionale Cloud-Übersetzungen und Cloud-Untertitel benötigen Ihr eigenes Konto mit API-Schlüssel bei Google Gemini, OpenAI oder Mistral; dabei können nutzungsabhängige Kosten entstehen.

Platzieren Sie ein transparentes Untertitel-Overlay über Folien, einem Anruf oder einer anderen Windows-App. Erfassen Sie ein Mikrofon, das Windows-Systemaudio, eine Anwendung mit ihren Unterprozessen oder Mikrofon und Systemaudio gemeinsam. Das Overlay bleibt im Vordergrund und lässt Mausklicks zur darunterliegenden Anwendung durch. Es öffnet sich wieder dort, wo Sie es zuletzt platziert haben, gespeichert für jede Bildschirmanordnung.

Für Offline-Untertitel wählen Sie ein mehrsprachiges Whisper-Modell und eine von 99 gesprochenen Sprachen oder die automatische Erkennung. Tiny, Base und Small werden separat heruntergeladen (etwa 31, 57 und 182 MiB). Danach läuft die Erkennung auf der CPU Ihres PCs, ohne Konto, API-Schlüssel oder Internetverbindung. Geschwindigkeit und Genauigkeit hängen von Computer, Modell und Sprache ab. Whisper transkribiert in der gesprochenen Sprache oder übersetzt ins Englische; zum Übersetzen wählen Sie Small, da Tiny und Base schlecht übersetzen. Für andere Sprachen nutzen Sie die Cloud-Übersetzung.

Für ein mehrsprachiges Publikum übersetzen Sie mit Gemini oder OpenAI. Die App bietet 78 Zielsprachen für Gemini und 13 für OpenAI. Zeigen Sie zwei Zielsprachen gleichzeitig oder den Originaltext unter der Übersetzung in An Fenster anpassen oder Kompakt, sofern die Engine ihn liefert. Eine zweite Zielsprache öffnet für jede Audioquelle eine zusätzliche Cloud-Sitzung und erhöht die Anbieternutzung. Gemini und Mistral bieten auch Cloud-Untertitel in der gesprochenen Sprache.

Passen Sie Schrift, Größe, Farbe, Kontrast, Anzeigedauer und Aktualisierungstempo an. Wählen Sie An Fenster anpassen, Kompakt oder Ruhiger Lesemodus, auch für Text von rechts nach links. Bearbeiten Sie die Wörter des optionalen Füllwortfilters, während das Originaltranskript erhalten bleibt. Nutzen Sie gespeicherte Besprechungsprofile und pausieren Sie, ohne die Sitzung aufzuteilen.

Exportieren Sie Transkripte als Text, Markdown, SRT oder WebVTT. Der optionale lokale Verlauf speichert abgeschlossene Untertitel fortlaufend; Sie können Sitzungen benennen, durchsuchen, erneut öffnen, kopieren, exportieren und löschen. Verlauf und Wiederherstellungskopie sind standardmäßig deaktiviert. Bei Whisper verarbeitet Stopp noch ausstehendes Audio, bevor das Transkript vollständig ist.

Whisper-Audio bleibt auf dem PC; ausstehende Sprache wird in einer automatisch gelöschten temporären Datei gepuffert. Cloud-Audio geht direkt an den gewählten Anbieter. API-Schlüssel liegen in der Windows-Anmeldeinformationsverwaltung. Der Entwickler erhält weder Audio noch Schlüssel, Transkripte oder Telemetrie. Die App verkauft keine Abonnements, Guthaben oder API-Zugänge.

Die Oberfläche ist auf Deutsch, Englisch und Französisch verfügbar, unabhängig von der Untertitelsprache. Das Bedienfenster lässt sich per Tastatur und mit der Sprachausgabe bedienen und folgt der Windows-Textgröße und den Kontrastdesigns. Eine optionale skriptbasierte Demo auf Englisch und Französisch zeigt die Anzeigefunktionen ohne Einrichtung; sie erkennt keine Sprache.

Erfordert Windows 11 und die Microsoft Edge WebView2-Runtime. Native x64- und ARM64-Pakete sind verfügbar. Auf x64 benötigt Whisper einen Prozessor mit AVX2; die Cloud-Engines funktionieren auch ohne. Laden Sie vor der Offline-Nutzung ein Whisper-Modell herunter und erlauben Sie den Zugriff auf die ausgewählte Audioquelle. Die Aufnahme einer Anwendung umfasst ihre Unterprozesse und Benachrichtigungen und kann mehrere Browser-Tabs einschließen.
```

### Funktionen — eine Funktion pro Zeile

```text
Offline-Untertitel mit Whisper: 99 gesprochene Sprachen oder automatische Erkennung
Tiny, Base oder Small herunterladen und danach ohne Konto, API-Schlüssel oder Internet transkribieren
Offline-Übersetzung ins Englische mit Whisper aus allen 99 Sprachen, ohne API-Schlüssel
Cloud-Übersetzung mit eigenem Gemini- oder OpenAI-Schlüssel; nutzungsabhängige Kosten möglich
Zwei Übersetzungssprachen gleichzeitig und optional der verfügbare Originaltext
Mikrofon, Systemaudio, eine Anwendung mit Unterprozessen oder Mikrofon und Systemaudio gemeinsam
Transparente, durchklickbare Untertitel im Vordergrund über Folien und Videoanrufen
Das Overlay öffnet sich dort, wo Sie es zuletzt platziert haben, für jede Bildschirmanordnung
An Fenster anpassen, Kompakt und Ruhiger Lesemodus; anpassbare Darstellung und Text von rechts nach links
Pause und Fortsetzen, Besprechungsprofile, Sprachsuche und Favoriten
Bearbeitbarer Füllwortfilter für das Overlay; das Originaltranskript bleibt erhalten
Export als Text, Markdown, SRT und WebVTT, einschließlich verfügbarem Originaltext
Optionaler lokaler Transkriptverlauf mit Titeln, Suche, erneutem Öffnen und Löschen
Tastenkombinationen und Unterstützung der Sprachausgabe; folgt Windows-Textgröße und Kontrastdesigns
Oberfläche auf Deutsch, Englisch und Französisch; native Windows-Versionen für x64 und ARM64
```

### Kurzbeschreibung

```text
Untertitel über Meetings, Anrufen und Folien. Mit Whisper offline in 99 Sprachen transkribieren oder ins Englische übersetzen, andere Sprachen per Cloud mit eigenem API-Schlüssel. Mikrofon oder App-Audio erfassen, zwei Sprachen anzeigen und Transkripte exportieren.
```

### Neu in dieser Version — 1.7.1

```text
Offline ins Englische übersetzen: Lokales Whisper übersetzt Sprache in jeder seiner 99 Sprachen jetzt direkt auf Ihrem PC in englische Untertitel, ohne Konto, API-Schlüssel oder Internetverbindung, sobald ein Modell heruntergeladen ist. Wählen Sie das Modell Small; Tiny und Base übersetzen schlecht.

Das Overlay öffnet sich wieder dort, wo Sie es zuletzt platziert haben, gespeichert für jede Bildschirmanordnung, und behält seine Größe beim Verschieben zwischen Bildschirmen mit unterschiedlicher Skalierung. Wird der Projektor während einer Sitzung getrennt, wechselt es auf einen verbundenen Bildschirm.

Cloud-Sitzungen verbinden sich selbstständig neu, wenn ein Anbieter die Verbindung trennt, einen vorübergehenden Fehler meldet oder das Netzwerk hängt, und Gemini wartet bei Pause oder Stopp auf die Übersetzung der letzten Wörter. Whisper ist schneller, in unseren ARM64-Tests etwa doppelt so schnell, lädt Modelle über den Windows-Proxy herunter und zeigt die letzten Wörter vor einer Pause sofort an. Auf x64 benötigt Whisper jetzt einen Prozessor mit AVX2.

Das App-Symbol erscheint in der Taskleiste und im Startmenü jetzt ohne farbiges Quadrat dahinter.

Außerdem: Unterstützung für 24-Bit-Mikrofone, beide Untertitelsprachen im Verlauf, ein gespeichertes Exportformat, schnelleres Beenden bei langem Whisper-Rückstand und Korrekturen beim Audiotest und bei den Beschriftungen für die Sprachausgabe.
```

## Adding the German listing

The interface supports German. Before publishing a German listing, review the German copy
and capture the final packaged app with its interface set to German. Existing English and
French images are historical too; see the [screenshot plan](store-screenshots/README.md).

## Additional system requirements

Enter each line as a separate requirement (under 200 characters):

```text
Windows 11 with Microsoft Edge WebView2 Runtime; native x64 and ARM64 packages
Whisper: internet for the initial model download (31–182 MiB), then offline transcription or translation into English on the CPU
Whisper on x64 needs a processor with AVX2, which some budget Celeron and Pentium Silver PCs lack
Cloud engines: internet, your own compatible provider account and API key; usage charges may apply
Audio-source access required for speech recognition; a microphone is needed only for microphone capture
```

Recommended memory: 8 GB. Whisper speed depends on the CPU and model; this is not a guarantee
of real-time processing on all supported hardware. Localized requirements:

### Configuration supplémentaire — français

```text
Windows 11 et Microsoft Edge WebView2 Runtime ; paquets x64 et ARM64 natifs
Whisper : Internet pour télécharger le modèle (31–182 Mio), puis transcription ou traduction vers l'anglais hors ligne sur le processeur
Whisper sur x64 nécessite un processeur compatible AVX2, absent de certains PC Celeron et Pentium Silver d'entrée de gamme
Moteurs cloud : Internet, votre compte et clé API compatibles ; des frais d'utilisation peuvent s'appliquer
Accès à la source audio pour la reconnaissance ; microphone nécessaire uniquement pour la capture du micro
```

### Zusätzliche Systemanforderungen — deutsch

```text
Windows 11 mit Microsoft Edge WebView2-Runtime; native Pakete für x64 und ARM64
Whisper: Internet für den Modelldownload (31–182 MiB), danach Offline-Transkription oder Übersetzung ins Englische auf der CPU
Whisper auf x64 erfordert einen Prozessor mit AVX2; manche günstigen Celeron- und Pentium-Silver-PCs haben keinen
Cloud-Engines: Internet, eigenes kompatibles Konto und API-Schlüssel; nutzungsabhängige Kosten möglich
Zugriff auf die Audioquelle für Spracherkennung; ein Mikrofon ist nur für Mikrofonaufnahme erforderlich
```

## Notes for certification

```text
Product: Live Translation & Subtitles. Product ID: 9PFB8LR3RR9X. Version: 1.7.1.0, native x64 and ARM64. Windows 11 with Edge WebView2 Runtime. Since 1.6.1, the version in the Store, the app has offline Whisper translation into English, an overlay that reopens where it was placed, and cloud sessions that reconnect after a provider error. The test routes below are those of 1.6.1, with a processor note in step 1, a restart check in step 4 and an optional translation route in step 7.

Real speech recognition without a paid account or API key:
1. A clean install opens on Subtitles / Whisper / Base / Detect automatically, with the default microphone selected. No download or capture starts automatically. On an x64 processor without AVX2, Whisper is listed as unavailable with the reason and a clean install opens on Built-in demo instead; use the setup-free check below. Choose the microphone or system audio source. Grant microphone access if using a microphone. Existing saved setups are preserved on upgrade.
2. Choose the spoken language or Detect automatically. Download Tiny (about 31 MiB) for the lightest setup, or Base (about 57 MiB). The initial HTTPS model download needs internet access; the model is not bundled. No account or key is needed.
3. Start captioning and speak a few sentences or play speech on the selected output. Allow for CPU processing time. Verify captions in the operator window and overlay, elapsed time and input levels.
4. Use Move overlay to place it, lock it back to click-through, and try Fit window, Compact and Stable reading. After a restart, the overlay reopens where it was placed. Pause blocks new speech entering recognition; existing pending audio can still finish.
5. Stop and let Finishing the transcript complete. Export text or Markdown, then SRT or WebVTT. Disconnect the network and repeat with the installed model to verify offline operation.
6. In Settings, optionally enable transcript history; run a disposable session and reopen, rename, export and delete it. History and recovery are disabled by default. Test the editable filler-word list: it changes only the overlay.
7. Optional offline translation: choose Translation, then Local Whisper, keep English as the caption language, choose the spoken language or Detect automatically, and download Small (about 182 MiB). Speak or play non-English speech, or click Rehearse to play a bundled French recording with no microphone: English captions appear with no account or key. Tiny and Base also work but translate poorly.

Setup-free display check if capture hardware or model downloads are unavailable:
In Subtitles, select Built-in demo in the engine list, choose English and click Start demo subtitles. The bundled English/French script exercises status, meter animation, timer, overlay, Stop and export without devices, network or credentials. Repeat with French. It is explicitly a scripted demo and does not recognize speech; Whisper above is the first-launch local speech engine.

Optional cloud features:
Gemini/OpenAI translation and Gemini/Mistral subtitles require the user's compatible third-party account and API key and may incur provider charges. The app supplies no cloud account or credits. Keys are entered in the app and kept in Windows Credential Manager. Cloud testing requires suitable test credentials to be arranged separately before submission. Never place a personal key in public listing fields or screenshots. Choose two supported translation targets to check bilingual output; this creates a second provider session per audio source. Original speech is shown only when the provider supplies it.

The full-trust desktop process performs WASAPI/microphone capture, CPU Whisper transcription and translation, user-requested verified model downloads, Credential Manager access, window/overlay management and explicit transcript export. Whisper buffers pending audio in an automatically deleted local temporary file. Cloud engines send audio directly to the selected provider. There is no developer relay, telemetry, driver, service, auto-start task, Windows AI component or required speech language pack.
```

Resolve cloud test credentials or Microsoft reviewer access requirements before submission;
the credential-free Whisper and demo routes do not establish acceptance of cloud features.

## Screenshots

Capture real, non-private sessions from the final MSIX, following the
[screenshot plan](store-screenshots/README.md). These captions describe planned images;
do not upload them against old screenshots. Each caption is under 200 characters.

| Image | English | Français | Deutsch |
| --- | --- | --- | --- |
| 1 — Whisper | Offline captions with Whisper: choose a model, spoken language and audio source. | Sous-titres hors ligne avec Whisper : choisissez un modèle, une langue et une source audio. | Offline-Untertitel mit Whisper: Modell, gesprochene Sprache und Audioquelle auswählen. |
| 2 — Overlay | Keep captions visible over your slides or video call in a transparent, click-through overlay. | Gardez les sous-titres visibles sur vos diapositives ou appels, dans une surimpression traversable par les clics. | Untertitel bleiben über Folien oder Videoanrufen sichtbar, in einem transparenten, durchklickbaren Overlay. |
| 3 — Bilingual | Show two translation languages and include the original speech when the engine supplies it. | Affichez deux langues de traduction et le texte original lorsque le moteur le fournit. | Zwei Übersetzungssprachen anzeigen und den Originaltext einblenden, wenn die Engine ihn liefert. |
| 4 — Reading | Adjust caption appearance and reading pace, with presets and your own filler-word list. | Réglez l'apparence et le rythme de lecture, avec des préréglages et votre liste d'hésitations. | Darstellung und Lesetempo anpassen, mit Voreinstellungen und einer eigenen Füllwortliste. |
| 5 — History | Find a saved session, read its transcript and export text or timed subtitles. | Retrouvez une session, relisez sa transcription et exportez du texte ou des sous-titres minutés. | Gespeicherte Sitzungen finden, Transkripte lesen und Text oder zeitbasierte Untertitel exportieren. |
| 6 — Optional demo | Try the display controls with a scripted English/French demo, without audio capture or setup. | Essayez l'affichage avec une démo scénarisée en français ou en anglais, sans capture audio ni configuration. | Anzeige mit einer englischen oder französischen Skript-Demo ausprobieren, ohne Audioaufnahme oder Einrichtung. |
