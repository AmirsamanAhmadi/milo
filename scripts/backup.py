"""Create a consistent SQLite backup using Python 3.10+ (no dependencies)."""
import argparse
from contextlib import closing
import os
from pathlib import Path
import sqlite3


def backup(source: Path, destination: Path) -> None:
    source = source.resolve()
    destination = destination.resolve()
    if source == destination:
        raise ValueError("Backup destination must differ from the live database.")
    # Exclusive creation prevents accidentally overwriting another backup.
    descriptor = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(descriptor)
    try:
        with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as live:
            with closing(sqlite3.connect(destination)) as copy:
                live.backup(copy)
    except Exception:
        destination.unlink(missing_ok=True)
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    source = Path(os.environ.get("MILO_DATA_DIR", "/data")) / "milo.sqlite"
    try:
        backup(source, args.destination)
    except (OSError, sqlite3.Error, ValueError) as error:
        parser.exit(1, f"{error}\n")
    print("Database backup complete.")


if __name__ == "__main__":
    main()
