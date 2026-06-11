import * as assert from 'assert';
import { activate, deactivate } from '../../extension';
import * as stub from './support/vscodeStub';

interface RegisteredProvider {
	onDidChangeCodeLenses(listener: () => void): { dispose(): void };
	provideCodeLenses(document: unknown, token: unknown): Promise<unknown[]>;
}

describe('activate', () => {
	let context: { subscriptions: unknown[] };
	const originalExecuteCommand = stub.commands.executeCommand;

	beforeEach(() => {
		stub.__reset();
		context = { subscriptions: [] };
	});

	afterEach(() => {
		stub.commands.executeCommand = originalExecuteCommand;
	});

	const activateAndGetProvider = (): RegisteredProvider => {
		activate(context as never);
		assert.strictEqual(stub.__created.codeLensProviders.length, 1);
		return stub.__created.codeLensProviders[0].provider as RegisteredProvider;
	};

	it('registers a CodeLens provider for dart documents', () => {
		activate(context as never);
		assert.deepStrictEqual(stub.__created.codeLensProviders[0].selector, { language: 'dart' });
	});

	it('honors dartReferences.enable=false from configuration', async () => {
		stub.__setConfig({ enable: false });
		(stub.commands as { executeCommand: unknown }).executeCommand =
			async () => [{ name: 'doIt', kind: stub.SymbolKind.Function, selectionRange: new stub.Range(new stub.Position(0, 0), new stub.Position(0, 4)), children: [] }];
		const provider = activateAndGetProvider();
		const lenses = await provider.provideCodeLenses(
			{ uri: stub.Uri.file('/lib/a.dart'), version: 1 },
			{ isCancellationRequested: false }
		);
		assert.deepStrictEqual(lenses, []);
	});

	it('resolves a lens end-to-end through the real dependency wiring', async () => {
		(stub.commands as { executeCommand: unknown }).executeCommand = async (command: string) => {
			if (command === 'vscode.executeDocumentSymbolProvider') {
				return [{
					name: 'doIt',
					kind: stub.SymbolKind.Function,
					selectionRange: new stub.Range(new stub.Position(0, 0), new stub.Position(0, 4)),
					children: [],
				}];
			}
			if (command === 'vscode.executeReferenceProvider') {
				return [new stub.Location(
					stub.Uri.file('/lib/b.dart'),
					new stub.Range(new stub.Position(1, 0), new stub.Position(1, 4))
				)];
			}
			return undefined;
		};
		const provider = activateAndGetProvider();
		const cancellation = { isCancellationRequested: false };
		const lenses = await provider.provideCodeLenses(
			{ uri: stub.Uri.file('/lib/a.dart'), version: 1 },
			cancellation
		);
		assert.strictEqual(lenses.length, 1);
		const lens = await (provider as unknown as {
			resolveCodeLens(lens: unknown, token: unknown): Promise<{ command?: { title: string } }>;
		}).resolveCodeLens(lenses[0], cancellation);
		assert.strictEqual(lens.command?.title, '1 references');
	});

	it('refreshes lenses when a dart file is saved', () => {
		const provider = activateAndGetProvider();
		let fired = 0;
		provider.onDidChangeCodeLenses(() => fired++);
		stub.__events.saveDocument.fire({ languageId: 'dart' });
		assert.strictEqual(fired, 1);
	});

	it('ignores saves of non-dart files', () => {
		const provider = activateAndGetProvider();
		let fired = 0;
		provider.onDidChangeCodeLenses(() => fired++);
		stub.__events.saveDocument.fire({ languageId: 'typescript' });
		assert.strictEqual(fired, 0);
	});

	it('refreshes lenses when dartReferences configuration changes', () => {
		const provider = activateAndGetProvider();
		let fired = 0;
		provider.onDidChangeCodeLenses(() => fired++);
		stub.__events.changeConfiguration.fire({ affectsConfiguration: (section: string) => section === 'dartReferences' });
		stub.__events.changeConfiguration.fire({ affectsConfiguration: () => false });
		assert.strictEqual(fired, 1);
	});

	it('registers the dartReferences.showReferences fallback command', async () => {
		activate(context as never);
		const handler = stub.__created.commands.get('dartReferences.showReferences');
		assert.ok(handler, 'fallback command not registered');

		const executed: Array<{ command: string; args: unknown[] }> = [];
		const locations = [new stub.Location(
			stub.Uri.file('/lib/b.dart'),
			new stub.Range(new stub.Position(1, 0), new stub.Position(1, 4))
		)];
		(stub.commands as { executeCommand: unknown }).executeCommand =
			async (command: string, ...args: unknown[]) => {
				executed.push({ command, args });
				return command === 'vscode.executeReferenceProvider' ? locations : undefined;
			};

		const uri = stub.Uri.file('/lib/a.dart');
		const position = new stub.Position(4, 10);
		await handler!(uri, position);

		assert.deepStrictEqual(executed.map(e => e.command), [
			'vscode.executeReferenceProvider',
			'editor.action.showReferences',
		]);
		assert.deepStrictEqual(executed[1].args, [uri, position, locations]);
	});

	it('fallback command shows an empty list when the provider returns nothing', async () => {
		activate(context as never);
		const handler = stub.__created.commands.get('dartReferences.showReferences');
		const executed: Array<{ command: string; args: unknown[] }> = [];
		(stub.commands as { executeCommand: unknown }).executeCommand =
			async (command: string, ...args: unknown[]) => {
				executed.push({ command, args });
				return undefined;
			};
		const uri = stub.Uri.file('/lib/a.dart');
		const position = new stub.Position(4, 10);
		await handler!(uri, position);
		assert.deepStrictEqual(executed[1].args, [uri, position, []]);
	});

	it('passes cache settings through to the provider', async () => {
		stub.__setConfig({ maxCachedLocations: 1 });
		(stub.commands as { executeCommand: unknown }).executeCommand = async (command: string) => {
			if (command === 'vscode.executeDocumentSymbolProvider') {
				return [{
					name: 'doIt',
					kind: stub.SymbolKind.Function,
					selectionRange: new stub.Range(new stub.Position(0, 0), new stub.Position(0, 4)),
					children: [],
				}];
			}
			if (command === 'vscode.executeReferenceProvider') {
				return [
					new stub.Location(stub.Uri.file('/lib/b.dart'), new stub.Range(new stub.Position(1, 0), new stub.Position(1, 4))),
					new stub.Location(stub.Uri.file('/lib/c.dart'), new stub.Range(new stub.Position(2, 0), new stub.Position(2, 4))),
				];
			}
			return undefined;
		};
		const provider = activateAndGetProvider() as unknown as {
			provideCodeLenses(document: unknown, token: unknown): Promise<unknown[]>;
			resolveCodeLens(lens: unknown, token: unknown): Promise<{ command?: { command: string } }>;
		};
		const cancellation = { isCancellationRequested: false };
		const doc = { uri: stub.Uri.file('/lib/a.dart'), version: 1 };
		const lenses = await provider.provideCodeLenses(doc, cancellation);
		await provider.resolveCodeLens(lenses[0], cancellation);
		const second = await provider.provideCodeLenses(doc, cancellation);
		const lens = await provider.resolveCodeLens(second[0], cancellation);
		assert.strictEqual(lens.command?.command, 'dartReferences.showReferences');
	});

	it('deactivate is a no-op', () => {
		assert.strictEqual(deactivate(), undefined);
	});

	it('deletes diagnostics for a document when it closes', () => {
		activate(context as never);
		const collection = stub.__created.diagnosticCollections[0];
		const uri = stub.Uri.file('/lib/a.dart');
		collection.set(uri, []);
		stub.__events.closeDocument.fire({ uri });
		assert.strictEqual(collection.store.has(uri.toString()), false);
	});
});
