# Releasing @figuro/slidev

The Slidev addon is a public npm package with its own SemVer version in
`packages/slidev/package.json`. App releases and the metadata schema have
independent versions. The initial release is `0.1.0`; publication is pending.

The supported file contract includes ordinary unannotated Excalidraw files and
Figuro metadata v1, regardless of the Figuro app release that produced them.
Slidev's declared peer range is `>=53.0.0 <54.0.0`, and Excalidraw is pinned to
`0.18.1`. Expand these only after running compatibility acceptance.

## First release: publish from your terminal

The release checks passed on 2026-10-21: editor/addon typechecking, the package
contract test, all 15 runner tests, all 5 release-script tests, and all 76 Docker
browser-acceptance tests. `pnpm release:slidev prepare` completed successfully.
Slidev `53.0.0` is currently both the minimum and latest available `53.x` release.
The npm upload dry run passed, but the actual upload was rejected with `EOTP`.
Authentication as `amolenk` succeeded; publication still requires an authenticator
code or a publish-capable token with permission to bypass 2FA.

From the checkout root, on a machine with Node.js 22.12+, pnpm, and Docker:

```sh
# Recheck the release if the checkout has changed.
pnpm release:slidev prepare

# Authenticate on the machine where you will publish, if needed.
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/

# Publish the version in packages/slidev/package.json (currently 0.1.0).
pnpm release:slidev publish
```

If npm reports `EOTP`, retry immediately with a fresh six-digit authenticator
code, replacing `123456`:

```sh
pnpm release:slidev publish --otp=123456
```

An existing `~/.npmrc` referencing `${NODE_AUTH_TOKEN}` can be used instead of
`npm login`; the token must be available in that terminal and authorized to
publish under `@figuro`. `npm whoami` should print `amolenk`. The publish command
runs npm's typechecking and package checks, then uploads with public access.
It stops on failure, so an authentication error never reports successful publication.
The script explicitly targets the public npm registry for authentication,
publication, and release metadata, regardless of your default registry setting.

After npm reports `+ @figuro/slidev@0.1.0`, run:

```sh
pnpm release:slidev verify
```

Verification reads the current addon version, checks its registry version and
integrity, and installs that exact release into a clean consumer deck. It runs
the full Docker acceptance suite against the minimum and latest Slidev `53.x`,
deduplicating the runs when those versions are the same. Registry-installed
verification needs no npm publishing credentials. If the registry has not yet
propagated the release, retry verification after it becomes available.

Then remove the pending-publication notes from the root README, addon README,
and this guide, and record the published version, integrity, and acceptance
results in [#29](https://github.com/amolenk/Figuro/issues/29) and
[#16](https://github.com/amolenk/Figuro/issues/16). Close #16 once those final
release checks pass. If Docker is available only in the sandbox, publish on your
Mac and run `verify` in the sandbox; the steps can run on different machines.

`pnpm release:slidev --help` lists the commands. The script resolves all paths
from its own location, so `node /path/to/Figuro/scripts/release-slidev.mjs verify`
also works outside the checkout directory.

## Prepare a release

1. Choose the addon's next SemVer version and update only
   `packages/slidev/package.json`. During `0.x`, use minor increments for breaking
   changes and patch increments for compatible fixes. From `1.0.0`, use normal
   major/minor/patch increments. Update the lockfile with `pnpm install --lockfile-only`
   when changing dependencies.
2. From the repository root, run:

   ```sh
   pnpm release:slidev prepare
   ```

   This runs typechecking, runner and release-script tests, package validation,
   Docker acceptance for `53.0.0` and the newest `53.x`, and an npm upload dry run.
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
the repository root, authenticate interactively if needed, then publish:

```sh
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
pnpm release:slidev publish
# If npm requires a second factor, replace 123456 with a fresh code:
pnpm release:slidev publish --otp=123456
```

`publishConfig` fixes the registry to npm and access to public.
`prepublishOnly` runs addon typechecking and the tarball contract test; the full
browser suite must already have passed for this release. npm may prompt for the
account's second factor. Run authentication on the publishing machine; keep
tokens out of repository files and command-line arguments.

## Verify the published consumer

From the repository root, verify the version in `packages/slidev/package.json`:

```sh
pnpm release:slidev verify
```

To verify a different exact published version directly:

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
