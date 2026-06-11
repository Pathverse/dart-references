import * as assert from 'assert';
import { collectRelevantSymbols, isRelevantKind, relevantSymbolKinds } from '../../core/symbols';
import { SymbolKind } from './support/vscodeStub';

interface FakeSymbol {
	name: string;
	kind: number;
	children: FakeSymbol[];
}

const sym = (name: string, kind: number, children: FakeSymbol[] = []): FakeSymbol =>
	({ name, kind, children });

describe('isRelevantKind', () => {
	it('accepts functions, classes, methods, constructors, variables, and enums', () => {
		for (const kind of [
			SymbolKind.Function, SymbolKind.Class, SymbolKind.Method,
			SymbolKind.Constructor, SymbolKind.Variable, SymbolKind.Enum,
		]) {
			assert.strictEqual(isRelevantKind(kind), true, `kind ${kind}`);
		}
	});

	it('rejects other kinds', () => {
		for (const kind of [SymbolKind.Field, SymbolKind.Property, SymbolKind.Interface, SymbolKind.File]) {
			assert.strictEqual(isRelevantKind(kind), false, `kind ${kind}`);
		}
	});

	it('matches the relevantSymbolKinds set', () => {
		for (const kind of relevantSymbolKinds) {
			assert.strictEqual(isRelevantKind(kind), true);
		}
	});
});

describe('collectRelevantSymbols', () => {
	it('flattens nested symbols, keeping only relevant kinds', () => {
		const tree = [
			sym('MyClass', SymbolKind.Class, [
				sym('field', SymbolKind.Field),
				sym('build', SymbolKind.Method, [
					sym('closure', SymbolKind.Function),
				]),
			]),
			sym('topLevel', SymbolKind.Function),
		];
		const names = collectRelevantSymbols(tree).map(s => s.name);
		assert.deepStrictEqual(names, ['MyClass', 'build', 'closure', 'topLevel']);
	});

	it('returns an empty list for no symbols', () => {
		assert.deepStrictEqual(collectRelevantSymbols([]), []);
	});

	it('descends into irrelevant containers to find relevant children', () => {
		const tree = [
			sym('lib', SymbolKind.Namespace, [sym('helper', SymbolKind.Function)]),
		];
		assert.deepStrictEqual(collectRelevantSymbols(tree).map(s => s.name), ['helper']);
	});
});
