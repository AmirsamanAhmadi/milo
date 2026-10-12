import importlib.util
from contextlib import closing
from pathlib import Path
import sqlite3
import tempfile
import unittest


def load_script(name):
    spec = importlib.util.spec_from_file_location(
        name, Path(__file__).resolve().parents[1] / "scripts" / f"{name}.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class BackupTests(unittest.TestCase):
    def test_tls_preserves_existing_pair_and_rejects_incomplete_pair(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder / "key.pem").write_text("existing key")
            with self.assertRaises(ValueError):
                load_script("create-local-tls").create_tls(folder)
            (folder / "cert.pem").write_text("existing certificate")
            load_script("create-local-tls").create_tls(folder)
            self.assertEqual((folder / "key.pem").read_text(), "existing key")
            self.assertEqual((folder / "cert.pem").read_text(), "existing certificate")

    def test_backup_includes_committed_wal_data_and_preserves_existing_files(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "live.sqlite"
            destination = Path(directory) / "backup.sqlite"
            with closing(sqlite3.connect(source)) as live:
                live.execute("PRAGMA journal_mode=WAL")
                live.execute("CREATE TABLE records (value TEXT)")
                live.execute("INSERT INTO records VALUES ('private record')")
                live.commit()
                load_script("backup").backup(source, destination)
                with closing(sqlite3.connect(destination)) as copy:
                    self.assertEqual(copy.execute("SELECT value FROM records").fetchone()[0], "private record")
                with self.assertRaises(FileExistsError):
                    load_script("backup").backup(source, destination)
                with self.assertRaises(ValueError):
                    load_script("backup").backup(source, source)

    def test_missing_source_does_not_create_database_or_leave_backup(self):
        with tempfile.TemporaryDirectory() as directory:
            source, destination = Path(directory) / "missing.sqlite", Path(directory) / "backup.sqlite"
            with self.assertRaises(sqlite3.Error):
                load_script("backup").backup(source, destination)
            self.assertFalse(source.exists())
            self.assertFalse(destination.exists())


if __name__ == "__main__":
    unittest.main()
