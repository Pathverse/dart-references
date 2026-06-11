import * as assert from 'assert';
import type * as vscode from 'vscode';
import { ReferenceCountCodeLensProvider, ProviderDeps } from '../../referenceLensProvider';
import { normalizeSettings } from '../../core/settings';
import { Location, Position, Range, SymbolKind, Uri } from './support/vscodeStub';

const token = (cancelled = false) =>
	({ isCancellationRequested: cancelled }) as vscode.CancellationToken;

const fakeSymbol = (name: string, kind: number, line = 4, character = 10) => ({
	name,
	kind,
	range: new Range(new Position(line, 0), new Position(line + 2, 0)),
	selectionRange: new Range(new Position(line, character), new Position(line, character + name.length)),
	children: [] as unknown[],
	detail: '',
});

const referenceAt = (path: string, line: number) =>
	new Location(Uri.file(path), new Range(new Position(line, 0), new Position(line, 3)));

describe('ReferenceCountCodeLensProvider', () => {
	let symbolsResult: unknown;
	let locationsResult: unknown;
	let referenceProviderCalls: number;
	let settings = normalizeSettings({});
	let diagnosticsByUri: Map<string, readonly unknown[]>;
	let clock: { value: number };
	let failCommands: boolean;
	let provider: ReferenceCountCodeLensProvider;

	const document = (version = 1) =>
		({ uri: Uri.file('/lib/a.dart'), version }) as unknown as vscode.TextDocument;

	beforeEach(() => {
		symbolsResult = [fakeSymbol('doIt', SymbolKind.Function)];
		locationsResult = [referenceAt('/lib/b.dart', 1), referenceAt('/lib/c.dart', 2)];
		referenceProviderCalls = 0;
		settings = normalizeSettings({});
		diagnosticsByUri = new Map();
		clock = { value: 0 };
		failCommands = false;

		const deps: ProviderDeps = {
			executeCommand: async <T>(command: string): Promise<T | undefined> => {
				if (failCommands) {
					throw new Error('analysis server unavailable');
				}
				if (command === 'vscode.executeDocumentSymbolProvider') {
					return symbolsResult as T;
				}
				if (command === 'vscode.executeReferenceProvider') {
					referenceProviderCalls++;
					return locationsResult as T;
				}
				return undefined;
			},
			getSettings: () => settings,
			setDiagnostics: (uri, diagnostics) => diagnosticsByUri.set(uri.toString(), diagnostics),
			now: () => clock.value,
		};
		provider = new ReferenceCountCodeLensProvider(deps);
	});

	const provideAndResolveFirst = async (version = 1) => {
		const lenses = await provider.provideCodeLenses(document(version), token());
		assert.ok(lenses.length > 0, 'expected at least one lens');
		return provider.resolveCodeLens(lenses[0], token());
	};

	describe('provideCodeLenses', () => {
		it('returns one lens per relevant symbol, anchored at the line start', async () => {
			symbolsResult = [
				fakeSymbol('MyClass', SymbolKind.Class, 2),
				fakeSymbol('doIt', SymbolKind.Function, 8),
			];
			const lenses = await provider.provideCodeLenses(document(), token());
			assert.strictEqual(lenses.length, 2);
			assert.deepStrictEqual(
				lenses.map(l => [l.range.start.line, l.range.start.character]),
				[[2, 0], [8, 0]]
			);
		});

		it('skips methods listed in ignoredMethods but not functions sharing the name', async () => {
			symbolsResult = [
				fakeSymbol('build', SymbolKind.Method, 2),
				fakeSymbol('build', SymbolKind.Function, 5),
				fakeSymbol('helper', SymbolKind.Method, 8),
			];
			const lenses = await provider.provideCodeLenses(document(), token());
			assert.deepStrictEqual(lenses.map(l => l.range.start.line), [5, 8]);
		});

		it('returns no lenses and clears diagnostics when disabled', async () => {
			settings = normalizeSettings({ enable: false });
			const lenses = await provider.provideCodeLenses(document(), token());
			assert.deepStrictEqual(lenses, []);
			assert.deepStrictEqual(diagnosticsByUri.get('file:///lib/a.dart'), []);
		});

		it('returns no lenses when the symbol provider yields nothing', async () => {
			symbolsResult = undefined;
			const lenses = await provider.provideCodeLenses(document(), token());
			assert.deepStrictEqual(lenses, []);
		});
	});

	describe('resolveCodeLens', () => {
		it('sets a showReferences command with the non-declaration count', async () => {
			const lens = await provideAndResolveFirst();
			assert.strictEqual(lens.command?.title, '2 references');
			assert.strictEqual(lens.command?.command, 'editor.action.showReferences');
		});

		it('uses the zero label when there are no references', async () => {
			locationsResult = [];
			const lens = await provideAndResolveFirst();
			assert.strictEqual(lens.command?.title, 'No references');
		});

		it('treats an undefined reference result as zero references', async () => {
			locationsResult = undefined;
			const lens = await provideAndResolveFirst();
			assert.strictEqual(lens.command?.title, 'No references');
		});

		it('serves repeat resolves from the cache', async () => {
			await provideAndResolveFirst();
			await provideAndResolveFirst();
			assert.strictEqual(referenceProviderCalls, 1);
		});

		it('refetches when the document version changes', async () => {
			await provideAndResolveFirst(1);
			await provideAndResolveFirst(2);
			assert.strictEqual(referenceProviderCalls, 2);
		});

		it('refetches after the TTL elapses', async () => {
			await provideAndResolveFirst();
			clock.value = 60_000;
			await provideAndResolveFirst();
			assert.strictEqual(referenceProviderCalls, 2);
		});

		it('evicts least-recently-used symbols beyond cacheMaxEntries', async () => {
			settings = normalizeSettings({ cacheMaxEntries: 1 });
			symbolsResult = [
				fakeSymbol('first', SymbolKind.Function, 2),
				fakeSymbol('second', SymbolKind.Function, 8),
			];
			const lenses = await provider.provideCodeLenses(document(), token());
			await provider.resolveCodeLens(lenses[0], token());
			await provider.resolveCodeLens(lenses[1], token());
			await provider.resolveCodeLens(lenses[0], token());
			assert.strictEqual(referenceProviderCalls, 3);
		});

		it('refetches after a dart file save clears the cache', async () => {
			await provideAndResolveFirst();
			provider.handleDartFileSaved();
			await provideAndResolveFirst();
			assert.strictEqual(referenceProviderCalls, 2);
		});

		it('returns the lens untouched when already cancelled', async () => {
			const lenses = await provider.provideCodeLenses(document(), token());
			const lens = await provider.resolveCodeLens(lenses[0], token(true));
			assert.strictEqual(lens.command, undefined);
			assert.strictEqual(referenceProviderCalls, 0);
		});

		it('discards the result when cancelled mid-lookup', async () => {
			const lenses = await provider.provideCodeLenses(document(), token());
			const mutableToken = { isCancellationRequested: false } as vscode.CancellationToken;
			locationsResult = new Proxy([], {
				get(target, prop, receiver) {
					(mutableToken as { isCancellationRequested: boolean }).isCancellationRequested = true;
					return Reflect.get(target, prop, receiver);
				},
			});
			const lens = await provider.resolveCodeLens(lenses[0], mutableToken);
			assert.strictEqual(lens.command, undefined);
		});

		it('shows an error title when the reference lookup fails', async () => {
			const lenses = await provider.provideCodeLenses(document(), token());
			failCommands = true;
			const lens = await provider.resolveCodeLens(lenses[0], token());
			assert.strictEqual(lens.command?.title, 'Error fetching references');
		});
	});

	describe('maxCachedLocations threshold', () => {
		beforeEach(() => {
			settings = normalizeSettings({ maxCachedLocations: 2 });
			locationsResult = [
				referenceAt('/lib/b.dart', 1),
				referenceAt('/lib/c.dart', 2),
				referenceAt('/lib/d.dart', 3),
			];
		});

		it('a fresh resolve still shows references directly', async () => {
			const lens = await provideAndResolveFirst();
			assert.strictEqual(lens.command?.title, '3 references');
			assert.strictEqual(lens.command?.command, 'editor.action.showReferences');
		});

		it('a cached resolve above the threshold falls back to the re-fetching command', async () => {
			await provideAndResolveFirst();
			const lens = await provideAndResolveFirst();
			assert.strictEqual(referenceProviderCalls, 1, 'count itself is served from cache');
			assert.strictEqual(lens.command?.title, '3 references');
			assert.strictEqual(lens.command?.command, 'dartReferences.showReferences');
			assert.strictEqual(lens.command?.arguments?.length, 2);
		});

		it('at or below the threshold, cached resolves keep the direct command', async () => {
			locationsResult = [referenceAt('/lib/b.dart', 1), referenceAt('/lib/c.dart', 2)];
			await provideAndResolveFirst();
			const lens = await provideAndResolveFirst();
			assert.strictEqual(lens.command?.command, 'editor.action.showReferences');
		});

		it('0 means unlimited: cached resolves keep the direct command', async () => {
			settings = normalizeSettings({ maxCachedLocations: 0 });
			await provideAndResolveFirst();
			const lens = await provideAndResolveFirst();
			assert.strictEqual(lens.command?.command, 'editor.action.showReferences');
		});
	});

	describe('unused diagnostics', () => {
		it('flags an unreferenced function exactly once across repeat resolves', async () => {
			locationsResult = [];
			await provideAndResolveFirst();
			await provideAndResolveFirst();
			const diagnostics = diagnosticsByUri.get('file:///lib/a.dart') as Array<{ message: string }>;
			assert.strictEqual(diagnostics.length, 1);
			assert.strictEqual(diagnostics[0].message, "Unused function 'doIt'");
		});

		it('clears the flag once the symbol gains references', async () => {
			locationsResult = [];
			await provideAndResolveFirst(1);
			locationsResult = [referenceAt('/lib/b.dart', 1)];
			await provideAndResolveFirst(2);
			assert.deepStrictEqual(diagnosticsByUri.get('file:///lib/a.dart'), []);
		});

		it('does not flag unreferenced classes', async () => {
			symbolsResult = [fakeSymbol('MyClass', SymbolKind.Class)];
			locationsResult = [];
			await provideAndResolveFirst();
			assert.deepStrictEqual(diagnosticsByUri.get('file:///lib/a.dart'), []);
		});
	});

	describe('refresh', () => {
		it('fires onDidChangeCodeLenses', () => {
			let fired = 0;
			provider.onDidChangeCodeLenses(() => fired++);
			provider.refresh();
			assert.strictEqual(fired, 1);
		});
	});

	describe('handleDocumentClosed', () => {
		it('drops cache entries and diagnostics for the closed document', async () => {
			locationsResult = [];
			await provideAndResolveFirst();
			provider.handleDocumentClosed(Uri.file('/lib/a.dart') as unknown as vscode.Uri);
			assert.deepStrictEqual(provider.diagnosticsFor('file:///lib/a.dart'), []);
			await provideAndResolveFirst();
			assert.strictEqual(referenceProviderCalls, 2);
		});
	});
});
