import { beforeEach, expect, it, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import MeetingProfiles from './MeetingProfiles.svelte';
import { api } from './tauri';
import { createOverlayController } from './overlayController.svelte';
import { options, overlayFontSize, overlayPace } from './stores';
import { PROFILES_KEY } from './profiles';
import { OVERLAY_GEOMETRY_KEY } from './overlayGeometry';
import { blockStorage } from './testing/storage';
vi.mock('./tauri', () => ({
	isTauri: () => true,
	api: {
		getOverlayPlacement: vi.fn(),
		setOverlayPlacement: vi.fn(),
		displayLayout: vi.fn(),
		listMicrophones: vi.fn(),
		listOutputs: vi.fn(),
		setOverlayConfig: vi.fn()
	}
}));
beforeEach(() => {
	localStorage.removeItem(PROFILES_KEY);
	localStorage.removeItem(OVERLAY_GEOMETRY_KEY);
	vi.mocked(api.getOverlayPlacement).mockResolvedValue({ x: 0, y: 0, width: 900, height: 240 });
	vi.mocked(api.setOverlayPlacement).mockResolvedValue();
	vi.mocked(api.displayLayout).mockResolvedValue('0,0 1920x1080 100%');
	vi.mocked(api.listMicrophones).mockResolvedValue([]);
	vi.mocked(api.listOutputs).mockResolvedValue([]);
	vi.mocked(api.setOverlayConfig).mockResolvedValue();
});
it('saves and reloads setup, revalidates missing devices and excludes old process ids', async () => {
	const overlay = createOverlayController();
	vi.spyOn(overlay, 'initialize').mockImplementation(() => {});
	options.set({
		source: 'both',
		mode: 'translate',
		targetLanguage: 'fr',
		provider: 'gemini',
		micDeviceId: 'missing',
		systemCapture: { kind: 'application', process: { pid: 3, createdAt: 'old' } }
	});
	overlayFontSize.set(52);
	overlayPace.set('steady');
	const loaded = vi.fn().mockResolvedValue(undefined);
	const busy = vi.fn();
	const view = render(MeetingProfiles, { locked: false, overlay, onLoaded: loaded, onBusy: busy });
	await fireEvent.click(view.getByRole('button', { name: 'Manage profiles' }));
	await fireEvent.click(view.getByText('Save current setup…'));
	await fireEvent.input(view.getByLabelText('Profile name'), { target: { value: 'Lecture hall' } });
	await fireEvent.click(view.getByText('Save current setup'));
	await waitFor(() => expect(view.getByText('Profile saved.')).toBeTruthy());
	expect(
		JSON.parse(localStorage.getItem(PROFILES_KEY)!)[0].options.systemCapture.process
	).toBeNull();
	overlayFontSize.set(30);
	overlayPace.set('immediate');
	await fireEvent.click(view.getByText('Load profile'));
	await waitFor(() => expect(loaded).toHaveBeenCalledOnce());
	expect(get(overlayFontSize)).toBe(52);
	expect(get(overlayPace)).toBe('steady');
	expect(get(options).micDeviceId).toBeNull();
	expect(api.setOverlayPlacement).toHaveBeenCalledWith({ x: 0, y: 0, width: 900, height: 240 });
	// Loading a profile places the overlay as explicitly as move mode does, so the next launch
	// on these displays reopens it there.
	expect(JSON.parse(localStorage.getItem(OVERLAY_GEOMETRY_KEY)!)).toEqual([
		{ layout: '0,0 1920x1080 100%', placement: { x: 0, y: 0, width: 900, height: 240 } }
	]);
	expect(view.getByText(/An audio device is unavailable/)).toBeTruthy();
	await fireEvent.click(view.getByRole('button', { name: 'Manage profiles: Lecture hall' }));
	await fireEvent.click(view.getByText('Rename'));
	await fireEvent.input(view.getByLabelText('Profile name'), { target: { value: 'Seminar room' } });
	await fireEvent.click(view.getByText('Save name'));
	await waitFor(() =>
		expect(JSON.parse(localStorage.getItem(PROFILES_KEY)!)[0].name).toBe('Seminar room')
	);
	await fireEvent.click(view.getByText('Delete profile'));
	expect(JSON.parse(localStorage.getItem(PROFILES_KEY)!)).toHaveLength(1);
	await fireEvent.click(view.getByText('Delete permanently'));
	await waitFor(() => expect(JSON.parse(localStorage.getItem(PROFILES_KEY)!)).toHaveLength(0));
	view.unmount();
});

// WCAG 2.5.3: the picker's visible label is "Meeting profiles", and it used to be named
// "Choose a profile" instead, so "click Meeting profiles" in voice control found nothing.
it('names the profile picker by its visible label', () => {
	const view = render(MeetingProfiles, {
		props: { locked: false, overlay: createOverlayController(), onLoaded: vi.fn(), onBusy: vi.fn() }
	});
	expect(view.getByRole('combobox')).toHaveAccessibleName(/^Meeting profiles/);
	view.unmount();
});

// D20: the list was read straight from localStorage as the rail mounted, so blocked site data
// threw while the operator window was being built.
it('mounts, and keeps a saved profile for the run, when storage refuses access', async () => {
	const restore = blockStorage();
	try {
		const view = render(MeetingProfiles, {
			props: {
				locked: false,
				overlay: createOverlayController(),
				onLoaded: vi.fn(),
				onBusy: vi.fn()
			}
		});
		await fireEvent.click(view.getByRole('button', { name: 'Manage profiles' }));
		await fireEvent.click(view.getByText('Save current setup…'));
		await fireEvent.input(view.getByLabelText('Profile name'), { target: { value: 'Atrium' } });
		await fireEvent.click(view.getByText('Save current setup'));
		await waitFor(() => expect(view.getByText('Profile saved.')).toBeTruthy());
		expect(view.getByRole('option', { name: 'Atrium' })).toBeInTheDocument();
		view.unmount();
	} finally {
		restore();
	}
});
