import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest


CLI = Path(__file__).resolve().parents[1] / "ui-tests.py"

FAKE_TOOLS = '''#!/usr/bin/env python3
import json
import os
from pathlib import Path
import sys
import time

tool = Path(sys.argv[0]).name
args = sys.argv[1:]
scenario = os.environ.get("UI_TEST_SCENARIO", "passed")
if tool == "pnpm":
    print("Installed snapshot dependencies", flush=True)
    sys.exit(3 if scenario == "install-error" else 0)
if tool == "xcodebuild":
    bundle = Path(args[args.index("-resultBundlePath") + 1])
    job = bundle.parent
    (job / "execution.json").write_text(json.dumps(args))
    print("Running native UI tests", flush=True)
    if scenario == "timeout":
        bundle.mkdir()
        import subprocess
        subprocess.Popen([sys.executable, "-c", "import time; time.sleep(1); "
                          "from pathlib import Path; Path('orphan-child').write_text('alive')"])
        time.sleep(30)
    if scenario == "crash":
        time.sleep(1)
    if scenario == "build-error":
        sys.exit(65)
    bundle.mkdir()
    sys.exit(65 if scenario in ("failed", "failed-bad-summary") else 0)
if tool == "xcrun":
    if "summary" in args:
        if scenario in ("bad-summary", "failed-bad-summary"):
            print("not JSON")
            sys.exit(0)
        failed = scenario in ("failed", "bootstrap-error")
        print(json.dumps({
            "result": "Failed" if failed else "Passed",
            "totalTestCount": 1 if scenario == "bootstrap-error" else 2,
            "passedTests": 0 if scenario == "bootstrap-error" else (1 if failed else 2),
            "failedTests": 1 if failed else 0, "skippedTests": 0,
            "testFailures": [{
                "testIdentifier": 2,
                "testIdentifierString": "RevealStepAcceptanceTests/testRevealStep()",
                "testName": "testRevealStep()",
                "failureText": "XCTAssertTrue failed",
            }] if scenario == "failed" else [{
                "testIdentifier": 1,
                "testIdentifierString": "FiguroUITests-Runner (123) encountered an error",
                "testName": "FiguroUITests-Runner (123) encountered an error",
                "failureText": "Early unexpected exit: test runner crashed while preparing to run tests",
            }] if failed else [],
        }))
    elif "tests" in args:
        print(json.dumps({"testNodes": []}))
    elif "attachments" in args:
        output = Path(args[args.index("--output-path") + 1])
        output.mkdir(exist_ok=True)
        (output / "failure.png").write_bytes(b"screenshot")
    sys.exit(0)
sys.exit(0)
'''


class UITestRunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="figuro runner ")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        self.queue = self.repo / ".ui-tests"
        self.env = {**os.environ, "HOME": str(self.root)}
        self.git("init", "--quiet")
        (self.repo / ".gitignore").write_text(".ui-tests/\nnode_modules/\n")
        (self.repo / "drawing.swift").write_text("original source\n")
        (self.repo / "Makefile").write_text((CLI.parent.parent / "Makefile").read_text())
        build_script = self.repo / "apps/macos/Scripts/build-editor-host.sh"
        build_script.parent.mkdir(parents=True)
        build_script.write_text("#!/bin/sh\nexit 0\n")
        build_script.chmod(0o755)
        script = self.repo / "scripts/ui-tests.py"
        script.parent.mkdir()
        script.write_text(CLI.read_text())
        self.git("add", ".")

    def git(self, *args):
        return subprocess.run(
            ["git", *args], cwd=self.repo, check=True, capture_output=True)

    def cli(self, *args, expected_code=0):
        completed = subprocess.run(
            [sys.executable, str(CLI), *args], cwd=self.repo,
            env=self.env, capture_output=True, text=True, timeout=15)
        self.assertEqual(completed.returncode, expected_code, completed.stderr)
        decoder = json.JSONDecoder()
        output = completed.stdout.strip()
        while output:
            result, end = decoder.raw_decode(output)
            output = output[end:].strip()
        return result

    def install_fake_tools(self, scenario="passed"):
        tools = self.root / "tools"
        tools.mkdir()
        for name in ("pnpm", "xcrun", "xcodebuild", "xcodegen"):
            path = tools / name
            path.write_text(FAKE_TOOLS.replace("#!/usr/bin/env python3", f"#!{sys.executable}", 1))
            path.chmod(0o755)
        self.env["PATH"] = str(tools) + os.pathsep + os.environ["PATH"]
        self.env["UI_TEST_SCENARIO"] = scenario

    def start_runner(self):
        process = subprocess.Popen(
            [sys.executable, str(CLI), "runner", "--poll-interval", "0.01"],
            cwd=self.repo, env=self.env, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True)
        def cleanup():
            if process.poll() is None:
                process.terminate()
            process.communicate(timeout=5)
        self.addCleanup(cleanup)
        self.assertEqual(json.loads(process.stdout.readline())["status"], "ready")
        return process

    def test_submission_freezes_dirty_source_and_excludes_generated_files(self):
        (self.repo / "drawing.swift").write_text("edited source\n")
        (self.repo / "new.swift").write_text("new source\n")
        (self.repo / "node_modules").mkdir()
        (self.repo / "node_modules" / "dependency").write_text("do not copy")

        submitted = self.cli("start")
        job_id = submitted["jobId"]
        self.assertEqual(submitted["status"], "queued")
        (self.repo / "drawing.swift").write_text("subsequent edit\n")

        source = self.queue / "jobs" / job_id / "source"
        self.assertEqual((source / "drawing.swift").read_text(), "edited source\n")
        self.assertEqual((source / "new.swift").read_text(), "new source\n")
        self.assertFalse((source / "node_modules").exists())
        self.assertFalse((source / ".ui-tests").exists())
        self.assertEqual(self.cli("status", job_id)["status"], "queued")
        self.assertEqual(self.cli("results", job_id)["status"], "queued")

    def test_runner_executes_snapshot_and_publishes_machine_readable_results(self):
        self.install_fake_tools()
        submitted = self.cli("start", "--only-testing", "FiguroUITests/RevealStepAcceptanceTests")
        job_id = submitted["jobId"]
        self.cli("runner", "--once")

        result = self.cli("results", job_id)
        self.assertEqual(result["status"], "passed")
        self.assertEqual(result["sourceSnapshot"], submitted["sourceSnapshot"])
        self.assertEqual(result["tests"], {"total": 2, "passed": 2, "failed": 0, "skipped": 0})
        self.assertEqual(result["failures"], [])
        self.assertEqual(self.cli("status", job_id)["status"], "passed")
        self.assertEqual(self.cli("wait", job_id)["status"], "passed")
        self.assertIn("Running native UI tests", (self.queue / result["artifacts"]["log"]).read_text())
        invocation = json.loads((self.queue / "jobs" / job_id / "execution.json").read_text())
        self.assertIn("-only-testing:FiguroUITests/RevealStepAcceptanceTests", invocation)
        self.assertIn("-parallel-testing-enabled NO", " ".join(invocation))

    def test_assertion_failure_includes_details_and_screenshots(self):
        self.install_fake_tools("failed")
        job_id = self.cli("start")["jobId"]
        self.cli("runner", "--once")
        result = self.cli("wait", job_id, expected_code=1)
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["tests"]["failed"], 1)
        self.assertEqual(result["failures"][0]["message"], "XCTAssertTrue failed")
        self.assertEqual(result["failures"][0]["test"],
                         "RevealStepAcceptanceTests/testRevealStep()")
        self.assertTrue((self.queue / result["artifacts"]["attachments"] / "failure.png").exists())

    def test_build_failure_is_an_infrastructure_error(self):
        self.install_fake_tools("build-error")
        job_id = self.cli("start")["jobId"]
        self.cli("runner", "--once")
        result = self.cli("wait", job_id, expected_code=1)
        self.assertEqual(result["status"], "infrastructure-error")
        self.assertIn("without an Xcode result bundle", result["error"])
        self.assertIsNone(result["tests"])

    def test_timeout_stops_the_build_and_its_child_processes(self):
        self.install_fake_tools("timeout")
        job_id = self.cli("start", "--timeout", "0.4")["jobId"]
        self.cli("runner", "--once")
        result = self.cli("wait", job_id, expected_code=1)
        self.assertEqual(result["status"], "infrastructure-error")
        self.assertIn("timeout", result["error"])
        self.assertTrue((self.queue / result["artifacts"]["resultBundle"]).is_dir())
        time.sleep(1.1)
        self.assertFalse((self.queue / "jobs" / job_id / "source" / "orphan-child").exists())

    def test_wait_timeout_leaves_the_job_queued(self):
        job_id = self.cli("start")["jobId"]
        result = self.cli("wait", job_id, "--timeout", "0.01", expected_code=2)
        self.assertTrue(result["waitTimedOut"])
        self.assertEqual(self.cli("status", job_id)["status"], "queued")

    def test_runner_serializes_jobs_and_locks_the_desktop_across_queues(self):
        self.install_fake_tools("timeout")
        first_id = self.cli("start")["jobId"]
        second_id = self.cli("start")["jobId"]
        runner = self.start_runner()
        self.assertEqual(json.loads(runner.stdout.readline())["jobId"], first_id)
        rejected = self.cli("runner", "--once", "--queue", str(self.root / "other-queue"),
                            expected_code=2)
        self.assertIn("already holds", rejected["error"])
        self.assertEqual(self.cli("status", second_id)["status"], "queued")
        runner.terminate()
        runner.communicate(timeout=5)
        self.assertEqual(runner.returncode, 130)
        self.assertEqual(self.cli("status", first_id)["status"], "infrastructure-error")
        self.env["UI_TEST_SCENARIO"] = "passed"
        self.cli("runner", "--once")
        self.assertEqual(self.cli("wait", second_id)["status"], "passed")

    def test_crashed_runner_cannot_overlap_its_surviving_build(self):
        self.install_fake_tools("crash")
        first_id = self.cli("start")["jobId"]
        second_id = self.cli("start")["jobId"]
        runner = self.start_runner()
        runner.stdout.readline()
        deadline = time.monotonic() + 5
        log = self.queue / "jobs" / first_id / "xcodebuild.log"
        while not log.exists() or "Running native UI tests" not in log.read_text():
            self.assertLess(time.monotonic(), deadline)
            time.sleep(0.01)
        runner.kill()
        runner.communicate(timeout=5)
        rejected = self.cli("runner", "--once", expected_code=2)
        self.assertIn("already holds", rejected["error"])
        time.sleep(1.1)
        self.env["UI_TEST_SCENARIO"] = "passed"
        self.cli("runner", "--once")
        result = self.cli("wait", first_id, expected_code=1)
        self.assertEqual(result["status"], "infrastructure-error")
        self.assertIn("Previous runner stopped", result["error"])
        self.assertEqual(self.cli("wait", second_id)["status"], "passed")

    def test_installation_or_unreadable_results_never_report_passing_tests(self):
        self.install_fake_tools()
        for scenario in ("install-error", "bad-summary"):
            with self.subTest(scenario=scenario):
                self.env["UI_TEST_SCENARIO"] = scenario
                job_id = self.cli("start")["jobId"]
                self.cli("runner", "--once")
                result = self.cli("wait", job_id, expected_code=1)
                self.assertEqual(result["status"], "infrastructure-error")
                self.assertIn("error", result)

    def test_xcode_bootstrap_failure_is_not_an_assertion_failure(self):
        self.install_fake_tools("bootstrap-error")
        job_id = self.cli("start")["jobId"]
        self.cli("runner", "--once")
        result = self.cli("wait", job_id, expected_code=1)
        self.assertEqual(result["status"], "infrastructure-error")
        self.assertIn("runner", result["error"])
        self.assertIn("preparing to run tests", result["failures"][0]["message"])

    def test_separate_shared_queue_supports_different_host_paths(self):
        self.install_fake_tools()
        self.queue = self.root / "shared"
        self.env["FIGURO_UI_TEST_QUEUE"] = str(self.queue)
        job_id = self.cli("start")["jobId"]
        host_mount = self.root / "host-mount"
        host_mount.symlink_to(self.queue, target_is_directory=True)
        completed = subprocess.run(
            [sys.executable, str(CLI), "runner", "--once", "--queue", str(host_mount)],
            cwd=self.root, env=self.env, capture_output=True, text=True, timeout=15)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(json.loads(completed.stdout)["status"], "passed")
        result = self.cli("wait", job_id)
        self.assertFalse(Path(result["artifacts"]["log"]).is_absolute())
        self.assertTrue((self.queue / result["artifacts"]["log"]).is_file())

    def test_make_test_exports_failed_results_and_keeps_each_run(self):
        self.install_fake_tools("failed")
        completed = subprocess.run(["make", "test"], cwd=self.repo, env=self.env,
                                   capture_output=True, text=True, timeout=15)
        self.assertNotEqual(completed.returncode, 0)
        latest = self.repo / "apps/macos/build/ui-tests/latest.json"
        self.assertTrue(latest.exists(), completed.stdout + completed.stderr)
        result = json.loads(latest.read_text())
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["exitCode"], 2)  # make preserves the failed Xcode invocation
        self.assertEqual(result["failures"][0]["message"], "XCTAssertTrue failed")
        artifacts = {key: self.repo / path for key, path in result["artifacts"].items()}
        self.assertTrue(artifacts["summary"].is_file())
        self.assertTrue(artifacts["testDetails"].is_file())
        self.assertTrue((artifacts["attachments"] / "failure.png").is_file())
        self.assertIn("Running native UI tests", artifacts["log"].read_text())

        self.env["UI_TEST_SCENARIO"] = "passed"
        completed = subprocess.run(["make", "test"], cwd=self.repo, env=self.env,
                                   capture_output=True, text=True, timeout=15)
        self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        new_result = json.loads(latest.read_text())
        self.assertEqual(new_result["status"], "passed")
        self.assertNotEqual(new_result["artifacts"]["summary"], result["artifacts"]["summary"])
        self.assertTrue(artifacts["summary"].exists())

    def test_make_test_records_export_errors_without_hiding_test_failures(self):
        self.install_fake_tools("failed-bad-summary")
        completed = subprocess.run(["make", "test"], cwd=self.repo, env=self.env,
                                   capture_output=True, text=True, timeout=15)
        self.assertNotEqual(completed.returncode, 0)
        result = json.loads((self.repo / "apps/macos/build/ui-tests/latest.json").read_text())
        self.assertEqual(result["status"], "infrastructure-error")
        self.assertEqual(result["exitCode"], 2)
        self.assertIn("error", result)
        self.assertTrue((self.repo / result["artifacts"]["resultBundle"]).is_dir())

    def test_make_test_results_exports_existing_bundle_without_rerunning_tests(self):
        self.install_fake_tools("failed")
        old_bundle = self.repo / "apps/macos/build/Logs/Test/Test-Figuro-existing.xcresult"
        old_bundle.mkdir(parents=True)
        completed = subprocess.run(["make", "test-results"], cwd=self.repo, env=self.env,
                                   capture_output=True, text=True, timeout=15)
        self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        result = json.loads((self.repo / "apps/macos/build/ui-tests/latest.json").read_text())
        self.assertEqual(result["status"], "failed")
        self.assertEqual(self.repo / result["artifacts"]["resultBundle"], old_bundle)
        self.assertFalse((old_bundle.parent / "execution.json").exists())

    def test_local_timeout_publishes_results_and_stops_live_output_processes(self):
        self.install_fake_tools("timeout")
        completed = subprocess.run(
            [sys.executable, str(CLI), "local", "--timeout", "0.4"],
            cwd=self.repo, env=self.env, capture_output=True, text=True, timeout=15)
        self.assertEqual(completed.returncode, 2, completed.stdout + completed.stderr)
        result = json.loads((self.repo / "apps/macos/build/ui-tests/latest.json").read_text())
        self.assertEqual(result["status"], "infrastructure-error")
        self.assertIn("timeout", result["error"])
        self.assertTrue((self.repo / result["artifacts"]["resultBundle"]).is_dir())
        time.sleep(1.1)
        self.assertFalse((self.repo / "orphan-child").exists())


if __name__ == "__main__":
    unittest.main()
