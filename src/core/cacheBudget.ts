// Worst-case memory model for the reference cache, sized against the
// supported base spec: a 12th-gen CPU machine with 16 GB RAM. The budget is
// ~3% of base-spec RAM; the default settings must keep the theoretical worst
// case (every cached entry holding maxCachedLocations locations) inside it.

export const BYTES_PER_LOCATION_ESTIMATE = 256;

export const BASE_SPEC_CACHE_BUDGET_BYTES = 512 * 1024 * 1024;

export interface CacheSizingSettings {
	cacheMaxEntries: number;
	maxCachedLocations: number;
}

export function estimateWorstCaseCacheBytes(
	settings: CacheSizingSettings,
	bytesPerLocation: number = BYTES_PER_LOCATION_ESTIMATE
): number {
	if (settings.cacheMaxEntries === 0 || settings.maxCachedLocations === 0) {
		return Number.POSITIVE_INFINITY;
	}
	return settings.cacheMaxEntries * settings.maxCachedLocations * bytesPerLocation;
}
