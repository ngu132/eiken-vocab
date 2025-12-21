# Agent notes

## Lint

- Run `bun lint` (uses `biome check`).
- Viewer fixes applied:
  - `viewer/src/index.tsx`: removed non-null assertion on `root` by validating `#root` exists.
  - `viewer/src/MetadataViewer.tsx`: added `type="button"` to buttons to satisfy `lint/a11y/useButtonType`.
