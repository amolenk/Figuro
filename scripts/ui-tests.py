#!/usr/bin/env python3
"""Submit source snapshots to a shared queue and run them on a macOS desktop."""

import argparse
from contextlib import ExitStack, contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import signal
import subprocess
import sys
import threading
import time
import uuid


TERMINAL = {"passed", "failed", "infrastructure-error"}
JOB_ID = re.compile(r"\d{8}T\d{12}Z-[a-f0-9]{8}")


def now():
    return datetime.now(timezone.utc).isoformat()


def emit(value, event=False):
    print(json.dumps(value, indent=None if event else 2), flush=True)


def read_json(path):
    return json.loads(path.read_text())


def write_json(path, value):
    temporary = path.with_name(f".{path.name}-{uuid.uuid4().hex}.tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n")
    os.replace(temporary, path)


def git(root, *args):
    return subprocess.check_output(["git", "-C", str(root), *args], stderr=subprocess.PIPE)


def repository_root():
    return Path(os.fsdecode(git(Path.cwd(), "rev-parse", "--show-toplevel")).strip())


def source_files(root, queue):
    names = git(root, "ls-files", "-z", "--cached", "--others", "--exclude-standard")
    return sorted({os.fsdecode(name) for name in names.split(b"\0") if name
                   and queue not in (root / os.fsdecode(name)).parents
                   and (root / os.fsdecode(name)).exists()})


def snapshot(root, queue, destination):
    destination.mkdir()
    names = source_files(root, queue)
    digest = hashlib.sha256()
    versions = {}
    for name in names:
        original = root / name
        if original.is_symlink():
            raise ValueError(f"Cannot snapshot source symlink: {name}")
        before = original.stat()
        contents = original.read_bytes()
        copied = destination / name
        copied.parent.mkdir(parents=True, exist_ok=True)
        copied.write_bytes(contents)
        copied.chmod(before.st_mode & 0o777)
        digest.update(os.fsencode(name) + b"\0")
        digest.update(str(before.st_mode & 0o777).encode() + b"\0")
        digest.update(hashlib.sha256(contents).digest())
        versions[name] = (before.st_mtime_ns, before.st_size, before.st_mode, before.st_ino)
    if source_files(root, queue) != names or any(
        (current.st_mtime_ns, current.st_size, current.st_mode, current.st_ino) != version
        for name, version in versions.items() for current in [(root / name).stat()]
    ):
        raise ValueError("Source changed during snapshot; retry after editing finishes")
    return digest.hexdigest()


def submit(queue, args):
    root = repository_root()
    if queue == root or queue in root.parents:
        raise ValueError("The queue must not contain the source repository")
    jobs = queue / "jobs"
    jobs.mkdir(parents=True, exist_ok=True)
    job_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ-") + uuid.uuid4().hex[:8]
    staging = jobs / f".submitting-{job_id}"
    staging.mkdir()
    try:
        source_hash = snapshot(root, queue, staging / "source")
        try:
            commit = git(root, "rev-parse", "HEAD").decode().strip()
        except subprocess.CalledProcessError:
            commit = None
        request = {
            "version": 1, "jobId": job_id, "submittedAt": now(),
            "sourceSnapshot": source_hash, "baseCommit": commit,
            "onlyTesting": args.only_testing, "timeoutSeconds": args.timeout,
        }
        write_json(staging / "request.json", request)
        state = {"jobId": job_id, "status": "queued", "sourceSnapshot": source_hash,
                 "submittedAt": request["submittedAt"]}
        write_json(staging / "status.json", state)
        os.rename(staging, jobs / job_id)
        return state
    except BaseException:
        shutil.rmtree(staging)
        raise


def job_directory(queue, job_id):
    if not JOB_ID.fullmatch(job_id):
        raise ValueError(f"Invalid job ID: {job_id}")
    job = queue / "jobs" / job_id
    if not job.is_dir():
        raise ValueError(f"Unknown job: {job_id}")
    return job


def job_results(job):
    result_path = job / "results.json"
    return read_json(result_path if result_path.exists() else job / "status.json")


@contextmanager
def runner_lock(path):
    with path.open("a+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError(f"A UI test runner already holds {path}") from None
        try:
            yield lock.fileno()
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def stop_process(process):
    # Make, pnpm and xcodebuild inherit one process group, including their children.
    try:
        os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=2)
    except subprocess.TimeoutExpired:
        pass
    except ProcessLookupError:
        return
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    process.wait()


def run_command(command, cwd, log, deadline, output=None, lock_fds=(), live=False):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError("Job execution timeout exceeded")
    log.write("\n$ " + shlex.join(command) + "\n")
    log.flush()
    process = subprocess.Popen(command, cwd=cwd,
                               stdout=subprocess.PIPE if live else output or log,
                               stderr=subprocess.STDOUT if live else log,
                               text=live, errors="replace" if live else None,
                               start_new_session=True, pass_fds=lock_fds)
    if live:
        def stream_output():
            for line in process.stdout:
                log.write(line)
                log.flush()
                print(line, end="", flush=True)
        stream = threading.Thread(target=stream_output, daemon=True)
        stream.start()
    try:
        return process.wait(timeout=remaining)
    except subprocess.TimeoutExpired:
        stop_process(process)
        raise TimeoutError("Job execution timeout exceeded") from None
    except BaseException:
        stop_process(process)
        raise
    finally:
        if live:
            stream.join()
            process.stdout.close()


def finish_job(job, result):
    result["finishedAt"] = now()
    if (job / "results.xcresult").exists():
        result.setdefault("artifacts", {})["resultBundle"] = f"jobs/{job.name}/results.xcresult"
    # Publish results first so a reader observing a terminal status can read them.
    write_json(job / "results.json", result)
    write_json(job / "status.json", {
        key: result[key] for key in ("jobId", "status", "sourceSnapshot", "finishedAt")
    })


def extract_results(bundle, output_dir, cwd, artifact_root, log, deadline, result,
                    exit_code, lock_fds=()):
    if not bundle.exists():
        raise ValueError(f"Test command exited {exit_code} without an Xcode result bundle")
    def artifact(path):
        return os.path.relpath(path, artifact_root)

    result["artifacts"]["resultBundle"] = artifact(bundle)
    prefix = ["xcrun", "xcresulttool", "get", "test-results"]
    with (output_dir / "summary.json").open("w") as output:
        code = run_command(prefix + ["summary", "--path", str(bundle)],
                           cwd, log, deadline, output, lock_fds)
    if code:
        raise ValueError(f"xcresulttool summary extraction exited {code}")
    summary = read_json(output_dir / "summary.json")
    counts = {key: summary[field] for key, field in (
        ("total", "totalTestCount"), ("passed", "passedTests"),
        ("failed", "failedTests"), ("skipped", "skippedTests"),
    )}
    if any(type(count) is not int or count < 0 for count in counts.values()):
        raise ValueError("Invalid test counts in Xcode summary")
    result["tests"] = counts
    result["failures"] = [
        {"test": failure.get("testIdentifierString") or failure.get("testName"),
         "message": failure.get("failureText", ""), "details": failure}
        for failure in summary.get("testFailures", [])
    ]
    result["artifacts"]["summary"] = artifact(output_dir / "summary.json")
    if counts["failed"]:
        # Summary counts include synthetic runner/bootstrap errors. Only classify
        # failures associated with XCTest methods as test failures; retain other
        # failures as infrastructure/unclassified rather than guess from the text.
        if not result["failures"] or any(
            not re.fullmatch(r"(?:[^/\s]+/){1,2}test[^/\s]+", failure["test"] or "")
            for failure in result["failures"]
        ):
            raise ValueError("Xcode reported a runner or unclassified failure; inspect failures and log")
        result["status"] = "failed"
    elif exit_code == 0 and counts["passed"] > 0 and summary.get("result") == "Passed":
        result["status"] = "passed"
    else:
        raise ValueError(f"Xcode did not complete a passing test run (exit {exit_code})")

    # Details and screenshots are supplementary; retain the verdict if their export fails.
    exports = [
        ("testDetails", "tests.json", prefix + ["tests", "--path", str(bundle)]),
        ("attachments", "attachments", ["xcrun", "xcresulttool", "export", "attachments",
          "--path", str(bundle), "--output-path", str(output_dir / "attachments"), "--only-failures"]),
    ]
    for key, name, command in exports:
        try:
            if key == "testDetails":
                with (output_dir / name).open("w") as output:
                    code = run_command(command, cwd, log, deadline, output, lock_fds)
            else:
                code = run_command(command, cwd, log, deadline, lock_fds=lock_fds)
            if code:
                raise ValueError(f"Export exited {code}")
            if (output_dir / name).exists():
                result["artifacts"][key] = artifact(output_dir / name)
        except (OSError, ValueError, TimeoutError) as error:
            result["warnings"].append(f"Could not export {key}: {error}")


def execute_job(job, lock_fds):
    state = read_json(job / "status.json")
    state.update(status="running", startedAt=now(),
                 artifacts={"log": f"jobs/{job.name}/xcodebuild.log"})
    write_json(job / "status.json", state)
    result = {**state, "status": "infrastructure-error", "tests": None, "failures": [],
              "warnings": [], "artifacts": {"log": f"jobs/{job.name}/xcodebuild.log"}}
    interrupted = False
    with (job / "xcodebuild.log").open("w") as log:
        try:
            request = read_json(job / "request.json")
            if request["version"] != 1:
                raise ValueError("Unsupported job request version")
            timeout = positive_number(request["timeoutSeconds"])
            selectors = [test_identifier(value) for value in request["onlyTesting"]]
            for tool in ("pnpm", "make", "xcodegen", "xcodebuild", "xcrun"):
                if shutil.which(tool) is None:
                    raise ValueError(f"Required Mac runner tool is missing from PATH: {tool}")
            deadline = time.monotonic() + timeout
            code = run_command(["pnpm", "install", "--frozen-lockfile"],
                               job / "source", log, deadline, lock_fds=lock_fds)
            if code:
                raise ValueError(f"Dependency installation exited {code}")
            command = ["make", "test-build", f"DERIVED_DATA_PATH={job / 'build'}",
                       f"RESULT_BUNDLE_PATH={job / 'results.xcresult'}",
                       "TEST_ARGS=" + " ".join(f"-only-testing:{value}" for value in selectors)]
            code = run_command(command, job / "source", log, deadline, lock_fds=lock_fds)
            result["exitCode"] = code
            extract_results(job / "results.xcresult", job, job / "source", job.parents[1],
                            log, deadline, result, code, lock_fds)
        except KeyboardInterrupt:
            interrupted = True
            result.update(status="infrastructure-error", error="Runner interrupted")
        except Exception as error:
            result.update(status="infrastructure-error", error=str(error))
            log.write(f"\nRunner error: {error}\n")
    finish_job(job, result)
    if interrupted:
        raise KeyboardInterrupt
    return result


def run_local(args):
    root = repository_root()
    output_root = root / "apps/macos/build/ui-tests"
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ-") + uuid.uuid4().hex[:8]
    with runner_lock(Path.home() / ".figuro-ui-tests-runner.lock") as lock_fd:
        output_dir = output_root / run_id
        output_dir.mkdir(parents=True)
        bundle = (args.result_bundle_path or output_dir / "results.xcresult").resolve()
        if bundle.exists():
            raise ValueError(f"Result bundle already exists; choose a new path: {bundle}")
        result = {"runId": run_id, "status": "running", "startedAt": now(),
                  "tests": None, "failures": [], "warnings": [],
                  "artifacts": {"log": os.path.relpath(output_dir / "xcodebuild.log", root)}}
        write_json(output_root / "latest.json", result)
        exit_code = 2
        with (output_dir / "xcodebuild.log").open("w") as log:
            try:
                selectors = shlex.split(os.environ.get("FIGURO_TEST_ARGS", ""))
                command = ["make", "test-build", f"DERIVED_DATA_PATH={args.derived_data_path.resolve()}",
                           f"RESULT_BUNDLE_PATH={bundle}", "TEST_ARGS=" + " ".join(selectors)]
                deadline = time.monotonic() + args.timeout
                exit_code = run_command(command, root, log, deadline,
                                        lock_fds=(lock_fd,), live=True)
                result["exitCode"] = exit_code
                extract_results(bundle, output_dir, root, root, log, deadline, result,
                                exit_code, (lock_fd,))
            except KeyboardInterrupt:
                exit_code = 130
                result.update(status="infrastructure-error", error="Test run interrupted")
            except Exception as error:
                result.update(status="infrastructure-error", error=str(error))
                log.write(f"\nResult export error: {error}\n")
                if exit_code == 0:
                    exit_code = 2
        if bundle.exists():
            result["artifacts"]["resultBundle"] = os.path.relpath(bundle, root)
        result["finishedAt"] = now()
        write_json(output_dir / "results.json", result)
        write_json(output_root / "latest.json", result)
        emit(result)
        print(f"UI test results: {output_root / 'latest.json'}", flush=True)
        return exit_code if exit_code else (0 if result["status"] == "passed" else 1)


def export_existing(args):
    root = repository_root()
    output_root = root / "apps/macos/build/ui-tests"
    bundle = args.result_bundle_path
    if bundle is None:
        bundles = list((root / "apps/macos/build/Logs/Test").glob("*.xcresult"))
        bundles += list(output_root.glob("*/results.xcresult"))
        if not bundles:
            raise ValueError("No existing Xcode result bundles; run make test first")
        bundle = max(bundles, key=lambda path: path.stat().st_mtime_ns)
    bundle = bundle.resolve()
    if not bundle.exists():
        raise ValueError(f"Result bundle does not exist: {bundle}")
    # Serialize exports with running tests so latest.json always describes a
    # complete, unambiguous run rather than competing writers.
    with runner_lock(Path.home() / ".figuro-ui-tests-runner.lock") as lock_fd:
        export_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ-") + uuid.uuid4().hex[:8]
        output_dir = output_root / export_id
        output_dir.mkdir(parents=True)
        result = {"runId": export_id, "status": "infrastructure-error", "startedAt": now(),
                  "tests": None, "failures": [], "warnings": [],
                  "artifacts": {"resultBundle": os.path.relpath(bundle, root),
                                "log": os.path.relpath(output_dir / "export.log", root)}}
        with (output_dir / "export.log").open("w") as log:
            try:
                extract_results(bundle, output_dir, root, root, log,
                                time.monotonic() + 120, result, 0, (lock_fd,))
            except Exception as error:
                result.update(status="infrastructure-error", error=str(error))
        result["finishedAt"] = now()
        write_json(output_dir / "results.json", result)
        write_json(output_root / "latest.json", result)
        emit(result)
        return 2 if result["status"] == "infrastructure-error" else 0


def serve(queue, args):
    jobs = queue / "jobs"
    jobs.mkdir(parents=True, exist_ok=True)
    with ExitStack() as locks:
        # Also serialize different queues using the same user's desktop.
        lock_fds = (
            locks.enter_context(runner_lock(Path.home() / ".figuro-ui-tests-runner.lock")),
            locks.enter_context(runner_lock(queue / ".runner.lock")),
        )
        for job in sorted(jobs.iterdir()):
            if not JOB_ID.fullmatch(job.name):
                continue
            state = read_json(job / "status.json")
            if state["status"] == "running":
                result = job_results(job)
                if result["status"] not in TERMINAL:
                    result.update(status="infrastructure-error",
                                  error="Previous runner stopped before publishing results")
                finish_job(job, result)
        if not args.once:
            emit({"status": "ready", "queue": str(queue), "pid": os.getpid()}, event=True)
        while True:
            pending = [job for job in sorted(jobs.iterdir()) if JOB_ID.fullmatch(job.name)
                       and read_json(job / "status.json")["status"] == "queued"]
            if pending:
                if not args.once:
                    emit({"jobId": pending[0].name, "status": "running"}, event=True)
                emit(execute_job(pending[0], lock_fds), event=not args.once)
            elif args.once:
                emit({"status": "idle"})
            if args.once:
                return 0
            time.sleep(args.poll_interval)


def wait_for_job(job, args):
    deadline = time.monotonic() + args.timeout
    while True:
        result = job_results(job)
        if result["status"] in TERMINAL:
            emit(result)
            return 0 if result["status"] == "passed" else 1
        if time.monotonic() >= deadline:
            emit({**result, "waitTimedOut": True})
            return 2
        time.sleep(min(args.poll_interval, max(0, deadline - time.monotonic())))


def interrupt_runner(signum, frame):
    raise KeyboardInterrupt


def positive_number(value):
    number = float(value)
    if not 0 < number <= 86400:
        raise argparse.ArgumentTypeError("Must be greater than zero and at most 86400 seconds")
    return number


def test_identifier(value):
    if not re.fullmatch(r"[A-Za-z0-9_]+(?:/[A-Za-z0-9_]+){0,2}", value):
        raise argparse.ArgumentTypeError("Use Target[/TestClass[/testMethod]]")
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    start = commands.add_parser("start", help="Snapshot source and enqueue a UI test job")
    start.add_argument("--only-testing", action="append", type=test_identifier, default=[])
    start.add_argument("--timeout", type=positive_number, default=1200,
                       help="Total execution timeout in seconds (default: 1200)")
    for command in ("status", "results"):
        commands.add_parser(command).add_argument("job_id")
    wait = commands.add_parser("wait", help="Wait for a verdict; exit 0 only if tests pass")
    wait.add_argument("job_id")
    wait.add_argument("--timeout", type=positive_number, default=1200)
    wait.add_argument("--poll-interval", type=positive_number, default=1)
    runner = commands.add_parser("runner", help="Run on the Mac in a logged-in desktop session")
    runner.add_argument("--once", action="store_true", help="Process at most one queued job and exit")
    runner.add_argument("--poll-interval", type=positive_number, default=1)
    local = commands.add_parser("local", help="Run local tests and export results for sandbox agents")
    local.add_argument("--derived-data-path", type=Path, default=Path("apps/macos/build"))
    local.add_argument("--result-bundle-path", type=Path)
    local.add_argument("--timeout", type=positive_number, default=1200)
    export = commands.add_parser("export", help="Export an existing xcresult bundle without running tests")
    export.add_argument("--result-bundle-path", type=Path,
                        help="Bundle to export (default: latest local test result bundle)")
    for command in commands.choices.values():
        if command in (local, export):
            continue
        command.add_argument("--queue", type=Path,
                             default=os.environ.get("FIGURO_UI_TEST_QUEUE"),
                             help="Shared queue directory (default: <repo>/.ui-tests)")
    args = parser.parse_args()
    try:
        if args.command == "local":
            signal.signal(signal.SIGTERM, interrupt_runner)
            return run_local(args)
        if args.command == "export":
            return export_existing(args)
        queue = (args.queue or repository_root() / ".ui-tests").resolve()
        if args.command == "start":
            emit(submit(queue, args))
        elif args.command == "runner":
            signal.signal(signal.SIGTERM, interrupt_runner)
            return serve(queue, args)
        else:
            job = job_directory(queue, args.job_id)
            if args.command == "wait":
                return wait_for_job(job, args)
            emit(read_json(job / "status.json") if args.command == "status" else job_results(job))
        return 0
    except KeyboardInterrupt:
        return 130
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        emit({"error": str(error)})
        return 2


if __name__ == "__main__":
    sys.exit(main())
