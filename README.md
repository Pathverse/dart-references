# Dart References

Show reference counts for Dart symbols directly in the editor using CodeLens, with optional warnings for unused functions and methods.

## Requirements

- VS Code 1.100.0+
- A Dart language server (install the official Dart/Flutter VS Code extension)

## How It Works

- Uses document symbols to find Dart functions, classes, methods, constructors, variables, and enums.
- For each symbol, queries references and shows a CodeLens label.
- If a function or method has zero references, a warning diagnostic is added.

## Configuration

Settings are under `dartReferences`:

- `dartReferences.enable`: Enable/disable CodeLens and diagnostics (default: `true`).
- `dartReferences.referencesLabel`: Label used for non-zero reference counts (default: `references`).
- `dartReferences.zeroReferencesLabel`: Label used for zero references (default: `No references`).
- `dartReferences.ignoredMethods`: Method names to ignore (default: Flutter lifecycle and common overrides).

## Notes

- Reference counts rely on the Dart language server; results may be delayed in large files.
- Ignored methods are matched by name only (not by class or signature).
