export interface PositionLike {
	line: number;
	character: number;
}

export interface LocationLike {
	uri: { fsPath: string };
	range: { contains(position: PositionLike): boolean };
}

export function countNonDeclarationReferences(
	locations: readonly LocationLike[] | undefined | null,
	declarationFsPath: string,
	declarationPosition: PositionLike
): number {
	if (!locations) {
		return 0;
	}
	const isDeclaration = (location: LocationLike) =>
		location.uri.fsPath === declarationFsPath && location.range.contains(declarationPosition);
	return locations.filter(location => !isDeclaration(location)).length;
}
