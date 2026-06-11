// Numeric values mirror vscode.SymbolKind, which is stable API; kept local so
// core modules stay loadable outside the extension host.
export const symbolKinds = {
	class: 4,
	method: 5,
	constructor: 8,
	enum: 9,
	function: 11,
	variable: 12,
} as const;

export const relevantSymbolKinds: ReadonlySet<number> = new Set(Object.values(symbolKinds));

export function isRelevantKind(kind: number): boolean {
	return relevantSymbolKinds.has(kind);
}

export interface SymbolNode {
	kind: number;
	children?: readonly SymbolNode[];
}

export function collectRelevantSymbols<T extends SymbolNode>(symbols: readonly T[]): T[] {
	const collected: T[] = [];
	for (const symbol of symbols) {
		if (isRelevantKind(symbol.kind)) {
			collected.push(symbol);
		}
		if (symbol.children && symbol.children.length > 0) {
			collected.push(...collectRelevantSymbols(symbol.children as readonly T[]));
		}
	}
	return collected;
}
