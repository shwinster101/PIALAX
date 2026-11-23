# Architecture diagrams

| Diagram | Shows | Files |
|---|---|---|
| System | Users, apps, APIs, stores and outside services, and how they connect | `pialax.png` · `pialax.svg` · `pialax.excalidraw` |
| Data model | What each store holds: tables/columns, KV key patterns or sheet tabs, and how records relate | `pialax-data.png` · `pialax-data.svg` · `pialax-data.excalidraw` |
| Code map | Folders and key files, scripts, tests and build/deploy, and what calls what | `pialax-code.png` · `pialax-code.svg` · `pialax-code.excalidraw` |

- `.excalidraw` files are editable at https://excalidraw.com (File → Open).
- `*.ir.json` is the source for each diagram; regenerate with the excalidraw plugin's `generate.mjs` and `export.mjs`.
- Drawn 2026-11-23 from the code (migrations, KV key strings, sheet headers, folder layout), not from a check of live deployments.
  Update the matching `.ir.json` when a migration, key family, script or service is added or removed.
