import * as assert from 'assert';
import { formatLensTitle, normalizeSettings } from '../../core/settings';

describe('normalizeSettings', () => {
	it('defaults to enabled with the standard labels', () => {
		assert.deepStrictEqual(normalizeSettings({}), {
			enabled: true,
			referencesLabel: 'references',
			zeroReferencesLabel: 'No references',
			cacheMaxEntries: 2000,
			maxCachedLocations: 1000,
			cacheTtlMs: 60_000,
		});
	});

	it('treats explicit false as disabled', () => {
		assert.strictEqual(normalizeSettings({ enable: false }).enabled, false);
	});

	it('uses the provided labels', () => {
		const settings = normalizeSettings({ referencesLabel: 'usages', zeroReferencesLabel: 'Unused' });
		assert.strictEqual(settings.referencesLabel, 'usages');
		assert.strictEqual(settings.zeroReferencesLabel, 'Unused');
	});

	it('trims labels and falls back to defaults for blank strings', () => {
		const settings = normalizeSettings({ referencesLabel: '  uses  ', zeroReferencesLabel: '   ' });
		assert.strictEqual(settings.referencesLabel, 'uses');
		assert.strictEqual(settings.zeroReferencesLabel, 'No references');
	});

	it('ignores non-string label values', () => {
		const settings = normalizeSettings({ referencesLabel: 42 });
		assert.strictEqual(settings.referencesLabel, 'references');
	});

	it('defaults the cache limits', () => {
		const settings = normalizeSettings({});
		assert.strictEqual(settings.cacheMaxEntries, 2000);
		assert.strictEqual(settings.maxCachedLocations, 1000);
		assert.strictEqual(settings.cacheTtlMs, 60_000);
	});

	it('accepts 0 as "no limit" for every cache limit', () => {
		const settings = normalizeSettings({ cacheMaxEntries: 0, maxCachedLocations: 0, cacheTtlSeconds: 0 });
		assert.strictEqual(settings.cacheMaxEntries, 0);
		assert.strictEqual(settings.maxCachedLocations, 0);
		assert.strictEqual(settings.cacheTtlMs, 0);
	});

	it('converts cacheTtlSeconds to milliseconds', () => {
		assert.strictEqual(normalizeSettings({ cacheTtlSeconds: 5 }).cacheTtlMs, 5_000);
	});

	it('floors fractional limit values', () => {
		assert.strictEqual(normalizeSettings({ cacheMaxEntries: 250.7 }).cacheMaxEntries, 250);
	});

	it('falls back to defaults for negative or non-numeric limits', () => {
		const settings = normalizeSettings({ cacheMaxEntries: -5, maxCachedLocations: 'lots', cacheTtlSeconds: NaN });
		assert.strictEqual(settings.cacheMaxEntries, 2000);
		assert.strictEqual(settings.maxCachedLocations, 1000);
		assert.strictEqual(settings.cacheTtlMs, 60_000);
	});
});

describe('formatLensTitle', () => {
	const settings = normalizeSettings({});

	it('shows the zero label when there are no references', () => {
		assert.strictEqual(formatLensTitle(0, settings), 'No references');
	});

	it('shows the count with the references label otherwise', () => {
		assert.strictEqual(formatLensTitle(3, settings), '3 references');
	});
});
