"""Generate disposable localhost TLS files with Python 3.10+ and OpenSSL."""
from pathlib import Path
import subprocess
import tempfile


def create_tls(directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    key, cert = directory / "key.pem", directory / "cert.pem"
    if key.exists() or cert.exists():
        if not (key.is_file() and cert.is_file()):
            raise ValueError("Both certs/key.pem and certs/cert.pem are required.")
        print("Existing TLS files preserved.")
        return
    with tempfile.TemporaryDirectory(dir=directory) as temporary:
        staging = Path(temporary)
        subprocess.run([
            "openssl", "req", "-x509", "-newkey", "rsa:3072", "-sha256",
            "-nodes", "-days", "30", "-keyout", str(staging / "key.pem"),
            "-out", str(staging / "cert.pem"), "-subj", "/CN=localhost",
            "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1",
        ], check=True)
        # Exclusive writes also preserve files created by another invocation.
        for name in ("key.pem", "cert.pem"):
            with (directory / name).open("xb") as output:
                output.write((staging / name).read_bytes())
            (directory / name).chmod(0o644)
    directory.chmod(0o755)
    print("Local TLS files created; valid for 30 days.")


if __name__ == "__main__":
    try:
        create_tls(Path(__file__).resolve().parent.parent / "certs")
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error)) from error
