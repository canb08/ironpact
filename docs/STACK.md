# Stack

Resolved on 2026-10-26 with `npm view <package> version`; every direct npm dependency is pinned exactly. Node 24 is selected by `.nvmrc` (engine `>=24`). Transitive versions are locked in `package-lock.json`.

| Package | Exact version |
|---|---|
| `vite` | `8.3.5` |
| `@vitejs/plugin-react` | `6.1.2` |
| `react` | `19.3.1` |
| `react-dom` | `19.3.1` |
| `@typescript/native` (alias of `typescript`, typechecker) | `7.0.2` |
| `typescript` (alias of `@typescript/typescript6`, lint API) | `6.0.2` |
| `react-router` | `8.5.0` |
| `tailwindcss` | `4.3.3` |
| `@tailwindcss/vite` | `4.3.3` |
| `vite-plugin-pwa` | `2.0.0` |
| `workbox-precaching` | `7.4.1` |
| `eslint` | `10.13.0` |
| `@eslint/js` | `10.0.1` |
| `typescript-eslint` | `8.72.0` |
| `eslint-plugin-react-hooks` | `7.1.1` |
| `eslint-plugin-react-refresh` | `0.5.7` |
| `globals` | `17.13.0` |
| `vitest` | `5.0.5` |
| `size-limit` | `14.3.0` |
| `@size-limit/file` | `14.3.0` |
| `@types/node` | `26.6.5` |
| `@types/react` | `19.3.0` |
| `@types/react-dom` | `19.3.0` |

Major changes from SPEC §4.1 and the TypeScript side-by-side aliases are recorded in DECISIONS.md. No fonts, motion or later-phase feature packages are installed.
