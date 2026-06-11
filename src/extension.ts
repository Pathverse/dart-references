import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	const diagnosticCollection = vscode.languages.createDiagnosticCollection('dartUnusedFunctions');
	context.subscriptions.push(diagnosticCollection);
	let lastActiveUri: vscode.Uri | undefined = vscode.window.activeTextEditor?.document.uri;

	context.subscriptions.push(
		vscode.languages.registerCodeLensProvider(
			{ language: 'dart' },
			new ReferenceCountCodeLensProvider(diagnosticCollection)
		)
	);

	// Clear diagnostics when the active editor changes to avoid stale diagnostics
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			if (lastActiveUri) {
				diagnosticCollection.delete(lastActiveUri);
			}
			lastActiveUri = editor?.document.uri;
		})
	);

	// Clear diagnostics when a document is closed
	context.subscriptions.push(
		vscode.workspace.onDidCloseTextDocument((doc) => {
			diagnosticCollection.delete(doc.uri);
		})
	);
}

export function deactivate() { }

class ReferenceCountCodeLensProvider implements vscode.CodeLensProvider {
	private onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
	readonly onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;
	private diagnosticCollection: vscode.DiagnosticCollection;
	private diagnosticsByDocument = new Map<string, Map<string, vscode.Diagnostic>>();
	private referenceCache = new Map<string, { version: number; counts: Map<string, number> }>();

	constructor(diagnosticCollection: vscode.DiagnosticCollection) {
		this.diagnosticCollection = diagnosticCollection;
	}

	async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
		if (!this.isEnabled()) {
			this.diagnosticCollection.delete(document.uri);
			return [];
		}

		// Clear existing diagnostics for this document
		this.diagnosticCollection.delete(document.uri);
		const docKey = document.uri.toString();
		this.diagnosticsByDocument.set(docKey, new Map());
		this.referenceCache.set(docKey, { version: document.version, counts: new Map() });

		const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
			'vscode.executeDocumentSymbolProvider',
			document.uri
		);
		if (!symbols) { return []; }

		const lenses: vscode.CodeLens[] = [];
		const allSymbols: vscode.DocumentSymbol[] = [];
		collectSymbols(symbols, allSymbols);

		const config = vscode.workspace.getConfiguration('dartReferences');
		const ignoredMethods = new Set<string>(config.get<string[]>('ignoredMethods') || []);

		for (const symbol of allSymbols) {
			// Skip ignored methods
			if (symbol.kind === vscode.SymbolKind.Method && ignoredMethods.has(symbol.name)) {
				continue;
			}
			const line = document.lineAt(symbol.selectionRange.start.line);
			const range = new vscode.Range(line.range.start, line.range.start);
			const lens = new vscode.CodeLens(range);
			(lens as any).uri = document.uri;
			(lens as any).position = symbol.selectionRange.start;
			(lens as any).symbol = symbol; // Store symbol for use in resolveCodeLens
			(lens as any).documentVersion = document.version;
			lenses.push(lens);
		}
		return lenses;
	}

	async resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken): Promise<vscode.CodeLens> {
		if (token.isCancellationRequested) {
			return codeLens;
		}

		const uri = (codeLens as any).uri as vscode.Uri;
		const position = (codeLens as any).position as vscode.Position;
		const symbol = (codeLens as any).symbol as vscode.DocumentSymbol;
		const documentVersion = (codeLens as any).documentVersion as number | undefined;
		const docKey = uri.toString();

		try {
			let cacheEntry = this.referenceCache.get(docKey);
			if (!cacheEntry || (documentVersion !== undefined && cacheEntry.version !== documentVersion)) {
				cacheEntry = { version: documentVersion ?? 0, counts: new Map() };
				this.referenceCache.set(docKey, cacheEntry);
			}

			const symbolKey = getSymbolKey(symbol);
			let useCount = cacheEntry.counts.get(symbolKey);
			let locations: vscode.Location[] | undefined;
			if (useCount === undefined) {
				locations = await vscode.commands.executeCommand<vscode.Location[]>(
					'vscode.executeReferenceProvider',
					uri,
					position
				);
			const isDeclaration = (loc: vscode.Location) =>
				loc.uri.fsPath === uri.fsPath && loc.range.contains(position);

				useCount = locations ? locations.filter(loc => !isDeclaration(loc)).length : 0;
				cacheEntry.counts.set(symbolKey, useCount);
			}

			const config = vscode.workspace.getConfiguration('dartReferences');
			const label = config.get<string>('referencesLabel')?.trim() || 'references';
			const zeroLabel = config.get<string>('zeroReferencesLabel')?.trim() || 'No references';
			const title = useCount === 0 ? zeroLabel : `${useCount} ${label}`;

			// Add diagnostic for unused functions or methods
			if (useCount === 0 && (symbol.kind === vscode.SymbolKind.Function || symbol.kind === vscode.SymbolKind.Method)) {
				const diagnostic = new vscode.Diagnostic(
					symbol.selectionRange,
					`Unused ${symbol.kind === vscode.SymbolKind.Function ? 'function' : 'method'} '${symbol.name}'`,
					vscode.DiagnosticSeverity.Warning
				);
				diagnostic.code = 'unused-function';
				const docDiagnostics = this.diagnosticsByDocument.get(docKey) || new Map<string, vscode.Diagnostic>();
				docDiagnostics.set(symbolKey, diagnostic);
				this.diagnosticsByDocument.set(docKey, docDiagnostics);
				this.diagnosticCollection.set(uri, Array.from(docDiagnostics.values()));
			}

			codeLens.command = {
				title,
				command: 'editor.action.showReferences',
				arguments: [uri, position, locations || []],
				tooltip: 'Show all references for this symbol.'
			};
		} catch (error) {
			console.error('Error fetching references:', error);
			codeLens.command = {
				title: 'Error fetching references',
				command: ''
			};
		}
		return codeLens;
	}

	private isEnabled(): boolean {
		const config = vscode.workspace.getConfiguration('dartReferences');
		const enabled = config.get<boolean>('enable');
		if (enabled !== undefined) {
			return enabled;
		}
		const legacyConfig = vscode.workspace.getConfiguration('dartFunctionReferences');
		const legacyEnabled = legacyConfig.get<boolean>('enable');
		return legacyEnabled !== undefined ? legacyEnabled : true;
	}
}

function collectSymbols(symbols: vscode.DocumentSymbol[], result: vscode.DocumentSymbol[]) {
	for (const symbol of symbols) {
		if (isRelevantKind(symbol.kind)) {
			result.push(symbol);
		}
		if (symbol.children && symbol.children.length > 0) {
			collectSymbols(symbol.children, result);
		}
	}
}

function isRelevantKind(kind: vscode.SymbolKind): boolean {
	return [
		vscode.SymbolKind.Function,
		vscode.SymbolKind.Class,
		vscode.SymbolKind.Method,
		vscode.SymbolKind.Constructor,
		vscode.SymbolKind.Variable,
		vscode.SymbolKind.Enum,
	].includes(kind);
}

function getSymbolKey(symbol: vscode.DocumentSymbol): string {
	return `${symbol.kind}:${symbol.name}:${symbol.selectionRange.start.line}:${symbol.selectionRange.start.character}`;
}