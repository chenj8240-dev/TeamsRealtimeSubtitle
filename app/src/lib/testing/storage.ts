// Storage that refuses, for tests. Test-only: imported from `*.test.ts` files alone.

/**
 * Make every touch of `localStorage` throw, as WebView2 does when the operator's site data is
 * blocked — `typeof localStorage` included, because the global's getter is what throws.
 * Returns the undo.
 */
export function blockStorage(): () => void {
	const own = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
	Object.defineProperty(globalThis, 'localStorage', {
		configurable: true,
		get() {
			throw new DOMException('Access is denied for this document.', 'SecurityError');
		}
	});
	return () => {
		if (own) Object.defineProperty(globalThis, 'localStorage', own);
		else Reflect.deleteProperty(globalThis, 'localStorage');
	};
}
