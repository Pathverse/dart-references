"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
function activate(context) {
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('dartUnusedFunctions');
    context.subscriptions.push(diagnosticCollection);
    let lastActiveUri = vscode.window.activeTextEditor?.document.uri;
    context.subscriptions.push(vscode.languages.registerCodeLensProvider({ language: 'dart' }, new ReferenceCountCodeLensProvider(diagnosticCollection)));
    // Clear diagnostics when the active editor changes to avoid stale diagnostics
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (lastActiveUri) {
            diagnosticCollection.delete(lastActiveUri);
        }
        lastActiveUri = editor?.document.uri;
    }));
    // Clear diagnostics when a document is closed
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument((doc) => {
        diagnosticCollection.delete(doc.uri);
    }));
}
function deactivate() { }
class ReferenceCountCodeLensProvider {
    onDidChangeCodeLensesEmitter = new vscode.EventEmitter();
    onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;
    diagnosticCollection;
    diagnosticsByDocument = new Map();
    referenceCache = new Map();
    constructor(diagnosticCollection) {
        this.diagnosticCollection = diagnosticCollection;
    }
    async provideCodeLenses(document) {
        if (!this.isEnabled()) {
            this.diagnosticCollection.delete(document.uri);
            return [];
        }
        // Clear existing diagnostics for this document
        this.diagnosticCollection.delete(document.uri);
        const docKey = document.uri.toString();
        this.diagnosticsByDocument.set(docKey, new Map());
        this.referenceCache.set(docKey, { version: document.version, counts: new Map() });
        const symbols = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', document.uri);
        if (!symbols) {
            return [];
        }
        const lenses = [];
        const allSymbols = [];
        collectSymbols(symbols, allSymbols);
        const config = vscode.workspace.getConfiguration('dartReferences');
        const ignoredMethods = new Set(config.get('ignoredMethods') || []);
        for (const symbol of allSymbols) {
            // Skip ignored methods
            if (symbol.kind === vscode.SymbolKind.Method && ignoredMethods.has(symbol.name)) {
                continue;
            }
            const line = document.lineAt(symbol.selectionRange.start.line);
            const range = new vscode.Range(line.range.start, line.range.start);
            const lens = new vscode.CodeLens(range);
            lens.uri = document.uri;
            lens.position = symbol.selectionRange.start;
            lens.symbol = symbol; // Store symbol for use in resolveCodeLens
            lens.documentVersion = document.version;
            lenses.push(lens);
        }
        return lenses;
    }
    async resolveCodeLens(codeLens, token) {
        if (token.isCancellationRequested) {
            return codeLens;
        }
        const uri = codeLens.uri;
        const position = codeLens.position;
        const symbol = codeLens.symbol;
        const documentVersion = codeLens.documentVersion;
        const docKey = uri.toString();
        try {
            let cacheEntry = this.referenceCache.get(docKey);
            if (!cacheEntry || (documentVersion !== undefined && cacheEntry.version !== documentVersion)) {
                cacheEntry = { version: documentVersion ?? 0, counts: new Map() };
                this.referenceCache.set(docKey, cacheEntry);
            }
            const symbolKey = getSymbolKey(symbol);
            let useCount = cacheEntry.counts.get(symbolKey);
            let locations;
            if (useCount === undefined) {
                locations = await vscode.commands.executeCommand('vscode.executeReferenceProvider', uri, position);
                const isDeclaration = (loc) => loc.uri.fsPath === uri.fsPath && loc.range.contains(position);
                useCount = locations ? locations.filter(loc => !isDeclaration(loc)).length : 0;
                cacheEntry.counts.set(symbolKey, useCount);
            }
            const config = vscode.workspace.getConfiguration('dartReferences');
            const label = config.get('referencesLabel')?.trim() || 'references';
            const zeroLabel = config.get('zeroReferencesLabel')?.trim() || 'No references';
            const title = useCount === 0 ? zeroLabel : `${useCount} ${label}`;
            // Add diagnostic for unused functions or methods
            if (useCount === 0 && (symbol.kind === vscode.SymbolKind.Function || symbol.kind === vscode.SymbolKind.Method)) {
                const diagnostic = new vscode.Diagnostic(symbol.selectionRange, `Unused ${symbol.kind === vscode.SymbolKind.Function ? 'function' : 'method'} '${symbol.name}'`, vscode.DiagnosticSeverity.Warning);
                diagnostic.code = 'unused-function';
                const docDiagnostics = this.diagnosticsByDocument.get(docKey) || new Map();
                docDiagnostics.set(symbolKey, diagnostic);
                this.diagnosticsByDocument.set(docKey, docDiagnostics);
                this.diagnosticCollection.set(uri, Array.from(docDiagnostics.values()));
            }
            codeLens.command = {
                title,
                command: 'editor.action.showReferences',
                arguments: [uri, position, locations || []],
                tooltip: 'Show all references for this symbol.'
            };
        }
        catch (error) {
            console.error('Error fetching references:', error);
            codeLens.command = {
                title: 'Error fetching references',
                command: ''
            };
        }
        return codeLens;
    }
    isEnabled() {
        const config = vscode.workspace.getConfiguration('dartReferences');
        const enabled = config.get('enable');
        if (enabled !== undefined) {
            return enabled;
        }
        const legacyConfig = vscode.workspace.getConfiguration('dartFunctionReferences');
        const legacyEnabled = legacyConfig.get('enable');
        return legacyEnabled !== undefined ? legacyEnabled : true;
    }
}
function collectSymbols(symbols, result) {
    for (const symbol of symbols) {
        if (isRelevantKind(symbol.kind)) {
            result.push(symbol);
        }
        if (symbol.children && symbol.children.length > 0) {
            collectSymbols(symbol.children, result);
        }
    }
}
function isRelevantKind(kind) {
    return [
        vscode.SymbolKind.Function,
        vscode.SymbolKind.Class,
        vscode.SymbolKind.Method,
        vscode.SymbolKind.Constructor,
        vscode.SymbolKind.Variable,
        vscode.SymbolKind.Enum,
    ].includes(kind);
}
function getSymbolKey(symbol) {
    return `${symbol.kind}:${symbol.name}:${symbol.selectionRange.start.line}:${symbol.selectionRange.start.character}`;
}
//# sourceMappingURL=extension.js.map