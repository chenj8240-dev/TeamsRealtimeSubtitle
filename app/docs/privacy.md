# Privacy Policy — Live Translation & Subtitles

**Effective date:** 7 October 2026 (documents the 1.7.0 release)

## What this app is

Live Translation & Subtitles is a Windows desktop application with three kinds of operation:

- local multilingual speech transcription, or translation into English, using Whisper on the
  user’s computer;
- optional cloud speech captioning or translation through a provider selected and configured
  by the user: Google Gemini, OpenAI, or Mistral; and
- a scripted demonstration of the caption display, overlay, timer, level meter, transcript
  and export workflow.

The built-in demonstration is explicitly labeled as a demonstration. It does not capture or
recognize speech.

## Audio

The built-in demonstration does not open a microphone or system-audio device. Its simulated
level data and English/French caption text are bundled inside the application and remain on the
device.

When a live provider is selected, the app captures only the audio source selected by the user:
a chosen microphone, Windows system audio, or both. With a cloud provider, audio is processed
in memory and streamed directly to that provider for the duration of the session. System capture can use
all audio on a selected output or only the selected application and its child processes.
The latter includes that application’s notifications and may include several browser tabs.
Application titles and process identities are used locally to select the source, not sent
to the speech provider. Cloud captioning does not write captured audio to disk.

With **local Whisper**, audio is processed on the computer and is never uploaded. Pending audio
is buffered in a temporary file so a slower recognizer can catch up without silently losing
speech. This file is local, is not a saved recording, and is automatically deleted when its
handle closes, including when the process exits. It is not an encrypted audio archive or a
recoverable recording. Stop finishes the remaining audio; explicitly discarding the backlog,
or closing the app before it has finished, keeps captions already produced but leaves the
transcript incomplete. Pause excludes newly captured audio from recognition and temporary
storage while metering remains active.

Whisper model files are downloaded only when the user chooses **Download model**. Downloads
contact Hugging Face and its file-delivery infrastructure, which receive ordinary network
request information such as the user's IP address. No captured audio, captions or provider
key is included. When a proxy server is set in Windows Settings (or through the
`HTTPS_PROXY`/`HTTP_PROXY` variables), downloads go through it, so it sees the same request
information. While downloading, the file is held as `<model>.part` in the models folder; it is
deleted if the download fails or is cancelled, or at the start of the next download if the app
was closed mid-way. The app verifies model size and SHA-256 before installation and before use.
Models remain under the application's local-data `whisper-models` folder until removed through
the model controls. Once installed, local transcription and translation need no network
connection.

## Captions and transcripts

Caption text is held in memory while the app runs, and the whole session is kept: the transcript
is never shortened or discarded behind the user's back. A transcript is written to disk only when
the user explicitly chooses to save it, or through the optional recovery copy or session history described below.
The app does not automatically upload saved transcripts.

The overlay keeps a bounded amount of reading context in memory so that a larger window can
show more captions. Stable reading drops the oldest hidden lines as its buffer fills. Text removed from the overlay by resizing or its idle timeout remains
in the full session transcript. The layout feature creates no additional disk history or
network requests.

Closing the app with unsaved caption text asks whether to save or discard it first.

## Optional local recovery copy

Recovery is **off by default**. When the user switches on *Keep a local recovery copy while
captioning*, the app periodically writes the finalized caption lines of the current session to a
single file in its own local application-data folder on the same PC:

`%LOCALAPPDATA%\io.github.fmadore.live-translation\recovery\transcript.json`

- It contains finalized caption text only — no audio, no API key, no provider identity, and no
  device name.
- It is never uploaded, transmitted, or shared. The developer operates no service that could
  receive it.
- There is one file and no history: each write replaces the previous one.
- It is deleted as soon as the transcript is saved, the log is cleared, the unsaved-transcript
  prompt is answered, the recovery option is switched off, or a recovered transcript is restored
  or refused at the next launch.
- If the app is closed cleanly, no recovery file remains. One is only ever found at startup after
  a crash or a power cut, and the user is asked whether to restore or delete it.

Deleting the file by hand at any time is safe and removes the data.

## Optional transcript history

History is **off by default**. Enabling *Automatically save sessions locally* progressively
saves finalized raw caption lines from that point onward, in one file per session under:

`%LOCALAPPDATA%\io.github.fmadore.live-translation\history\<session-id>.json`

Each session contains its optional user-entered title, start time, duration through the last save, output mode, known
language information, and raw translated/source text with cue timing. Automatically detected
source languages are marked as such; the app does not guess which language was spoken.
No audio, credentials, application identity or device name is included.

History remains after export, clearing the current transcript, clean shutdown, and disabling
history. Disabling stops further saves; delete unwanted sessions in Transcript history.
Deletion is permanent and requires confirmation. Files are local, unencrypted, and never
automatically uploaded. There is no automatic expiry. An interrupted session remains readable
through its last completed save. Clearing the recovery copy does not delete history.

*Hide filler words* is an optional overlay display filter. Its word list is edited by the
operator and stored only on this device. Raw text in the transcript, history, recovery copy
and exports remains unchanged. It introduces no network requests.

## API keys

No API key is needed for local Whisper or the built-in demonstration. Optional provider keys are stored in
Windows Credential Manager and read only by the native application core. A key is sent only to
the provider that issued it to authenticate the live connection. The developer does not receive,
copy, proxy, or store provider keys.

## Preferences stored on the device

The app locally stores ordinary interface preferences, including the last selected mode,
provider, Whisper model and spoken language, audio source, language, overlay position and size
for up to eight display arrangements (each recorded as its displays' positions, resolutions and
scaling, so the overlay reopens where it was placed on them), caption size,
layout (Fit window, Compact or Stable reading),
compact line width, caption persistence and update pace, filler-word cleanup and its word list, whether transcript history or the optional recovery
copy is enabled, and whether closing the window leaves the app running in the notification area.
The app also remembers the folder of the last successful transcript export, the chosen export
format, and whether system capture uses an output or an application. The selected process identity is not
persisted; choose the application again after relaunch.
Named meeting profiles additionally store the selected setup, audio device identifiers,
appearance and overlay rectangle locally in the app's webview storage. Profiles contain no
API key, captured audio or caption text. Selected application process identities and rehearsal
mode are not saved. Profiles remain until deleted with confirmation in Meeting profiles.

Raw transcripts preserve the text returned by the provider. Gemini Smart transcription can
remove hesitations and resolve spoken corrections before that text reaches this app; turning
off the local overlay filter does not switch off provider-side cleanup.

## Running in the notification area

The app does not start with Windows and does not run as a background service. It appears in the
notification area only while it is running, and closing the window quits it unless the user turns
on *Keep running in the tray when I close this window*. With that on, the first time the window
is hidden the app says so explicitly, and quitting from the notification-area icon stops any
active capture before it exits.

## What the developer collects

The developer operates no server, relay, account system, telemetry, advertising, analytics, or
crash-reporting service for this app. The developer receives no audio, captions, transcripts,
API keys, device identifiers, or usage data from the application.

## Third-party processing

Starting a cloud session sends audio directly to the chosen provider under the user’s relationship
with that provider. Their terms and privacy policies apply:

- [Google Privacy Policy](https://policies.google.com/privacy)
- [OpenAI Privacy Policy](https://openai.com/policies/privacy-policy/)
- [Mistral AI Privacy Policy](https://mistral.ai/terms/#privacy-policy)

The built-in demonstration and local Whisper, transcribing or translating, contact none of these
speech services.
Model downloads are covered by the [Hugging Face privacy policy](https://huggingface.co/privacy).

## Children

The app is not directed to children and the developer knowingly collects no personal information
from children.

## Changes to this policy

Material changes will be published with a new effective date. The policy applicable to a release
is included with its Store listing and repository documentation.

## Contact

For privacy questions, use the publisher support contact shown on the Microsoft Store listing for
Live Translation & Subtitles (Product ID `9PFB8LR3RR9X`).
