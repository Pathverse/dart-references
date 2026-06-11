import * as assert from 'assert';
import { DocumentDiagnosticsStore } from '../../core/diagnosticsStore';

describe('DocumentDiagnosticsStore', () => {
	const uri = 'file:///a.dart';
	let store: DocumentDiagnosticsStore<string>;

	beforeEach(() => {
		store = new DocumentDiagnosticsStore<string>();
	});

	it('starts empty', () => {
		assert.deepStrictEqual(store.valuesFor(uri), []);
	});

	it('collects one value per symbol key', () => {
		store.upsert(uri, 'foo@1:2', 'diag-foo');
		store.upsert(uri, 'bar@3:4', 'diag-bar');
		assert.deepStrictEqual(store.valuesFor(uri).sort(), ['diag-bar', 'diag-foo']);
	});

	it('re-reporting the same symbol does not duplicate it', () => {
		store.upsert(uri, 'foo@1:2', 'diag-foo');
		store.upsert(uri, 'foo@1:2', 'diag-foo-updated');
		assert.deepStrictEqual(store.valuesFor(uri), ['diag-foo-updated']);
	});

	it('removeSymbol clears a previously reported symbol', () => {
		store.upsert(uri, 'foo@1:2', 'diag-foo');
		store.removeSymbol(uri, 'foo@1:2');
		assert.deepStrictEqual(store.valuesFor(uri), []);
	});

	it('clearDocument drops only that document', () => {
		store.upsert(uri, 'foo@1:2', 'diag-foo');
		store.upsert('file:///b.dart', 'baz@1:2', 'diag-baz');
		store.clearDocument(uri);
		assert.deepStrictEqual(store.valuesFor(uri), []);
		assert.deepStrictEqual(store.valuesFor('file:///b.dart'), ['diag-baz']);
	});

	it('clearAll drops everything', () => {
		store.upsert(uri, 'foo@1:2', 'diag-foo');
		store.upsert('file:///b.dart', 'baz@1:2', 'diag-baz');
		store.clearAll();
		assert.deepStrictEqual(store.valuesFor(uri), []);
		assert.deepStrictEqual(store.valuesFor('file:///b.dart'), []);
	});
});
