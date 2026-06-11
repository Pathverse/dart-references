// Keeps at most one diagnostic per (document, symbol), so re-resolving a
// CodeLens can never stack duplicate warnings.
export class DocumentDiagnosticsStore<T> {
	private readonly byDocument = new Map<string, Map<string, T>>();

	upsert(documentUri: string, symbolKey: string, value: T): void {
		let symbols = this.byDocument.get(documentUri);
		if (!symbols) {
			symbols = new Map<string, T>();
			this.byDocument.set(documentUri, symbols);
		}
		symbols.set(symbolKey, value);
	}

	removeSymbol(documentUri: string, symbolKey: string): void {
		this.byDocument.get(documentUri)?.delete(symbolKey);
	}

	valuesFor(documentUri: string): T[] {
		const symbols = this.byDocument.get(documentUri);
		return symbols ? [...symbols.values()] : [];
	}

	clearDocument(documentUri: string): void {
		this.byDocument.delete(documentUri);
	}

	clearAll(): void {
		this.byDocument.clear();
	}
}
