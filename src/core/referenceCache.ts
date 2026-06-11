export interface CachedReferences {
	count: number;
	locations?: readonly unknown[];
}

export interface CacheLimits {
	/** Entry lifetime in milliseconds; 0 = never expires. */
	ttlMs: number;
	/** Maximum entries before LRU eviction; 0 = unlimited. */
	maxEntries: number;
}

interface CacheRecord {
	value: CachedReferences;
	documentUri: string;
	storedAt: number;
}

// Map iteration order doubles as the LRU order: get() re-inserts the record,
// so the first key is always the least recently used.
export class ReferenceCache {
	private readonly records = new Map<string, CacheRecord>();

	constructor(
		private readonly getLimits: () => CacheLimits,
		private readonly now: () => number
	) { }

	static entryKey(documentUri: string, version: number, line: number, character: number, symbolName: string): string {
		return `${documentUri}@${version}:${line}:${character}:${symbolName}`;
	}

	get(key: string): CachedReferences | undefined {
		const record = this.records.get(key);
		if (!record) {
			return undefined;
		}
		const { ttlMs } = this.getLimits();
		if (ttlMs > 0 && this.now() - record.storedAt >= ttlMs) {
			this.records.delete(key);
			return undefined;
		}
		this.records.delete(key);
		this.records.set(key, record);
		return record.value;
	}

	set(key: string, documentUri: string, value: CachedReferences): void {
		this.records.delete(key);
		this.records.set(key, { value, documentUri, storedAt: this.now() });
		const { maxEntries } = this.getLimits();
		if (maxEntries > 0) {
			for (const oldestKey of this.records.keys()) {
				if (this.records.size <= maxEntries) {
					break;
				}
				this.records.delete(oldestKey);
			}
		}
	}

	invalidateDocument(documentUri: string): void {
		for (const [key, record] of this.records) {
			if (record.documentUri === documentUri) {
				this.records.delete(key);
			}
		}
	}

	clear(): void {
		this.records.clear();
	}
}
