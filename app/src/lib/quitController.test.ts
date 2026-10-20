import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	acknowledgeClose: vi.fn(),
	endsLiveSession: vi.fn(),
	prepareClose: vi.fn(),
	resolveClose: vi.fn(),
	showOperator: vi.fn(),
	hideToTray: vi.fn()
}));
vi.mock('./quit', () => mocks);
vi.mock('./tauri', () => ({ isTauri: () => false, api: mocks }));
import { createQuitController } from './quitController.svelte';
import { closeToTray } from './stores';

beforeEach(() => {
	vi.resetAllMocks();
	closeToTray.set(false);
	mocks.prepareClose.mockResolvedValue({ prompt: true, endedSession: true });
});

it('acknowledges repeated close requests without repeating the shutdown', async () => {
	const controller = createQuitController({ stop: vi.fn(), toggleOverlayVisible: vi.fn() });
	await controller.onCloseRequested();
	await controller.onCloseRequested();
	expect(mocks.acknowledgeClose).toHaveBeenCalledTimes(2);
	expect(mocks.prepareClose).toHaveBeenCalledTimes(1);
	expect(controller.closePrompt).toBe(true);
});

it('asks before stopping a live session, then retains unsaved text on save failure', async () => {
	mocks.endsLiveSession.mockReturnValue(true);
	const controller = createQuitController({ stop: vi.fn(), toggleOverlayVisible: vi.fn() });
	await controller.onTrayCommand('quit');
	expect(controller.sessionPrompt).toBe(true);
	expect(controller.sessionPromptFromTray).toBe(true);
	expect(mocks.prepareClose).not.toHaveBeenCalled();
	await controller.onSessionChoice(true);
	expect(controller.sessionPrompt).toBe(false);
	expect(controller.closePrompt).toBe(true);
	mocks.resolveClose.mockRejectedValue(new Error('Disk full'));
	await controller.onCloseChoice('save');
	expect(controller.closePrompt).toBe(true);
	expect(controller.closeError).not.toBe('');
	expect(controller.closeSaving).toBe(false);
});
