import * as vscode from 'vscode';
import { CachedReferences, ReferenceCache } from './core/referenceCache';
import { DocumentDiagnosticsStore } from './core/diagnosticsStore';
import { collectRelevantSymbols } from './core/symbols';
import { countNonDeclarationReferences, LocationLike } from './core/referenceCount';
import { DartReferencesSettings, formatLensTitle } from './core/settings';
import { shouldFlagUnused, unusedSymbolMessage } from './core/unused';

export interface ProviderDeps {
	executeCommand<T>(command: string, ...args: unknown[]): Thenable<T | undefined>;
	getSettings(): DartReferencesSettings;
	setDiagnostics(uri: vscode.Uri, diagnostics: vscode.Diagnostic[]): void;
	now(): number;
}

interface LensMetadata {
	uri: vscode.Uri;
	documentVersion: number;
	symbol: vscode.DocumentSymbol;
}

export class ReferenceCountCodeLensProvider implements vscode.CodeLensProvider {
	private readonly changeEmitter = new vscode.EventEmitter<void>();
	readonly onDidChangeCodeLenses = this.changeEmitter.event;

	private readonly cache: ReferenceCache;
	private readonly diagnostics = new DocumentDiagnosticsStore<vscode.Diagnostic>();
	private readonly lensMetadata = new WeakMap<vscode.CodeLens, LensMetadata>();

	constructor(private readonly deps: ProviderDeps) {
		this.cache = new ReferenceCache(
			() => {
				const settings = deps.getSettings();
				return { ttlMs: settings.cacheTtlMs, maxEntries: settings.cacheMaxEntries };
			},
			deps.now
		);
	}

	refresh(): void {
		this.changeEmitter.fire();
	}

	handleDartFileSaved(): void {
		this.cache.clear();
		this.refresh();
	}

	handleDocumentClosed(uri: vscode.Uri): void {
		this.cache.invalidateDocument(uri.toString());
		this.diagnostics.clearDocument(uri.toString());
	}

	diagnosticsFor(documentUri: string): vscode.Diagnostic[] {
		return this.diagnostics.valuesFor(documentUri);
	}

	async provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.CodeLens[]> {
		if (!this.deps.getSettings().enabled) {
			this.diagnostics.clearDocument(document.uri.toString());
			this.deps.setDiagnostics(document.uri, []);
			return [];
		}

		const symbols = await this.deps.executeCommand<vscode.DocumentSymbol[]>(
			'vscode.executeDocumentSymbolProvider',
			document.uri
		);
		if (!symbols || token.isCancellationRequested) {
			return [];
		}

		const lenses: vscode.CodeLens[] = [];
		for (const symbol of collectRelevantSymbols(symbols)) {
			const lineStart = new vscode.Position(symbol.selectionRange.start.line, 0);
			const lens = new vscode.CodeLens(new vscode.Range(lineStart, lineStart));
			this.lensMetadata.set(lens, {
				uri: document.uri,
				documentVersion: document.version,
				symbol,
			});
			lenses.push(lens);
		}
		return lenses;
	}

	async resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken): Promise<vscode.CodeLens> {
		const meta = this.lensMetadata.get(codeLens);
		if (!meta || token.isCancellationRequested) {
			return codeLens;
		}

		try {
			const references = await this.lookupReferences(meta);
			if (token.isCancellationRequested) {
				return codeLens;
			}
			this.updateUnusedDiagnostic(meta, references.count);
			const title = formatLensTitle(references.count, this.deps.getSettings());
			const tooltip = 'Show all references for this symbol.';
			// Count-only cache entries (location list was over maxCachedLocations)
			// route the click through a command that re-fetches the locations.
			codeLens.command = references.locations
				? {
					title,
					command: 'editor.action.showReferences',
					arguments: [meta.uri, meta.symbol.selectionRange.start, references.locations],
					tooltip,
				}
				: {
					title,
					command: 'dartReferences.showReferences',
					arguments: [meta.uri, meta.symbol.selectionRange.start],
					tooltip,
				};
		} catch (error) {
			console.error('Error fetching references:', error);
			codeLens.command = {
				title: 'Error fetching references',
				command: '',
			};
		}
		return codeLens;
	}

	private async lookupReferences(meta: LensMetadata): Promise<CachedReferences> {
		const position = meta.symbol.selectionRange.start;
		const cacheKey = ReferenceCache.entryKey(
			meta.uri.toString(),
			meta.documentVersion,
			position.line,
			position.character,
			meta.symbol.name
		);

		const cached = this.cache.get(cacheKey);
		if (cached) {
			return cached;
		}

		const locations = (await this.deps.executeCommand<vscode.Location[]>(
			'vscode.executeReferenceProvider',
			meta.uri,
			position
		)) ?? [];
		const count = countNonDeclarationReferences(locations as unknown as LocationLike[], meta.uri.fsPath, position);
		const { maxCachedLocations } = this.deps.getSettings();
		const oversized = maxCachedLocations > 0 && locations.length > maxCachedLocations;
		this.cache.set(cacheKey, meta.uri.toString(), oversized ? { count } : { count, locations });
		return { count, locations };
	}

	private updateUnusedDiagnostic(meta: LensMetadata, referenceCount: number): void {
		const documentUri = meta.uri.toString();
		const position = meta.symbol.selectionRange.start;
		const symbolKey = `${meta.symbol.name}@${position.line}:${position.character}`;

		if (shouldFlagUnused(meta.symbol.kind, referenceCount)) {
			const diagnostic = new vscode.Diagnostic(
				meta.symbol.selectionRange,
				unusedSymbolMessage(meta.symbol.kind, meta.symbol.name),
				vscode.DiagnosticSeverity.Warning
			);
			diagnostic.code = 'unused-function';
			this.diagnostics.upsert(documentUri, symbolKey, diagnostic);
		} else {
			this.diagnostics.removeSymbol(documentUri, symbolKey);
		}
		this.deps.setDiagnostics(meta.uri, this.diagnostics.valuesFor(documentUri));
	}
}
