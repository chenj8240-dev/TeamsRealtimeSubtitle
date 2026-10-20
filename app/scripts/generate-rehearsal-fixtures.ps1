#Requires -Version 5.1
<#
.SYNOPSIS
    Regenerates the bundled rehearsal-mode speech fixtures.

.DESCRIPTION
    Rehearsal mode plays a bundled recording through the real caption pipeline so the
    overlay, move mode and the transcript export can be exercised with no microphone and no
    sound in the room — for a Store certification tester on a clean virtual machine, and for
    an operator setting up an empty hall. See gate 2 in docs/microsoft-store.md.

    The two WAVs this writes ARE committed (unlike the speech model, which is fetched): they
    are about 600 KB each, and a fixture that has to be downloaded is no use to a tester.
    This script exists so the recordings are reproducible and their wording reviewable, not
    because a build needs to run it.

    The output format is exactly what the pipeline consumes without conversion, and what
    `src-tauri/src/audio/fixture.rs` validates on load: 16 kHz, 16-bit, mono, little-endian
    PCM. The voices are the two that ship in-box on Windows for these languages.

    Run under **Windows PowerShell 5.1** (`powershell.exe`), not PowerShell 7: System.Speech
    is a .NET Framework assembly and `Add-Type -AssemblyName System.Speech` fails on pwsh.

        powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\generate-rehearsal-fixtures.ps1

    Synthesis is deterministic for a given voice and rate, so a re-run reproduces the same
    audio; it should therefore leave `git status` clean unless the text below changed.
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Speech

# Fixture audio format. Mirrors FIXTURE_RATE in src-tauri/src/audio/fixture.rs.
$sampleRate = 16000
$bitsPerSample = 16

# Neutral, evergreen wording: no product or company names, no dates, nothing that ties a
# recording to one event — these ship in the installer and are heard by strangers.
$fixtures = @(
    [pscustomobject]@{
        FileName = 'rehearsal-en.wav'
        Voice    = 'Microsoft Zira Desktop'
        Text     = "This is a rehearsal recording for the live caption system. A speaker is presenting to an audience, and every sentence is transcribed and shown on screen as it is spoken. Captions appear a moment after the words, and are corrected once the sentence becomes clear. Use this recording to check the overlay before the room fills up."
    },
    [pscustomobject]@{
        FileName = 'rehearsal-fr.wav'
        Voice    = 'Microsoft Hortense Desktop'
        Text     = "Ceci est un enregistrement de répétition pour le système de sous-titres en direct. Une oratrice s'adresse à un public, et chaque phrase est transcrite puis affichée à l'écran. Les sous-titres apparaissent juste après les mots, puis sont corrigés lorsque la phrase devient claire. Utilisez cet enregistrement pour régler l'affichage avant l'arrivée du public."
    }
)

function New-SpeechFixture {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$VoiceName,
        [Parameter(Mandatory)][string]$Text
    )

    $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
    try {
        $synth.SelectVoice($VoiceName)
        # Pinned rather than left at whatever the machine's defaults are, so the duration of
        # a regenerated fixture matches the committed one.
        $synth.Rate = 0
        $synth.Volume = 100

        $format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo -ArgumentList @(
            $sampleRate,
            [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
            [System.Speech.AudioFormat.AudioChannel]::Mono
        )
        $synth.SetOutputToWaveFile($Path, $format)
        $synth.Speak($Text)
        # Releases the file handle; disposing alone can leave the WAV header unfinalised.
        $synth.SetOutputToNull()
    }
    finally {
        $synth.Dispose()
    }
}

function Get-WaveInfo {
    <#
        Parses the RIFF header the same way the Rust loader does — walking the chunk list
        rather than assuming a fixed 44-byte header — so a malformed fixture is caught here
        rather than at run time on a tester's machine. Deliberately does not play anything.
    #>
    param([Parameter(Mandatory)][string]$Path)

    $bytes = [System.IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -lt 12) { throw "$Path is too short to be a RIFF file" }
    if ([System.Text.Encoding]::ASCII.GetString($bytes, 0, 4) -ne 'RIFF') { throw "$Path has no RIFF tag" }
    if ([System.Text.Encoding]::ASCII.GetString($bytes, 8, 4) -ne 'WAVE') { throw "$Path is not a WAVE file" }

    $formatTag = 0
    $channels = 0
    $rate = 0
    $bits = 0
    $dataBytes = 0

    $offset = 12
    while (($offset + 8) -le $bytes.Length) {
        $id = [System.Text.Encoding]::ASCII.GetString($bytes, $offset, 4)
        $size = [int][System.BitConverter]::ToUInt32($bytes, $offset + 4)
        $body = $offset + 8
        if (($body + $size) -gt $bytes.Length) { throw "$Path is truncated inside the '$id' chunk" }

        switch ($id) {
            'fmt ' {
                if ($size -lt 16) { throw "$Path has a $size-byte fmt chunk" }
                $formatTag = [System.BitConverter]::ToUInt16($bytes, $body)
                $channels = [System.BitConverter]::ToUInt16($bytes, $body + 2)
                $rate = [int][System.BitConverter]::ToUInt32($bytes, $body + 4)
                $bits = [System.BitConverter]::ToUInt16($bytes, $body + 14)
            }
            'data' { $dataBytes = $size }
        }
        # Chunks are word-aligned: an odd size is followed by a pad byte.
        $offset = $body + $size + ($size % 2)
    }

    if ($formatTag -ne 1) { throw "$Path is not uncompressed PCM (format tag $formatTag)" }
    if ($channels -ne 1) { throw "$Path has $channels channels, expected mono" }
    if ($rate -ne $sampleRate) { throw "$Path is $rate Hz, expected $sampleRate Hz" }
    if ($bits -ne $bitsPerSample) { throw "$Path is $bits-bit, expected $bitsPerSample-bit" }
    if ($dataBytes -le 0) { throw "$Path carries no audio data" }

    [pscustomobject]@{
        Bytes    = $bytes.Length
        Seconds  = [math]::Round($dataBytes / ($rate * ($bits / 8)), 2)
        Channels = $channels
        Rate     = $rate
        Bits     = $bits
    }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $repoRoot 'src-tauri\resources\fixtures'
if (-not (Test-Path $outputDir)) { New-Item -ItemType Directory -Path $outputDir | Out-Null }

foreach ($fixture in $fixtures) {
    $path = Join-Path $outputDir $fixture.FileName
    New-SpeechFixture -Path $path -VoiceName $fixture.Voice -Text $fixture.Text
    $info = Get-WaveInfo -Path $path

    # A fixture much shorter than this says nothing useful; much longer bloats the package
    # and makes a tester wait for the loop point.
    if ($info.Seconds -lt 15 -or $info.Seconds -gt 30) {
        throw "$($fixture.FileName) is $($info.Seconds)s; expected roughly 20s — adjust the text"
    }

    Write-Output ("{0}: {1}s, {2} KB, {3} Hz {4}-bit mono ({5})" -f `
            $fixture.FileName, $info.Seconds, [math]::Round($info.Bytes / 1024), $info.Rate, $info.Bits, $fixture.Voice)
}
