# UI tests from a sandbox

The sandbox submits a source snapshot to a shared directory. A runner in a macOS
desktop session builds that snapshot and runs the existing `FiguroUITests` suite.
Agents read JSON results and artifacts through the shared directory.

## Local test results

`make test` automatically exports results even when tests fail. Live build/test
output remains visible in the terminal, and the command still exits unsuccessfully
for failed tests, build errors, or an unreadable result summary.

Agents can read the latest run directly from the shared checkout:

```text
apps/macos/build/ui-tests/latest.json
```

Its `status`, `tests`, `failures`, and `artifacts` fields use the same format as
queued job results. For these local runs, artifact paths are **relative to the
checkout root**. Each run retains its `results.json`, `summary.json`, `tests.json`,
`xcodebuild.log`, `.xcresult` bundle, and available failure attachments in a unique
directory under `apps/macos/build/ui-tests/`. `latest.json` is atomically updated
to identify the current run, so a previous failure cannot be mistaken for a new
run in progress. Local runs also share the desktop lock with the queue runner.

To export a result bundle from an earlier `make test` invocation:

```sh
make test-results
```

This finds the latest existing bundle in either Xcode's `Logs/Test` directory or
the local run directories and updates `latest.json`, without executing tests.
To select a particular bundle:

```sh
make test-results RESULT_BUNDLE_PATH="apps/macos/build/Logs/Test/Test-Figuro-2026.10.18_12-05-22-+0200.xcresult"
```

`make test-results` exits 0 when it exports a reliable verdict (including failed
tests), or 2 for an export/infrastructure error. Read its JSON `status` to evaluate
the test outcome. Use `TEST_TIMEOUT=1800` with `make test` to change the local run's
execution timeout, or `TEST_ARGS=-only-testing:FiguroUITests/RevealStepAcceptanceTests`
for a focused run.

## Start the Mac runner

The Mac needs the app's normal toolchain: macOS 14+, Xcode 26+, Node.js 20+, pnpm,
and XcodeGen. The runner also needs Python 3.9 or later. Xcode's command-line tools
must point to the full Xcode installation.

From the checkout on the Mac:

```sh
make install
make test-setup
make test
python3 scripts/ui-tests.py runner
```

`make test-setup` configures macOS to let XCTest enable UI automation without
repeated authentication. It runs Apple's `automationmodetool` and asks for an
administrator password in the terminal once. This is a Mac-wide UI-testing
setting, so it also applies to the runner's per-job builds. Check its current
status with:

```sh
/usr/bin/automationmodetool
```

To restore authentication for enabling automation mode:

```sh
/usr/bin/automationmodetool disable-automationmode-without-authentication
```

This addresses the **“XCTest is trying to enable automation”** prompt. Separate
Accessibility or Apple Events Automation prompts use the corresponding entries
in System Settings → Privacy & Security.

The initial interactive test run lets you complete Xcode setup. Start the runner
from a terminal in the logged-in user's desktop session, and keep that desktop
unlocked while tests run.
Keep the terminal open; the runner prints a `ready` event, then job events as JSON
lines. Ctrl-C stops it and records an active job as an infrastructure error.

`pnpm test:ui:runner` starts the same process. To process at most one queued job:

```sh
python3 scripts/ui-tests.py runner --once
```

The runner executes jobs serially. Locks cover both the queue and the Mac user's
desktop, including runners using different queues. Build subprocesses inherit the
locks so a replacement runner cannot overlap a build that survived a runner crash.
Once those subprocesses exit, a restarted runner marks unfinished jobs as
`infrastructure-error` and continues with queued jobs.

## Share the queue

By default, the queue is `<checkout>/.ui-tests`, which is ignored by Git. The Mac
and sandbox must see the same underlying directory. Their absolute paths can
differ.

If only a separate directory is shared, set this variable on **both sides** to
the local path of that shared directory:

```sh
export FIGURO_UI_TEST_QUEUE=/path/to/shared/figuro-ui-tests
```

Every command also accepts `--queue /path/to/shared/figuro-ui-tests`. The Mac runner
can use its own checkout for the runner script; the submitted source is copied
into the queue, so it does not need access to the sandbox checkout's original path.
Use a local shared filesystem with atomic renames and file locking, such as a
directory bind-mounted into the sandbox.

## Agent workflow

Run from the working checkout in the sandbox:

```sh
pnpm --silent test:ui:start
```

The response includes a `jobId`, `status: "queued"`, and `sourceSnapshot` hash.
Submission copies tracked and non-ignored untracked files, including uncommitted
edits and file deletions. Generated assets and dependencies stay out of the
snapshot. Source symlinks are rejected. Finish editing before submitting; detected
changes during copying cause submission to fail, so it can be retried.

The runner installs dependencies with `pnpm install --frozen-lockfile`, then uses
the shared low-level `make test-build` target in the snapshot with its own build
directory and Xcode result bundle. `make test` wraps that same target for local
execution and result export.
It disables parallel UI execution. Changes made after submission do not affect
that job. `baseCommit` in `request.json` records the Git base, while `sourceSnapshot`
identifies the actual submitted content and permissions.

Use the returned ID:

```sh
pnpm --silent test:ui:status <job-id>
pnpm --silent test:ui:wait <job-id> --timeout 60
pnpm --silent test:ui:results <job-id>
```

`--silent` removes pnpm's script banner so stdout contains only JSON. The Python
commands provide the same interface without pnpm:

```sh
python3 scripts/ui-tests.py start
python3 scripts/ui-tests.py wait <job-id> --timeout 60
```

For a focused run:

```sh
pnpm --silent test:ui:start \
  --only-testing FiguroUITests/RevealStepAcceptanceTests/testUnknownMetadataVersionRemainsOpaque
```

Repeat `--only-testing` to select multiple targets, classes, or methods. The job's
`start --timeout` option limits total dependency installation, build, and test
execution time; it defaults to 1,200 seconds. A `wait --timeout` only limits that
particular wait and leaves the job active, allowing short waits across agent tool
calls.

## Interpret results

Jobs move through `queued` → `running` → one of:

- `passed`: Xcode completed successfully and reported passing tests.
- `failed`: Xcode reported failures associated with XCTest methods; inspect
  `failures` and attachments.
- `infrastructure-error`: installation, build, timeout, interruption, or result
  extraction prevented a reliable test verdict; inspect `error` and the log.

Xcode's failure count can include synthetic runner/bootstrap errors. Failures
that cannot be associated with an XCTest method are treated as infrastructure
errors, with the original failure details preserved.

`wait` exits with code 0 for passing tests, 1 for either terminal failure state,
and 2 when its wait times out. A timed-out wait returns `waitTimedOut: true` along
with the current state. `status` and `results` exit 0 when the job can be read;
evaluate their JSON `status` field. Invalid requests and unknown jobs exit 2.

A completed result looks like:

```json
{
  "jobId": "20261016T120000000000Z-a1b2c3d4",
  "status": "failed",
  "sourceSnapshot": "…",
  "tests": { "total": 2, "passed": 1, "failed": 1, "skipped": 0 },
  "failures": [
    {
      "test": "RevealStepAcceptanceTests/testUnknownMetadataVersionRemainsOpaque()",
      "message": "XCTAssertTrue failed",
      "details": {}
    }
  ],
  "artifacts": {
    "log": "jobs/20261016T120000000000Z-a1b2c3d4/xcodebuild.log",
    "resultBundle": "jobs/20261016T120000000000Z-a1b2c3d4/results.xcresult",
    "summary": "jobs/20261016T120000000000Z-a1b2c3d4/summary.json",
    "testDetails": "jobs/20261016T120000000000Z-a1b2c3d4/tests.json",
    "attachments": "jobs/20261016T120000000000Z-a1b2c3d4/attachments"
  }
}
```

Artifact paths are **relative to the queue directory**, so agents can resolve them
using the sandbox's local mount path. A running job exposes its log path too.
The log contains dependency installation, project generation, build, and test
output. `summary.json` and `tests.json` retain Xcode's test metadata; `details`
preserves the original failure object. `attachments` contains available
failure screenshots and other attachments, with Xcode's export manifests.
Agents can inspect images with their file-reading tools. The `.xcresult` bundle
can also be opened in Xcode on the Mac.

Supplementary test-detail or attachment export failures appear in `warnings` and
preserve the test verdict. An unreadable summary produces an infrastructure
error. Artifacts that were not produced are omitted from `artifacts`.

If a job stays queued, check that the Mac runner is running and both sides use the
same shared queue. If a test fails to launch or drive the app, inspect the log and
try `make test` interactively on the Mac to check the desktop and permissions.

## Job storage and verification

Each published job lives in `.ui-tests/jobs/<job-id>/`:

```text
request.json       Source identity and execution options
status.json        Atomically updated job state
source/            Submitted source snapshot and installed dependencies
build/             Isolated Xcode derived data
xcodebuild.log     Complete execution log
results.json       Final verdict and artifact paths
results.xcresult/  Xcode result bundle, when produced
```

Submission is published with an atomic directory rename after copying finishes.
The runner ignores partial submission directories. Completed jobs retain their
sources, dependencies, builds, and artifacts for inspection; remove completed job
directories when they are no longer needed.

The automation's integration tests run in either the sandbox or on the Mac:

```sh
pnpm test:ui:runner:check
```

They exercise the public CLI and runner process using the real Makefile and
stand-in Xcode/dependency tools, including snapshots, failed assertions, logs and
attachments, timeouts, interruption, locking, and crash recovery. The native UI
suite itself runs on the Mac runner. They also verify that local `make test` runs
export failing results, retain previous runs, surface export errors, and can
export existing bundles without running tests again.
