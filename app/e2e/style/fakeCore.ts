// A stand-in for the Rust core, installed in a real browser page.
//
// The browser half is modelled on `@tauri-apps/api/mocks` (`mockIPC(cb, { shouldMockEvents:
// true })` plus `mockWindows`): it puts `__TAURI_INTERNALS__` on the window before the app
// loads, so `isTauri()` is true and the real `tauri.ts` runs, and it keeps the event plugin's
// listeners in the page. It is written out here rather than imported because an init script
// has to be self-contained: Playwright sends it to the page as source text.
//
// Every other command crosses to Node through `page.exposeFunction` and is answered from a
// table that starts as the Vitest mock's (`src/lib/testing/idleCore.ts`). A test plays the
// core's part the same way the Vitest page tests do: it answers commands, and emits events
// the way `src-tauri` does once the window is listening for them.

import type { Page } from '@playwright/test';
import { IDLE_CORE, type CommandHandler } from '../../src/lib/testing/idleCore';

/** What the init script leaves on the window for the Node half. */
interface CoreHandle {
	emit(event: string, payload: unknown): void;
	listening(event: string): number;
}

declare global {
	interface Window {
		__fakeCore?: CoreHandle;
		__fakeCoreInvoke?: (cmd: string, args: Record<string, unknown>) => Promise<unknown>;
	}
}

/** The browser half. Runs before any of the app's scripts, in every document the page loads. */
function installCore(label: string): void {
	type Callback = (data: unknown) => unknown;
	type Args = Record<string, unknown>;
	const callbacks = new Map<number, Callback>();
	const listeners = new Map<string, number[]>();
	let nextId = 1;

	function transformCallback(callback?: Callback, once = false): number {
		const id = nextId++;
		callbacks.set(id, (data) => {
			if (once) callbacks.delete(id);
			return callback?.(data);
		});
		return id;
	}
	const unregisterCallback = (id: number) => void callbacks.delete(id);
	const runCallback = (id: number, data: unknown) => void callbacks.get(id)?.(data);

	// As the core delivers an event: to every listener, with the listener's id beside it.
	function deliver(event: string, payload: unknown) {
		for (const id of [...(listeners.get(event) ?? [])]) runCallback(id, { event, id, payload });
	}

	async function invoke(cmd: string, args: Args = {}): Promise<unknown> {
		const event = String(args.event);
		switch (cmd) {
			case 'plugin:event|listen': {
				const handler = Number(args.handler);
				listeners.set(event, [...(listeners.get(event) ?? []), handler]);
				return handler;
			}
			case 'plugin:event|unlisten':
				listeners.set(
					event,
					(listeners.get(event) ?? []).filter((id) => id !== Number(args.eventId))
				);
				return null;
			// The operator window emits to the overlay; there is no overlay here, so it reaches
			// whatever this window listens for, as `mockIPC` does.
			case 'plugin:event|emit':
				deliver(event, args.payload);
				return null;
		}
		return window.__fakeCoreInvoke!(cmd, args);
	}

	Object.assign(window, {
		__TAURI_INTERNALS__: {
			invoke,
			transformCallback,
			unregisterCallback,
			runCallback,
			callbacks,
			metadata: {
				currentWindow: { label },
				currentWebview: { windowLabel: label, label }
			}
		},
		__TAURI_EVENT_PLUGIN_INTERNALS__: {
			unregisterListener: (_event: string, id: number) => unregisterCallback(id)
		},
		__fakeCore: {
			emit: deliver,
			listening: (event: string) => listeners.get(event)?.length ?? 0
		} satisfies CoreHandle
	});
}

export class FakeCore {
	/** Every command the window invoked, in order. Event plumbing is not included. */
	readonly calls: { cmd: string; args: Record<string, unknown> }[] = [];
	private readonly handlers = new Map<string, CommandHandler>(Object.entries(IDLE_CORE));

	private constructor(private readonly page: Page) {}

	/** Put the core in `page` as the window labelled `label`. Call before the first `goto`:
	 *  the operator page decides whether it is in the desktop app as it initialises. */
	static async install(page: Page, label = 'operator'): Promise<FakeCore> {
		const core = new FakeCore(page);
		await page.exposeFunction('__fakeCoreInvoke', (cmd: string, args: Record<string, unknown>) =>
			core.answer(cmd, args)
		);
		await page.addInitScript(installCore, label);
		return core;
	}

	private async answer(cmd: string, args: Record<string, unknown>): Promise<unknown> {
		this.calls.push({ cmd, args });
		return (await this.handlers.get(cmd)?.(args)) ?? null;
	}

	/** Answer `cmd` with `handler` from now on. */
	handle(cmd: string, handler: CommandHandler): void {
		this.handlers.set(cmd, handler);
	}

	/** The arguments of each call to `cmd`, in order. */
	callsTo(cmd: string): Record<string, unknown>[] {
		return this.calls.filter((call) => call.cmd === cmd).map((call) => call.args);
	}

	/** Emit an event as the core does, once the window has subscribed to it: the page
	 *  subscribes asynchronously, and an event sent before that is one nobody hears. */
	async emit(event: string, payload: unknown = null): Promise<void> {
		await this.page.waitForFunction((name) => (window.__fakeCore?.listening(name) ?? 0) > 0, event);
		await this.page.evaluate(([name, value]) => window.__fakeCore!.emit(name, value), [
			event,
			payload
		] as const);
	}
}
