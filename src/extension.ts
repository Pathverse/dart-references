import * as vscode from 'vscode';
import { normalizeSettings } from './core/settings';
import { ReferenceCountCodeLensProvider } from './referenceLensProvider';

export function activate(context: vscode.ExtensionContext) {
	const diagnosticCollection = vscode.languages.createDiagnosticCollection('dartUnusedFunctions');
	context.subscriptions.push(diagnosticCollection);

	const provider = new ReferenceCountCodeLensProvider({
		executeCommand: (command, ...args) => vscode.commands.executeCommand(command, ...args),
		getSettings: () => {
			const config = vscode.workspace.getConfiguration('dartReferences');
			return normalizeSettings({
				enable: config.get('enable'),
				referencesLabel: config.get('referencesLabel'),
				zeroReferencesLabel: config.get('zeroReferencesLabel'),
				cacheMaxEntries: config.get('cacheMaxEntries'),
				maxCachedLocations: config.get('maxCachedLocations'),
				cacheTtlSeconds: config.get('cacheTtlSeconds'),
			});
		},
		setDiagnostics: (uri, diagnostics) => diagnosticCollection.set(uri, diagnostics),
		now: () => Date.now(),
	});

	context.subscriptions.push(
		vscode.languages.registerCodeLensProvider({ language: 'dart' }, provider),

		// Click target for count-only cache entries: re-fetch the locations
		// (they were too many to keep in memory) and open the references peek.
		vscode.commands.registerCommand(
			'dartReferences.showReferences',
			async (uri: vscode.Uri, position: vscode.Position) => {
				const locations = (await vscode.commands.executeCommand<vscode.Location[]>(
					'vscode.executeReferenceProvider',
					uri,
					position
				)) ?? [];
				await vscode.commands.executeCommand('editor.action.showReferences', uri, position, locations);
			}
		),

		// A document's cached counts and diagnostics are stale once it closes.
		vscode.workspace.onDidCloseTextDocument((document) => {
			provider.handleDocumentClosed(document.uri);
			diagnosticCollection.delete(document.uri);
		}),

		// Any Dart save can change reference counts in other files, so flush
		// the whole cache and re-render visible lenses.
		vscode.workspace.onDidSaveTextDocument((document) => {
			if (document.languageId === 'dart') {
				provider.handleDartFileSaved();
			}
		}),

		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration('dartReferences')) {
				provider.refresh();
			}
		})
	);
}

export function deactivate() { }
