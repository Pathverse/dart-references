import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	const diagnosticCollection = vscode.languages.createDiagnosticCollection('dartUnusedFunctions');
	context.subscriptions.push(diagnosticCollection);

	context.subscriptions.push(
		vscode.languages.registerCodeLensProvider(
			{ language: 'dart' },
			new ReferenceCountCodeLensProvider(diagnosticCollection)
		)
	);

	// Clear diagnostics when the active editor changes to avoid stale diagnostics
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(() => {
			diagnosticCollection.clear();
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

	constructor(diagnosticCollection: vscode.DiagnosticCollection) {
		this.diagnosticCollection = diagnosticCollection;
	}

	async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
		// Clear existing diagnostics for this document
		this.diagnosticCollection.delete(document.uri);

		const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
			'vscode.executeDocumentSymbolProvider',
			document.uri
		);
		if (!symbols) return [];

		const lenses: vscode.CodeLens[] = [];
		const allSymbols: vscode.DocumentSymbol[] = [];
		collectSymbols(symbols, allSymbols);

		for (const symbol of allSymbols) {
			const line = document.lineAt(symbol.selectionRange.start.line);
			const range = new vscode.Range(line.range.start, line.range.start);
			const lens = new vscode.CodeLens(range);
			(lens as any).uri = document.uri;
			(lens as any).position = symbol.selectionRange.start;
			(lens as any).symbol = symbol; // Store symbol for use in resolveCodeLens
			lenses.push(lens);
		}
		return lenses;
	}

	async resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken): Promise<vscode.CodeLens> {
		const uri = (codeLens as any).uri as vscode.Uri;
		const position = (codeLens as any).position as vscode.Position;
		const symbol = (codeLens as any).symbol as vscode.DocumentSymbol;

		try {
			const locations = await vscode.commands.executeCommand<vscode.Location[]>(
				'vscode.executeReferenceProvider',
				uri,
				position
			);
			const isDeclaration = (loc: vscode.Location) =>
				loc.uri.fsPath === uri.fsPath && loc.range.contains(position);

			const useCount = locations ? locations.filter(loc => !isDeclaration(loc)).length : 0;
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
				const existingDiagnostics = this.diagnosticCollection.get(uri) || [];
				this.diagnosticCollection.set(uri, [...existingDiagnostics, diagnostic]);
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