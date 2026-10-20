// A stand-in for the Rust core, for tests that render a whole window.
//
// Built on Tauri's own `@tauri-apps/api/mocks` rather than on `vi.mock('./tauri')`, so the
// real `tauri.ts` runs: `isTauri()` is true, every command goes through `invoke` under its
// real name with its real arguments, and events reach the page through the real `listen`. A
// test plays the core's part by answering commands and emitting events the way `src-tauri`
// does, and can then check what the window asked of it.
//
// Test-only. Nothing outside a `*.test.ts` file imports this, so it never reaches the bundle.

import { clearMocks, mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { emit } from '@tauri-apps/api/event';
import type { InvokeArgs, InvokeOptions } from '@tauri-apps/api/core';
import { vi } from 'vitest';
import { IDLE_CORE, type CommandHandler } from './idleCore';

export interface TauriMock {
	/** Every command the window invoked, in order. Event plumbing is not included. */
	readonly calls: readonly { cmd: string; args: Record<string, unknown> }[];
	/** The arguments of each call to `cmd`, in order. */
	callsTo(cmd: string): Record<string, unknown>[];
	/** Answer `cmd` with `handler` from now on. */
	handle(cmd: string, handler: CommandHandler): void;
	/** Emit an event as the core does, once the window has subscribed to it. */
	emit(event: string, payload?: unknown): Promise<void>;
	/** Take the mock down. Unmount the component first: its teardown unsubscribes through it. */
	dispose(): Promise<void>;
}

type Invoke = (cmd: string, args?: InvokeArgs, options?: InvokeOptions) => Promise<unknown>;
type TauriGlobals = {
	__TAURI_INTERNALS__?: { invoke: Invoke };
	__TAURI_EVENT_PLUGIN_INTERNALS__?: unknown;
};

/** Install the mock as the window labelled `label`. Call before rendering: the operator page
 *  decides whether it is in the desktop app as it initialises. */
export function mockTauri(label = 'operator'): TauriMock {
	const handlers = new Map(Object.entries(IDLE_CORE));
	const calls: { cmd: string; args: Record<string, unknown> }[] = [];
	const subscribers = new Map<string, number>();

	mockWindows(label);
	mockIPC(
		(cmd, payload) => {
			const args = (payload ?? {}) as Record<string, unknown>;
			calls.push({ cmd, args });
			return handlers.get(cmd)?.(args) ?? null;
		},
		{ shouldMockEvents: true }
	);

	// `mockIPC` keeps its event listeners to itself. The window subscribes asynchronously, so
	// the harness counts subscriptions on their way in, and `emit` waits until one exists
	// rather than sending an event nobody can hear yet.
	const globals = window as unknown as TauriGlobals;
	const internals = globals.__TAURI_INTERNALS__!;
	const mocked = internals.invoke;
	internals.invoke = (cmd, args, options) => {
		const event = (args as { event?: unknown } | undefined)?.event;
		if (typeof event === 'string') {
			const count = subscribers.get(event) ?? 0;
			if (cmd === 'plugin:event|listen') subscribers.set(event, count + 1);
			if (cmd === 'plugin:event|unlisten') subscribers.set(event, Math.max(0, count - 1));
		}
		return mocked(cmd, args, options);
	};

	return {
		calls,
		callsTo: (cmd) => calls.filter((call) => call.cmd === cmd).map((call) => call.args),
		handle(cmd, handler) {
			handlers.set(cmd, handler);
		},
		async emit(event, payload = null) {
			await vi.waitFor(() => {
				if (!subscribers.get(event)) throw new Error(`nothing listens for "${event}" yet`);
			});
			await emit(event, payload);
		},
		async dispose() {
			// A page unsubscribes in a promise chain after it unmounts; let that finish against
			// the mock before taking it away.
			await new Promise((resolve) => setTimeout(resolve, 0));
			clearMocks();
			// `clearMocks` leaves the globals themselves in place, which would keep `isTauri()`
			// true for whichever test runs next in this window.
			delete globals.__TAURI_INTERNALS__;
			delete globals.__TAURI_EVENT_PLUGIN_INTERNALS__;
		}
	};
}
