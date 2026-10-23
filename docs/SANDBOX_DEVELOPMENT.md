# One checkout on macOS and Docker Sandboxes

Use the same directly mounted source checkout on macOS and in Docker Sandboxes.
Keep dependencies and build output private to each operating system: packages
such as Rollup and esbuild contain platform-specific binaries.

## Inside the Linux sandbox

Before installing dependencies or running a web build:

```sh
python3 scripts/sandbox-storage.py
# Once per sandbox, make pnpm available to nested package scripts too.
sudo corepack enable --install-directory /usr/local/bin
corepack install --global pnpm@10.11.0
pnpm install --frozen-lockfile --store-dir "$HOME/.local/share/pnpm/store"
pnpm --filter @figuro/editor-host exec tsc --noEmit
pnpm build
```

The helper bind-mounts sandbox-local directories over `node_modules/` and `dist/`
at the checkout root and in each workspace package under `packages/*`. It requires
the Linux sandbox's passwordless sudo and a virtiofs-mounted checkout. macOS still
sees its original directories; Linux sees its own installed dependencies and
generated output. Source files, Git state, package manifests, and the lockfile
remain shared. A frozen install does not change the shared lockfile.
The explicit store path keeps pnpm's package cache inside the sandbox too.
The editor host's TypeScript incremental cache also lives under `node_modules/`.

For the editor host's development server:

```sh
pnpm dev --host 0.0.0.0
```

Publish the dev server's port using Docker Sandboxes on the Mac if you want to
open it in a host browser. Port-publishing commands depend on your installed
Sandboxes CLI version.

## Persistence and new packages

The helper is safe to rerun. Run it when starting a sandbox session and again
after adding a workspace package, before installing that package's dependencies.
Bind mounts last until the sandbox VM restarts; rerunning restores them. Private
files live under `~/.local/share/figuro-sandbox/<checkout-path-hash>/` inside the
sandbox and persist until the sandbox or that storage is removed. Recreating the
sandbox requires a new install. Avoid deleting mountpoint directories while the
mounts are active.

The helper covers the pnpm workspace. Standalone experiments under `prototypes/`
need their own private dependency/output mounts before installing in Linux.

## On macOS

Continue using `make install`, `make run`, and `make test` normally. The helper
rejects execution on macOS. The [macOS test runner](UI_TEST_RUNNER.md) continues
building isolated source snapshots with its own Mac dependencies.

Dependency changes remain shared through `package.json` and `pnpm-lock.yaml`.
After a dependency change, install again in both environments. Coordinate edits
to these shared files as you would any other source file.

Docker Sandboxes uses a private VM and Docker daemon. These mounts are made
inside the sandbox, rather than through Docker Compose volume declarations.
See Docker's [workspace storage documentation](https://docs.docker.com/ai/sandboxes/architecture/)
and [development workflow](https://docs.docker.com/ai/sandboxes/workflows/development/).
