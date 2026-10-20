// The two things the suite needs from Windows itself rather than from the pages: closing the
// operator window the way its title-bar X does, and finding e2e instances a previous run left
// behind. Windows PowerShell rather than a native module, so nothing new has to be installed;
// it ships with every Windows, the runner included.

import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

async function powershell(script: string, env: Record<string, string>): Promise<string> {
	const encoded = Buffer.from(script, 'utf16le').toString('base64');
	const { stdout } = await run(
		'powershell.exe',
		['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
		// Values travel as variables, not spliced into the script: the title contains `&`.
		{ env: { ...process.env, ...env }, windowsHide: true, timeout: 60_000 }
	);
	return stdout;
}

// WM_SYSCOMMAND with SC_CLOSE is what the frame's X button and Alt+F4 send. Windows turns it
// into WM_CLOSE, which Tauri reports as `CloseRequested` — the event `lifecycle::CloseGuard`
// intercepts. Posted, not sent, so this returns at once and the app answers in its own time.
const CLOSE_WINDOW = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class E2eWindows {
	delegate bool EnumProc(IntPtr hwnd, IntPtr param);
	[DllImport("user32.dll")] static extern bool EnumWindows(EnumProc proc, IntPtr param);
	[DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
	[DllImport("user32.dll", CharSet = CharSet.Unicode)]
	static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int max);
	[DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
	[DllImport("user32.dll")] static extern bool PostMessage(IntPtr hwnd, uint msg, IntPtr w, IntPtr l);
	public static int Close(uint pid, string title) {
		int posted = 0;
		EnumWindows((hwnd, param) => {
			uint owner;
			GetWindowThreadProcessId(hwnd, out owner);
			if (owner != pid || !IsWindowVisible(hwnd)) return true;
			var text = new StringBuilder(512);
			GetWindowText(hwnd, text, text.Capacity);
			if (text.ToString() == title && PostMessage(hwnd, 0x0112, (IntPtr)0xF060, IntPtr.Zero)) posted++;
			return true;
		}, IntPtr.Zero);
		return posted;
	}
}
'@
$posted = [E2eWindows]::Close([uint32]$env:E2E_PID, $env:E2E_TITLE)
if ($posted -ne 1) { throw "Expected one visible window titled '$env:E2E_TITLE', closed $posted" }
`;

/** Ask a window of process `pid` to close, as a click on its X would. */
export async function requestWindowClose(pid: number, title: string): Promise<void> {
	await powershell(CLOSE_WINDOW, { E2E_PID: String(pid), E2E_TITLE: title });
}

// The app's processes and their windows, for a launch that never opened its DevTools port.
// From outside, a WebView2 that never started, one started without the port on its command
// line and a message box (`assert_webview_runtime` in lib.rs) all look the same: a quiet app.
const DESCRIBE_APP = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class E2eWindowList {
	delegate bool EnumProc(IntPtr hwnd, IntPtr param);
	[DllImport("user32.dll")] static extern bool EnumWindows(EnumProc proc, IntPtr param);
	[DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
	[DllImport("user32.dll", CharSet = CharSet.Unicode)]
	static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int max);
	[DllImport("user32.dll", CharSet = CharSet.Unicode)]
	static extern int GetClassName(IntPtr hwnd, StringBuilder text, int max);
	[DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
	public static List<string> Of(uint[] pids) {
		var found = new List<string>();
		EnumWindows((hwnd, param) => {
			uint owner;
			GetWindowThreadProcessId(hwnd, out owner);
			if (Array.IndexOf(pids, owner) < 0) return true;
			var title = new StringBuilder(512);
			var kind = new StringBuilder(256);
			GetWindowText(hwnd, title, title.Capacity);
			GetClassName(hwnd, kind, kind.Capacity);
			found.Add(String.Format("window of {0}, {1}, class {2}: \"{3}\"", owner,
				IsWindowVisible(hwnd) ? "visible" : "hidden", kind, title));
			return true;
		}, IntPtr.Zero);
		return found;
	}
}
'@
$all = @(Get-CimInstance Win32_Process)
$ids = @([uint32]$env:E2E_PID)
do {
	$count = $ids.Count
	$children = $all | Where-Object { $ids -contains $_.ParentProcessId } | ForEach-Object { [uint32]$_.ProcessId }
	$ids = @($ids + $children | Select-Object -Unique)
} while ($ids.Count -gt $count)
"this shell runs in session $((Get-Process -Id $PID).SessionId)"
$runtime = 'HKLM:\SOFTWARE\WOW6432Node', 'HKCU:\SOFTWARE' |
	ForEach-Object { Get-ItemProperty "$_\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" -ErrorAction SilentlyContinue } |
	Select-Object -First 1
"WebView2 runtime: $(if ($runtime) { $runtime.pv } else { 'not registered' })"
foreach ($p in $all | Where-Object { $ids -contains $_.ProcessId }) {
	"process $($p.ProcessId) $($p.Name), parent $($p.ParentProcessId), session $($p.SessionId): $($p.CommandLine)"
}
[E2eWindowList]::Of([uint32[]]$ids)
`;

/** The process `pid`, its descendants with their command lines, and every window they own. */
export async function describeApp(pid: number): Promise<string> {
	return powershell(DESCRIBE_APP, { E2E_PID: String(pid) }).then(
		(text) => text.trim(),
		(error: unknown) => `could not describe the app: ${String(error)}`
	);
}

// The WebView2 browser process carries the profile on its command line, so it names its host
// even when nothing else does: renderers have `--type=`, the browser process does not.
const FIND_INSTANCES = String.raw`
$ErrorActionPreference = 'Stop'
$found = @(Get-CimInstance Win32_Process -Filter "Name = 'msedgewebview2.exe'" |
	Where-Object { $_.CommandLine -and $_.CommandLine.Contains($env:E2E_PROFILE) -and -not $_.CommandLine.Contains('--type=') } |
	ForEach-Object {
		$parent = Get-CimInstance Win32_Process -Filter "ProcessId = $($_.ParentProcessId)"
		[pscustomobject]@{ browser = $_.ProcessId; host = $_.ParentProcessId; hostPath = $parent.ExecutablePath }
	})
ConvertTo-Json -InputObject $found -Compress
`;

interface Instance {
	browser: number;
	host: number;
	hostPath: string | null;
}

export async function killTree(pid: number): Promise<void> {
	await run('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }).catch(() => {});
}

/**
 * Stop e2e instances an interrupted run left behind. Two reasons: the single-instance lock
 * makes a second launch hand over to the first and exit, and a running WebView2 holds the
 * profile folder that the next test has to delete. Only what is provably the e2e app goes: a
 * WebView2 on the e2e profile, and its host only when that is the e2e exe itself, since a host
 * that died long ago may have handed its process id to something unrelated.
 */
export async function stopStrayInstances(profile: string, exe: string): Promise<void> {
	// The query below costs a second on an idle machine and much more on a busy one, so first
	// the cheap question: is any process running this exe's image at all? With no match,
	// tasklist prints a localised note instead of a row.
	const image = path.basename(exe);
	const { stdout } = await run('tasklist', ['/FI', `IMAGENAME eq ${image}`, '/FO', 'CSV', '/NH'], {
		windowsHide: true
	});
	if (!stdout.toLowerCase().includes(`"${image.toLowerCase()}"`)) return;

	const output = await powershell(FIND_INSTANCES, { E2E_PROFILE: profile + path.sep });
	const instances = JSON.parse(output.trim() || '[]') as Instance[];
	for (const { browser, host, hostPath } of instances) {
		if (hostPath && path.resolve(hostPath).toLowerCase() === path.resolve(exe).toLowerCase()) {
			await killTree(host);
		}
		await killTree(browser);
	}
}
