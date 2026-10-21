# Releasing @figuro/slidev

The Slidev addon is a public npm package with its own SemVer version in
`packages/slidev/package.json`. App releases and the metadata schema have
independent versions. The initial release is `0.1.0`; publication is pending.

The supported file contract includes ordinary unannotated Excalidraw files and
Figuro metadata v1, regardless of the Figuro app release that produced them.
Slidev's declared peer range is `>=53.0.0 <54.0.0`, and Excalidraw is pinned to
`0.18.1`. Expand these only after running compatibility acceptance.

## Prepare a release

1. Choose the addon's next SemVer version and update only
   `packages/slidev/package.json`. During `0.x`, use minor increments for breaking
   changes and patch increments for compatible fixes. From `1.0.0`, use normal
   major/minor/patch increments. Update the lockfile with `pnpm install --lockfile-only`
   when changing dependencies.
2. From the repository root, run:

   ```sh
   pnpm typecheck
   pnpm test
   SLIDEV_VERSION=53 pnpm --filter @figuro/slidev test:docker
   ```

   The GitHub Actions Slidev workflow also tests `53.0.0` and the newest `53.x`.
   It typechecks, inspects the packed public contract, and exercises development,
   production, and a clean consumer deck installed from the actual npm tarball.
3. Inspect the upload from `packages/slidev`:

   ```sh
   npm publish --dry-run
   ```

   The public package contains the Vue components, Slidev setup, renderer adapter
   source, README, and MIT license. Slidev compiles the Vue/TypeScript source;
   there is no separate addon bundle to build. The package-boundary test rejects
   packaged test fixtures, installed dependencies, or build output.
4. Commit the reviewed release changes before publishing.

## Publish

Use an npm account with permission to publish under the `@figuro` scope. From
`packages/slidev`, authenticate interactively if needed, then publish:

```sh
npm login --registry=https://registry.npmjs.org/
npm whoami
npm publish --access public
```

`publishConfig` fixes the registry to npm and access to public.
`prepublishOnly` runs addon typechecking and the tarball contract test; the full
browser suite must already have passed for this release. npm may prompt for the
account's second factor. Run authentication on the publishing machine; keep
tokens out of repository files and command-line arguments.

## Verify the published consumer

From the repository root, substitute the exact newly published version:

```sh
npm view @figuro/slidev@0.1.0 version dist.integrity --json
FIGURO_PACKAGE_VERSION=0.1.0 pnpm --filter @figuro/slidev test:docker
SLIDEV_VERSION=53 FIGURO_PACKAGE_VERSION=0.1.0 pnpm --filter @figuro/slidev test:docker
```

With `FIGURO_PACKAGE_VERSION`, the clean consumer installs that exact version
from the public registry instead of packing the workspace addon. It checks the
installed version, declared Slidev peer range, pinned Excalidraw renderer, then
builds and runs every consumer browser-acceptance test. No addon development
dependencies or workspace links are available to the consumer.

The Slidev GitHub Actions workflow accepts the same exact version through its
manual `package_version` input. Record both matrix results with the release.
Only after npm installation and browser acceptance succeed, remove the
first-release-pending notes from the addon README and this guide and record the
published version and verification in the release issue.
