import * as assert from 'assert';
import { shouldFlagUnused, unusedSymbolMessage } from '../../core/unused';
import { SymbolKind } from './support/vscodeStub';

describe('shouldFlagUnused', () => {
	it('flags functions and methods with zero references', () => {
		assert.strictEqual(shouldFlagUnused(SymbolKind.Function, 0), true);
		assert.strictEqual(shouldFlagUnused(SymbolKind.Method, 0), true);
	});

	it('does not flag symbols that have references', () => {
		assert.strictEqual(shouldFlagUnused(SymbolKind.Function, 1), false);
	});

	it('does not flag other symbol kinds even at zero references', () => {
		assert.strictEqual(shouldFlagUnused(SymbolKind.Class, 0), false);
		assert.strictEqual(shouldFlagUnused(SymbolKind.Variable, 0), false);
	});
});

describe('unusedSymbolMessage', () => {
	it('names functions as functions', () => {
		assert.strictEqual(unusedSymbolMessage(SymbolKind.Function, 'doIt'), "Unused function 'doIt'");
	});

	it('names methods as methods', () => {
		assert.strictEqual(unusedSymbolMessage(SymbolKind.Method, 'build'), "Unused method 'build'");
	});
});
