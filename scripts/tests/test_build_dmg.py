import argparse
import importlib.util
from pathlib import Path
import platform
import plistlib
import shutil
import struct
import subprocess
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("build_dmg", Path(__file__).parents[1] / "build-dmg.py")
dmg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dmg)


LIPO = next((tool for name in ("lipo", "llvm-lipo", "llvm-lipo-19", "llvm-lipo-18")
             if (tool := shutil.which(name))), None)


def write_macho(path, architectures):
    """Minimal real Mach-O objects, bundled in a universal header when needed."""
    cpu_types = {"arm64": (0x0100000C, 0), "x86_64": (0x01000007, 3)}
    slices = [struct.pack("<8I", 0xFEEDFACF, *cpu_types[arch], 1, 0, 0, 0, 0)
              for arch in architectures]
    if len(slices) == 1:
        path.write_bytes(slices[0])
        return
    offset = 8 + 20 * len(slices)
    header = struct.pack(">2I", 0xCAFEBABE, len(slices))
    for arch, data in zip(architectures, slices):
        header += struct.pack(">5I", *cpu_types[arch], offset, len(data), 0)
        offset += len(data)
    path.write_bytes(header + b"".join(slices))


class BuildDMGTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        icon = self.root / "apps/macos/Resources/figuro.icon"
        icon.mkdir(parents=True)
        (icon / "icon.json").write_text("{}")
        (self.root / "LICENSE").write_text("MIT License")
        self.args = argparse.Namespace(version="0.2.0", build_number="7", output_dir=self.root / "output")
        self.calls = []
        self.patches = [patch.object(dmg, "ROOT", self.root), patch.object(dmg.platform, "system", return_value="Darwin"),
                        patch.object(dmg.shutil, "which", return_value="/mock/tool"), patch.object(dmg, "run", side_effect=self.command)]
        for item in self.patches:
            item.start()
            self.addCleanup(item.stop)

    def command(self, *command, **kwargs):
        self.calls.append(command)
        if command[:3] == ("xcrun", "lipo", "-archs"):
            return "x86_64 arm64 \n"
        if command == ("xcodebuild", "-version"):
            return "Xcode 26.3\nBuild version 17C529\n"
        if command[0] == "xcodebuild":
            app = self.root / "apps/macos/build/dmg-derived-data/Build/Products/Release/Figuro.app"
            resources = app / "Contents/Resources/EditorHost"
            resources.mkdir(parents=True, exist_ok=True)
            (resources / "index.html").write_text("editor")
            with (app / "Contents/Info.plist").open("wb") as file:
                plistlib.dump({"CFBundleShortVersionString": "0.2.0"}, file)
        if command[:2] == ("hdiutil", "create"):
            stage = Path(command[command.index("-srcfolder") + 1])
            self.assertEqual((stage / "Applications").readlink(), Path("/Applications"))
            self.assertTrue((stage / "LICENSE.txt").is_file())
            self.assertTrue((stage / "Install.txt").is_file())
            Path(command[-1]).write_bytes(b"disk image")

    def test_release_build_packages_both_architectures_and_emits_checksum(self):
        dmg.build(self.args)
        build = next(call for call in self.calls if call[0] == "xcodebuild" and "build" in call)
        for setting in ("Release", "ARCHS=arm64 x86_64", "ONLY_ACTIVE_ARCH=NO", "CODE_SIGNING_ALLOWED=NO",
                        "MARKETING_VERSION=0.2.0", "CURRENT_PROJECT_VERSION=7"):
            self.assertIn(setting, build)
        image = self.args.output_dir / "Figuro-0.2.0-macos-universal.dmg"
        self.assertEqual(image.read_bytes(), b"disk image")
        self.assertIn(image.name, image.with_suffix(".dmg.sha256").read_text())
        self.assertTrue(any(call[:4] == ("codesign", "--force", "--sign", "-") for call in self.calls))

    def test_architecture_verification_failure_stops_before_signing_or_packaging(self):
        def fail(*command, **kwargs):
            output = self.command(*command, **kwargs)
            if command[:2] == ("xcrun", "lipo"):
                raise subprocess.CalledProcessError(1, command)
            return output
        with patch.object(dmg, "run", side_effect=fail):
            with self.assertRaises(subprocess.CalledProcessError):
                dmg.build(self.args)
        self.assertFalse(any(call[0] in ("codesign", "hdiutil") for call in self.calls))
        self.assertEqual(list(self.args.output_dir.iterdir()), [])

    def test_missing_architecture_stops_before_signing_or_packaging(self):
        for architectures, missing in (("arm64\n", "x86_64"), ("x86_64\n", "arm64"), ("", "arm64")):
            with self.subTest(architectures=architectures):
                self.calls.clear()
                def command(*args, **kwargs):
                    if args[:2] == ("xcrun", "lipo"):
                        self.calls.append(args)
                        return architectures
                    return self.command(*args, **kwargs)
                with patch.object(dmg, "run", side_effect=command):
                    with self.assertRaisesRegex(ValueError, "missing.*" + missing):
                        dmg.build(self.args)
                self.assertFalse(any(call[0] in ("codesign", "hdiutil") for call in self.calls))
                self.assertEqual(list(self.args.output_dir.iterdir()), [])

    def test_packaging_failure_does_not_replace_existing_distributable(self):
        self.args.output_dir.mkdir()
        image = self.args.output_dir / "Figuro-0.2.0-macos-universal.dmg"
        image.write_bytes(b"previous release")
        def fail(*command, **kwargs):
            output = self.command(*command, **kwargs)
            if command[:2] == ("hdiutil", "verify"):
                raise subprocess.CalledProcessError(1, command)
            return output
        with patch.object(dmg, "run", side_effect=fail):
            with self.assertRaises(subprocess.CalledProcessError):
                dmg.build(self.args)
        self.assertEqual(image.read_bytes(), b"previous release")

    def test_linux_reports_required_platform_without_invoking_build_tools(self):
        with patch.object(dmg.platform, "system", return_value="Linux"):
            with self.assertRaisesRegex(ValueError, "require macOS"):
                dmg.build(self.args)
        self.assertEqual(self.calls, [])

    def test_old_xcode_reports_icon_toolchain_requirement_before_building(self):
        with patch.object(dmg, "run", return_value="Xcode 16.4\n"):
            with self.assertRaisesRegex(ValueError, "Xcode 26"):
                dmg.build(self.args)
        self.assertEqual(self.calls, [])


@unittest.skipUnless(LIPO, "A real lipo or llvm-lipo is required")
class ArchitectureIntegrationTests(unittest.TestCase):
    def test_verification_uses_real_lipo_on_universal_and_thin_macho_files(self):
        def command(*args, **kwargs):
            self.assertEqual(args[:3], ("xcrun", "lipo", "-archs"))
            tools = args if platform.system() == "Darwin" else [LIPO, *args[2:]]
            return subprocess.run(
                tools, check=True, text=True, capture_output=True).stdout

        with tempfile.TemporaryDirectory() as temporary:
            binary = Path(temporary) / "Figuro with spaces"
            with patch.object(dmg, "run", side_effect=command):
                for architectures in (("arm64", "x86_64"), ("x86_64", "arm64")):
                    write_macho(binary, architectures)
                    dmg.verify_architectures(binary)
                for architecture, missing in (("arm64", "x86_64"), ("x86_64", "arm64")):
                    write_macho(binary, (architecture,))
                    with self.assertRaisesRegex(ValueError, "missing.*" + missing):
                        dmg.verify_architectures(binary)


if __name__ == "__main__":
    unittest.main()
