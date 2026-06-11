export interface DartReferencesSettings {
	enabled: boolean;
	referencesLabel: string;
	zeroReferencesLabel: string;
	/** Maximum cached symbols (LRU-evicted); 0 = unlimited. */
	cacheMaxEntries: number;
	/** Above this many locations only the count is cached; 0 = unlimited. */
	maxCachedLocations: number;
	/** Cache entry lifetime; 0 = never expires. */
	cacheTtlMs: number;
}

export interface RawSettings {
	enable?: unknown;
	referencesLabel?: unknown;
	zeroReferencesLabel?: unknown;
	cacheMaxEntries?: unknown;
	maxCachedLocations?: unknown;
	cacheTtlSeconds?: unknown;
}

function labelOrDefault(raw: unknown, fallback: string): string {
	if (typeof raw !== 'string') {
		return fallback;
	}
	const trimmed = raw.trim();
	return trimmed.length > 0 ? trimmed : fallback;
}

function limitOrDefault(raw: unknown, fallback: number): number {
	if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
		return fallback;
	}
	return Math.floor(raw);
}

export function normalizeSettings(raw: RawSettings): DartReferencesSettings {
	return {
		enabled: raw.enable !== false,
		referencesLabel: labelOrDefault(raw.referencesLabel, 'references'),
		zeroReferencesLabel: labelOrDefault(raw.zeroReferencesLabel, 'No references'),
		cacheMaxEntries: limitOrDefault(raw.cacheMaxEntries, 2000),
		maxCachedLocations: limitOrDefault(raw.maxCachedLocations, 1000),
		cacheTtlMs: limitOrDefault(raw.cacheTtlSeconds, 60) * 1000,
	};
}

export function formatLensTitle(count: number, settings: DartReferencesSettings): string {
	return count === 0 ? settings.zeroReferencesLabel : `${count} ${settings.referencesLabel}`;
}
