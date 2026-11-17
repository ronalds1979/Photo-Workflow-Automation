import importlib.util
import os
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PY_SCRIPT_PATH = os.path.join(SCRIPT_DIR, "find-duplicated.py")
PS_FOLDER_SCRIPT = os.path.join(SCRIPT_DIR, "find duplicated based on folder.ps1")
PS_VIDEO_SCRIPT = os.path.join(SCRIPT_DIR, "find-duplicated-video.ps1")

spec = importlib.util.spec_from_file_location("find_duplicated", PY_SCRIPT_PATH)
find_duplicated = importlib.util.module_from_spec(spec)
spec.loader.exec_module(find_duplicated)


class TestPhotoWorkflowSecurity(unittest.TestCase):
    def test_quarantine_file_atomic_collision_and_escape_fallback(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            root_dir = os.path.join(tmpdir, "root")
            outside_dir = os.path.join(tmpdir, "outside")
            quarantine_dir = os.path.join(tmpdir, "quarantine")
            os.makedirs(root_dir)
            os.makedirs(outside_dir)
            os.makedirs(quarantine_dir)

            src1 = os.path.join(root_dir, "photo.jpg")
            src2 = os.path.join(root_dir, "photo2.jpg")
            outside_file = os.path.join(outside_dir, "escape.jpg")
            for p in (src1, src2, outside_file):
                with open(p, "wb") as f:
                    f.write(b"data")

            # Pre-create photo.jpg in quarantine to force collision resolution (_1)
            existing = os.path.join(quarantine_dir, "photo.jpg")
            with open(existing, "wb") as f:
                f.write(b"existing")

            dest1 = find_duplicated._quarantine_file(src1, root_dir, quarantine_dir)
            self.assertEqual(os.path.basename(dest1), "photo_1.jpg")
            self.assertFalse(os.path.exists(src1))
            self.assertTrue(os.path.isfile(dest1))

            # Path outside root_dir should fall back to basename inside quarantine_dir
            dest_escape = find_duplicated._quarantine_file(outside_file, root_dir, quarantine_dir)
            self.assertEqual(os.path.abspath(os.path.dirname(dest_escape)), os.path.abspath(quarantine_dir))
            self.assertEqual(os.path.basename(dest_escape), "escape.jpg")

    def test_worker_reparse_point_rejection(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            sample = os.path.join(tmpdir, "IMG_0001.jpg")
            nef = os.path.join(tmpdir, "IMG_0001.nef")
            with open(sample, "wb") as f:
                f.write(b"fake")
            with open(nef, "wb") as f:
                f.write(b"fake")

            with patch.object(find_duplicated, "_is_reparse_point", return_value=True):
                with self.assertRaises(OSError):
                    find_duplicated.get_jpg_hash(sample)
                with self.assertRaises(OSError):
                    find_duplicated.get_nef_hash(nef)

                msg, deleted, _ = find_duplicated.process_jpg_file(
                    sample,
                    [nef],
                    verbose=False,
                    dry_run=False,
                    delete=False,
                    root_dir=tmpdir,
                    quarantine_dir=os.path.join(tmpdir, "_q"),
                )
                self.assertFalse(deleted)

    def test_delete_jpgs_rejects_quarantine_root_or_ancestor(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            scan_dir = os.path.join(tmpdir, "scan")
            os.makedirs(scan_dir)

            with self.assertRaises(ValueError):
                find_duplicated.delete_jpgs_with_nef_pairs(scan_dir, quarantine_dir=scan_dir)
            with self.assertRaises(ValueError):
                find_duplicated.delete_jpgs_with_nef_pairs(scan_dir, quarantine_dir=tmpdir)

    def test_powershell_folder_script_rejects_overlapping_directories(self):
        if sys.platform != "win32":
            self.skipTest("PowerShell tests require Windows")
        with tempfile.TemporaryDirectory() as tmpdir:
            parent_dir = os.path.join(tmpdir, "photos")
            child_dir = os.path.join(parent_dir, "originals")
            quarantine_dir = os.path.join(tmpdir, "quarantine")
            os.makedirs(child_dir)
            os.makedirs(quarantine_dir)

            res = subprocess.run(
                [
                    "powershell",
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    PS_FOLDER_SCRIPT,
                    "-SourceFolder",
                    parent_dir,
                    "-ReferenceFolder",
                    child_dir,
                    "-QuarantineFolder",
                    quarantine_dir,
                ],
                capture_output=True,
                text=True,
                timeout=15,
            )
            self.assertNotEqual(res.returncode, 0)
            self.assertIn("overlap", (res.stderr + res.stdout).lower())

            res_q = subprocess.run(
                [
                    "powershell",
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    PS_FOLDER_SCRIPT,
                    "-SourceFolder",
                    child_dir,
                    "-ReferenceFolder",
                    quarantine_dir,
                    "-QuarantineFolder",
                    parent_dir,
                ],
                capture_output=True,
                text=True,
                timeout=15,
            )
            self.assertNotEqual(res_q.returncode, 0)
            self.assertIn("ancestor", (res_q.stderr + res_q.stdout).lower())

    def test_powershell_video_script_rejects_outside_and_ancestor_paths(self):
        if sys.platform != "win32":
            self.skipTest("PowerShell tests require Windows")
        with tempfile.TemporaryDirectory() as tmpdir:
            drive_root = os.path.join(tmpdir, "drive")
            other_dir = os.path.join(tmpdir, "outside")
            target_dir = os.path.join(drive_root, "inbox")
            quarantine_dir = os.path.join(tmpdir, "q")
            os.makedirs(target_dir)
            os.makedirs(other_dir)
            os.makedirs(quarantine_dir)

            res_outside = subprocess.run(
                [
                    "powershell",
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    PS_VIDEO_SCRIPT,
                    "-FolderToCheck",
                    other_dir,
                    "-DriveRoot",
                    drive_root,
                    "-QuarantineFolder",
                    quarantine_dir,
                ],
                capture_output=True,
                text=True,
                timeout=15,
            )
            self.assertNotEqual(res_outside.returncode, 0)
            self.assertIn("must be located inside", (res_outside.stderr + res_outside.stdout).lower())

            res_ancestor = subprocess.run(
                [
                    "powershell",
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    PS_VIDEO_SCRIPT,
                    "-FolderToCheck",
                    target_dir,
                    "-DriveRoot",
                    drive_root,
                    "-QuarantineFolder",
                    tmpdir,
                ],
                capture_output=True,
                text=True,
                timeout=15,
            )
            self.assertNotEqual(res_ancestor.returncode, 0)
            self.assertIn("ancestor", (res_ancestor.stderr + res_ancestor.stdout).lower())


if __name__ == "__main__":
    unittest.main()
