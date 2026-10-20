import { get } from 'svelte/store';
import { afterEach, describe, expect, it } from 'vitest';
import {
	persisted,
	persistedFlag,
	persistedWith,
	readFlag,
	readStored,
	writeStored
} from './persisted';

function useStorage(storage: Pick<Storage, 'getItem' | 'setItem'>) {
	Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
}

function memoryStorage(initial: Record<string, string> = {}) {
	const values = new Map(Object.entries(initial));
	return {
		values,
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => void values.set(key, value)
	};
}

afterEach(() => {
	Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('persisted preferences', () => {
	it('start from the validated stored value and save every change', () => {
		const storage = memoryStorage({ size: '44' });
		useStorage(storage);
		const size = persisted('size', () => Number(readStored('size') ?? 38));
		expect(get(size)).toBe(44);
		size.set(50);
		expect(storage.values.get('size')).toBe('50');
	});

	it('rewrite a corrupt stored value as the one in use', () => {
		const storage = memoryStorage({ layout: 'sideways' });
		useStorage(storage);
		const layout = persisted('layout', () =>
			readStored('layout') === 'compact' ? 'compact' : 'fit'
		);
		expect(get(layout)).toBe('fit');
		expect(storage.values.get('layout')).toBe('fit');
	});

	it('treat only the string true as a set flag', () => {
		useStorage(memoryStorage({ on: 'true', odd: 'yes' }));
		expect(readFlag('on')).toBe(true);
		expect(readFlag('odd')).toBe(false);
		expect(readFlag('missing')).toBe(false);
		const flag = persistedFlag('missing');
		flag.set(true);
		expect(readFlag('missing')).toBe(true);
	});

	it('save several keys through a custom writer', () => {
		const storage = memoryStorage();
		useStorage(storage);
		const pair = persistedWith(
			() => ({ a: 'x', b: 'y' }),
			(value) => {
				writeStored('a', value.a);
				writeStored('b', value.b);
			}
		);
		pair.set({ a: '1', b: '2' });
		expect([...storage.values]).toEqual([
			['a', '1'],
			['b', '2']
		]);
	});

	// WebView2 throws on access when site data is blocked, and a full quota throws on write.
	it('keep working when storage refuses to read or write', () => {
		useStorage({
			getItem: () => {
				throw new Error('SecurityError');
			},
			setItem: () => {
				throw new Error('QuotaExceededError');
			}
		});
		expect(readStored('anything')).toBeNull();
		const flag = persistedFlag('enabled');
		expect(get(flag)).toBe(false);
		expect(() => flag.set(true)).not.toThrow();
		expect(get(flag)).toBe(true);
	});

	it('work without storage at all', () => {
		expect(readStored('anything')).toBeNull();
		expect(() => writeStored('anything', 'x')).not.toThrow();
		expect(get(persistedFlag('anything'))).toBe(false);
	});
});
