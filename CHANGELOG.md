# Changelog

All notable changes to WeApp Driver are documented in this file.

## [0.2.0] - 2026-08-27

### Added

- Added `page.exists()` and `page.count()` for unambiguous element presence checks.
- Added custom-component traversal and runtime APIs: `component.query()`, `component.property()`, `component.data()`, `component.setData()`, and `component.callMethod()`.
- Added `page.property()` and `weapp --version`.
- Added semantic snapshot support for `opaqueAttributes` when DevTools serializes object-valued WXML attributes as `[object Object]`.

### Changed

- Reuse an existing Automator endpoint when its runtime AppID matches the requested project, reducing repeated DevTools authorization prompts.
- Detect Automator listeners across IPv4 and IPv6 before choosing a port.
- Fall back to custom-component data when an object property is exposed as `null`, `undefined`, or an opaque object string.
- Include protocol method names in Automator errors and preserve typed `SnapshotResult` values from queries.
- Expanded the bundled Skill guidance for component boundaries, optional elements, authorization handoff, and opaque object values.

### Fixed

- Fixed zero-match `page.query()` results being easy to misinterpret as a successful element match.
- Fixed repeated `cli auto` launches when the preferred port was already occupied by a compatible DevTools Automator service.

## [0.1.1] - 2026-08-25

### Fixed

- Ensured built CLI artifacts are included and available for GitHub-based installation.
- Built the runtime during source installation and documented npm as the primary installation path.

## [0.1.0] - 2026-08-25

### Added

- Initial public release of the persistent Mini Program automation daemon, batch JavaScript runner, semantic snapshots, element refs, waits, logs, screenshots, wx API helpers, official DevTools integration, and bundled Codex Skill.
