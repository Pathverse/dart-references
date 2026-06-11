// Mocha --require hook: redirects require('vscode') to the local stub so that
// modules importing the VS Code API can be unit-tested outside the extension host.
import Module = require('module');
import * as path from 'path';

const moduleInternals = Module as unknown as {
	_resolveFilename(request: string, ...rest: unknown[]): string;
};

const originalResolve = moduleInternals._resolveFilename;
moduleInternals._resolveFilename = function (request: string, ...rest: unknown[]): string {
	if (request === 'vscode') {
		return path.join(__dirname, 'vscodeStub.js');
	}
	return originalResolve.call(this, request, ...rest);
};
