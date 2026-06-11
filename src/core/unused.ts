import { symbolKinds } from './symbols';

export function shouldFlagUnused(kind: number, referenceCount: number): boolean {
	return referenceCount === 0 && (kind === symbolKinds.function || kind === symbolKinds.method);
}

export function unusedSymbolMessage(kind: number, symbolName: string): string {
	const noun = kind === symbolKinds.function ? 'function' : 'method';
	return `Unused ${noun} '${symbolName}'`;
}
