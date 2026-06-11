import * as assert from 'assert';
import { CacheLimits, ReferenceCache } from '../../core/referenceCache';

describe('ReferenceCache', () => {
	const TTL = 30_000;
	let clock: { value: number };
	let limits: CacheLimits;
	let cache: ReferenceCache;

	beforeEach(() => {
		clock = { value: 0 };
		limits = { ttlMs: TTL, maxEntries: 0 };
		cache = new ReferenceCache(() => limits, () => clock.value);
	});

	const keyFor = (uri = 'file:///a.dart', version = 1, name = 'foo') =>
		ReferenceCache.entryKey(uri, version, 4, 2, name);

	const put = (uri: string, name = 'foo', count = 1) =>
		cache.set(keyFor(uri, 1, name), uri, { count, locations: [] });

	it('misses when nothing was stored', () => {
		assert.strictEqual(cache.get(keyFor()), undefined);
	});

	it('returns a stored entry before the TTL expires', () => {
		const entry = { count: 3, locations: [] };
		cache.set(keyFor(), 'file:///a.dart', entry);
		clock.value = TTL - 1;
		assert.deepStrictEqual(cache.get(keyFor()), entry);
	});

	it('keys entries by document version', () => {
		cache.set(keyFor('file:///a.dart', 1), 'file:///a.dart', { count: 3, locations: [] });
		assert.strictEqual(cache.get(keyFor('file:///a.dart', 2)), undefined);
	});

	it('keys entries by symbol identity', () => {
		cache.set(keyFor('file:///a.dart', 1, 'foo'), 'file:///a.dart', { count: 3, locations: [] });
		assert.strictEqual(cache.get(keyFor('file:///a.dart', 1, 'bar')), undefined);
	});

	it('expires entries once the TTL has elapsed', () => {
		cache.set(keyFor(), 'file:///a.dart', { count: 3, locations: [] });
		clock.value = TTL;
		assert.strictEqual(cache.get(keyFor()), undefined);
	});

	it('never expires entries when ttlMs is 0', () => {
		limits = { ttlMs: 0, maxEntries: 0 };
		cache.set(keyFor(), 'file:///a.dart', { count: 3, locations: [] });
		clock.value = Number.MAX_SAFE_INTEGER;
		assert.deepStrictEqual(cache.get(keyFor()), { count: 3, locations: [] });
	});

	it('evicts the least-recently-used entry beyond maxEntries', () => {
		limits = { ttlMs: 0, maxEntries: 2 };
		put('file:///a.dart');
		put('file:///b.dart');
		put('file:///c.dart');
		assert.strictEqual(cache.get(keyFor('file:///a.dart')), undefined);
		assert.ok(cache.get(keyFor('file:///b.dart')));
		assert.ok(cache.get(keyFor('file:///c.dart')));
	});

	it('a get refreshes an entry\'s recency', () => {
		limits = { ttlMs: 0, maxEntries: 2 };
		put('file:///a.dart');
		put('file:///b.dart');
		cache.get(keyFor('file:///a.dart'));
		put('file:///c.dart');
		assert.ok(cache.get(keyFor('file:///a.dart')), 'recently read entry survives');
		assert.strictEqual(cache.get(keyFor('file:///b.dart')), undefined);
	});

	it('applies a lowered maxEntries on the next write', () => {
		limits = { ttlMs: 0, maxEntries: 0 };
		put('file:///a.dart');
		put('file:///b.dart');
		put('file:///c.dart');
		limits = { ttlMs: 0, maxEntries: 1 };
		put('file:///d.dart');
		assert.strictEqual(cache.get(keyFor('file:///a.dart')), undefined);
		assert.strictEqual(cache.get(keyFor('file:///b.dart')), undefined);
		assert.strictEqual(cache.get(keyFor('file:///c.dart')), undefined);
		assert.ok(cache.get(keyFor('file:///d.dart')));
	});

	it('overwriting a key does not count as a second entry', () => {
		limits = { ttlMs: 0, maxEntries: 2 };
		put('file:///a.dart');
		put('file:///b.dart');
		put('file:///b.dart', 'foo', 9);
		assert.ok(cache.get(keyFor('file:///a.dart')), 'no eviction on overwrite');
		assert.deepStrictEqual(cache.get(keyFor('file:///b.dart')), { count: 9, locations: [] });
	});

	it('invalidateDocument removes only entries for that document', () => {
		put('file:///a.dart');
		put('file:///b.dart', 'foo', 2);
		cache.invalidateDocument('file:///a.dart');
		assert.strictEqual(cache.get(keyFor('file:///a.dart')), undefined);
		assert.deepStrictEqual(cache.get(keyFor('file:///b.dart')), { count: 2, locations: [] });
	});

	it('clear empties the whole cache', () => {
		put('file:///a.dart');
		put('file:///b.dart');
		cache.clear();
		assert.strictEqual(cache.get(keyFor('file:///a.dart')), undefined);
		assert.strictEqual(cache.get(keyFor('file:///b.dart')), undefined);
	});
});
