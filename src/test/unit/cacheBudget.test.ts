import * as assert from 'assert';
import {
	BASE_SPEC_CACHE_BUDGET_BYTES,
	BYTES_PER_LOCATION_ESTIMATE,
	estimateWorstCaseCacheBytes,
} from '../../core/cacheBudget';
import { normalizeSettings } from '../../core/settings';

describe('cache memory budget (base spec: 12th-gen CPU, 16 GB RAM)', () => {
	it('default settings stay within the base-spec budget at worst case', () => {
		const worstCase = estimateWorstCaseCacheBytes(normalizeSettings({}));
		assert.ok(
			worstCase <= BASE_SPEC_CACHE_BUDGET_BYTES,
			`worst case ${worstCase} bytes exceeds budget ${BASE_SPEC_CACHE_BUDGET_BYTES}`
		);
	});

	it('budget is at most ~3% of 16 GB', () => {
		assert.ok(BASE_SPEC_CACHE_BUDGET_BYTES <= 16 * 1024 ** 3 * 0.033);
	});

	it('worst case multiplies entries, locations, and per-location bytes', () => {
		const bytes = estimateWorstCaseCacheBytes(
			{ cacheMaxEntries: 10, maxCachedLocations: 20 },
			100
		);
		assert.strictEqual(bytes, 10 * 20 * 100);
	});

	it('an unlimited axis makes the worst case unbounded', () => {
		assert.strictEqual(
			estimateWorstCaseCacheBytes({ cacheMaxEntries: 0, maxCachedLocations: 1000 }),
			Number.POSITIVE_INFINITY
		);
		assert.strictEqual(
			estimateWorstCaseCacheBytes({ cacheMaxEntries: 1000, maxCachedLocations: 0 }),
			Number.POSITIVE_INFINITY
		);
	});

	it('per-location estimate is conservative (>= 256 bytes)', () => {
		assert.ok(BYTES_PER_LOCATION_ESTIMATE >= 256);
	});
});
