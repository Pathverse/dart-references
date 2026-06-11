import * as assert from 'assert';
import { countNonDeclarationReferences } from '../../core/referenceCount';
import { Location, Position, Range, Uri } from './support/vscodeStub';

const loc = (path: string, startLine: number, startChar: number, endLine = startLine, endChar = startChar + 3) =>
	new Location(Uri.file(path), new Range(new Position(startLine, startChar), new Position(endLine, endChar)));

describe('countNonDeclarationReferences', () => {
	const declPath = '/lib/a.dart';
	const declPosition = new Position(4, 10);

	it('returns 0 for undefined locations', () => {
		assert.strictEqual(countNonDeclarationReferences(undefined, declPath, declPosition), 0);
	});

	it('excludes the declaration itself', () => {
		const locations = [
			loc(declPath, 4, 8),       // declaration: range contains (4,10)
			loc(declPath, 20, 5),      // same file, elsewhere
			loc('/lib/b.dart', 4, 8),  // same range, different file
		];
		assert.strictEqual(countNonDeclarationReferences(locations, declPath, declPosition), 2);
	});

	it('counts all locations when none match the declaration', () => {
		const locations = [loc('/lib/b.dart', 1, 0), loc('/lib/c.dart', 2, 0)];
		assert.strictEqual(countNonDeclarationReferences(locations, declPath, declPosition), 2);
	});
});
