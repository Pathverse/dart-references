# Change Log

All notable changes to the "dart-references" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.1.0] - 2026-06-11

### Added

- Reference-count CodeLens above Dart functions, classes, methods, constructors, variables, and enums
- `Unused function` / `Unused method` warning diagnostics for symbols with zero references
- In-memory reference-count cache (per document version, LRU-bounded, TTL-expired, flushed on any Dart file save)
- Settings: `dartReferences.enable`, `dartReferences.referencesLabel`, `dartReferences.zeroReferencesLabel`, `dartReferences.cacheMaxEntries`, `dartReferences.maxCachedLocations`, `dartReferences.cacheTtlSeconds` (cache limits accept `0` = no limit)
- Marketplace icon

### Changed

- Setting `dartFunctionReferences.enable` renamed to `dartReferences.enable`
- Extension ships as a single esbuild bundle (~6 KB of code)

### Fixed

- Duplicate "unused" warnings stacking up when a CodeLens re-resolved
- Stale in-flight reference lookups no longer ignore cancellation
