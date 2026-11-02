# Development of nas-disk-manager

The Vue/TypeScript UI is in `src/`; the Rust/Axum backend is the crate in `backend/`, with its sources in `backend/src/`. The shared scripts are in the library `@valeriogc/nas-base-app`; manifest and version are in `nas-app.json`, `package.json` and the Cargo metadata. `src/assets/logo.svg` is the source of the logo and the UI icons are in `src/assets/icons/`.

## Conventions

Use the Composition API with `<script setup lang="ts">`, imports through the `@/` alias, scoped SFC styles, CSS names with `_` and UI texts in the catalogues `src/i18n/locales/en.ts` and `it.ts`. Code, method names, test descriptions, this document and the README are in English. Code comments are in English and only where they explain something the code does not say. Tests and styles carry no comments.

The components are split by role. `src/components/layout/` holds the frame of the page (`AppSidebar`, `PageHeader`), `src/components/commons/` the pieces shared by several sections (`SectionCard`), `src/components/sections/` the sections of the page and `src/components/sections/details/` the parts of the details of a disk (`DiskInfo`, `DiskSmart`, `EncryptionActions`, `EraseDialog`). The types are in `src/types/`, one file per subject (`disk`, `encryption`, `network`, `shell`), and are imported from `@/types`. The helpers without Vue are in `src/utils/`. The SCSS variables and mixins shared by the components (`$text_soft`, `status_badge`, `detail_list`) are in `src/styles/global.scss`, which every SFC receives. The NAS theme comes from the context of the iframe; palette, SCSS partials and shared components come from `@valeriogc/nas-base-app`. The bridge is the one of the library: `src/services/nasShell.ts` holds its only instance and asks the launcher for the operations on the disks, `src/composables/useNasLauncherContext.ts` binds it to the catalogue of the app. Header, icons, loading, switches and native dialogs use `NasPageHeader`, `NasIcon`, `NasLoading`, `NasSwitch` and `vNasModal`; the sidebar stays the app's own.

The FE tests are in `src/tests/unit`, `component`, `scripts`, `e2e`, with sub-paths mirroring `src/`. The Rust tests are in `backend/tests/unit` or `integration` when present.

## Dependencies and lockfiles

Locally dependencies are installed with pnpm; the pipelines install with `npm ci` from `package-lock.json`, which therefore has to match `package.json`. `pnpm install` realigns it by itself (`postinstall`, which installs nothing with npm); `pnpm add`, `pnpm update` and `pnpm remove` do not: after them run `pnpm run lock:npm`. `pnpm run lint` checks the alignment and, when it is missing, fails saying so; `release:merge` realigns it anyway before publishing. `pnpm-lock.yaml` stays local.

## Shared library

The launcher bridge, styles, shared components and helpers, and the build, package and release scripts come from `@valeriogc/nas-base-app`, published on GitHub Packages; the commands of `package.json` use its `nas-base-app`. The `.npmrc` of the project points the `@valeriogc` scope to its registry; locally a classic token with `read:packages` is needed in your own `~/.npmrc` (`//npm.pkg.github.com/:_authToken=...`), while the pipelines use the token of the workflow. For a new version of the library, update the number in `package.json` and run `pnpm install`. The local `pnpm-workspace.yaml` has `'@valeriogc/nas-base-app': false` under `allowBuilds`.

## Checks

```bash
pnpm install
pnpm run format:check
pnpm run lint
pnpm run type-check
pnpm test
pnpm run test:e2e
pnpm run test:coverage
cargo fmt --manifest-path backend/Cargo.toml --all --check
cargo clippy --manifest-path backend/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path backend/Cargo.toml
pnpm run nas:package
pnpm run nas:test
```

`pnpm run format` applies Prettier, ESLint and the spacing of the SFC blocks, and `pnpm run format:sfc` runs only the last step. The E2E tests start Vite on port 1420; Explorer also starts Axum with a fixture root. `release:merge` creates commit and tag: try it only in an isolated temporary Git repository.

The package must work even when moved out of the checkout; do not reference `external-apps/` or files of the launcher. For the full contract see [APPS.md](APPS.md).
