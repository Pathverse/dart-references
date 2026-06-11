// Minimal runtime stand-in for the 'vscode' module, used only by unit tests.
// Provides just the surface the extension touches; tests inspect state via
// the __-prefixed helpers.

export class Position {
	constructor(public readonly line: number, public readonly character: number) { }
}

export class Range {
	constructor(public readonly start: Position, public readonly end: Position) { }

	contains(position: Position): boolean {
		if (position.line < this.start.line || position.line > this.end.line) {
			return false;
		}
		if (position.line === this.start.line && position.character < this.start.character) {
			return false;
		}
		if (position.line === this.end.line && position.character > this.end.character) {
			return false;
		}
		return true;
	}
}

export class Uri {
	private constructor(public readonly fsPath: string) { }

	static file(path: string): Uri {
		return new Uri(path);
	}

	toString(): string {
		return `file://${this.fsPath}`;
	}
}

export class Location {
	constructor(public readonly uri: Uri, public readonly range: Range) { }
}

export class CodeLens {
	command: unknown;
	constructor(public readonly range: Range, command?: unknown) {
		this.command = command;
	}
}

export class Diagnostic {
	code: unknown;
	constructor(
		public readonly range: Range,
		public readonly message: string,
		public readonly severity: number
	) { }
}

export enum DiagnosticSeverity { Error = 0, Warning = 1, Information = 2, Hint = 3 }

export enum SymbolKind {
	File = 0, Module = 1, Namespace = 2, Package = 3, Class = 4, Method = 5,
	Property = 6, Field = 7, Constructor = 8, Enum = 9, Interface = 10,
	Function = 11, Variable = 12, Constant = 13, String = 14, Number = 15,
	Boolean = 16, Array = 17, Object = 18, Key = 19, Null = 20, EnumMember = 21,
	Struct = 22, Event = 23, Operator = 24, TypeParameter = 25
}

export class EventEmitter<T> {
	private listeners: Array<(value: T) => void> = [];

	event = (listener: (value: T) => void) => {
		this.listeners.push(listener);
		return {
			dispose: () => {
				this.listeners = this.listeners.filter(l => l !== listener);
			}
		};
	};

	fire(value: T): void {
		for (const listener of [...this.listeners]) {
			listener(value);
		}
	}

	dispose(): void {
		this.listeners = [];
	}
}

export class StubDiagnosticCollection {
	readonly store = new Map<string, Diagnostic[]>();

	set(uri: { toString(): string }, diagnostics: Diagnostic[]): void {
		this.store.set(uri.toString(), diagnostics);
	}

	get(uri: { toString(): string }): Diagnostic[] | undefined {
		return this.store.get(uri.toString());
	}

	delete(uri: { toString(): string }): void {
		this.store.delete(uri.toString());
	}

	clear(): void {
		this.store.clear();
	}

	dispose(): void { }
}

export const __created = {
	diagnosticCollections: [] as StubDiagnosticCollection[],
	codeLensProviders: [] as Array<{ selector: unknown; provider: unknown }>,
	commands: new Map<string, (...args: unknown[]) => unknown>(),
};

export const __events = {
	activeEditor: new EventEmitter<unknown>(),
	closeDocument: new EventEmitter<unknown>(),
	saveDocument: new EventEmitter<unknown>(),
	changeConfiguration: new EventEmitter<unknown>(),
};

let configValues: Record<string, unknown> = {};

export function __setConfig(values: Record<string, unknown>): void {
	configValues = values;
}

export function __reset(): void {
	__created.diagnosticCollections.length = 0;
	__created.codeLensProviders.length = 0;
	__created.commands.clear();
	configValues = {};
	__events.activeEditor.dispose();
	__events.closeDocument.dispose();
	__events.saveDocument.dispose();
	__events.changeConfiguration.dispose();
}

export const languages = {
	createDiagnosticCollection: (_name: string): StubDiagnosticCollection => {
		const collection = new StubDiagnosticCollection();
		__created.diagnosticCollections.push(collection);
		return collection;
	},
	registerCodeLensProvider: (selector: unknown, provider: unknown) => {
		__created.codeLensProviders.push({ selector, provider });
		return { dispose(): void { } };
	},
};

export const window = {
	onDidChangeActiveTextEditor: __events.activeEditor.event,
	showInformationMessage: (): undefined => undefined,
};

export const workspace = {
	getConfiguration: (_section?: string) => ({
		get: (key: string) => configValues[key],
	}),
	onDidCloseTextDocument: __events.closeDocument.event,
	onDidSaveTextDocument: __events.saveDocument.event,
	onDidChangeConfiguration: __events.changeConfiguration.event,
};

export const commands = {
	executeCommand: async (..._args: unknown[]): Promise<unknown> => undefined,
	registerCommand: (name: string, handler: (...args: unknown[]) => unknown) => {
		__created.commands.set(name, handler);
		return { dispose(): void { } };
	},
};
