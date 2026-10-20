// The crash-recovery offer made at start-up (issue #25): a transcript spooled by a previous
// run that ended before it was saved, and the operator's answer to it.

import { decodeRecovery, type RecoverySnapshot } from './document';
import { asStatus } from './errors';
import { recovery } from './recovery';
import { restoreTranscript, statusMessage } from './stores';

export function createRecoveryOffer(port: Pick<typeof recovery, 'read' | 'clear'> = recovery) {
	let offer = $state<{ snapshot: RecoverySnapshot; path: string } | null>(null);

	/** Read the spool left by the previous run and offer it, if there is anything to offer. */
	async function load() {
		try {
			const stored = await port.read();
			if (!stored) return;
			const snapshot = decodeRecovery(stored.contents);
			if (!snapshot) {
				// Truncated mid-write, or hand-edited. There is nothing to offer, and leaving it
				// would strand caption text on disk that no prompt will ever clear.
				await port.clear();
				return;
			}
			offer = { snapshot, path: stored.path };
		} catch (error) {
			statusMessage.set(asStatus(error));
		}
	}

	/** Answer the offer. Either answer retires the spool — the operator has now decided, and
	 *  a file nobody chose to keep must not survive the decision. */
	async function answer(restore: boolean) {
		const found = offer;
		offer = null;
		if (!found) return;
		if (restore) restoreTranscript(found.snapshot.lines);
		try {
			await port.clear();
		} catch (error) {
			statusMessage.set(asStatus(error));
		}
	}

	return {
		get offer() {
			return offer;
		},
		load,
		answer
	};
}
