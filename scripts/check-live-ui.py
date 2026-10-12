"""Run browser QA against a disposable instance, without touching live data."""
from pathlib import Path
import subprocess
import uuid


def main():
    root = Path(__file__).resolve().parents[1]
    output = root / "docs" / "screenshots"
    output.mkdir(parents=True, exist_ok=True)
    name = "milo-ui-review-" + uuid.uuid4().hex[:8]
    def run(*args):
        subprocess.run(["docker", *args], cwd=root, check=True)
    run("compose", "build", "milo")
    run("network", "inspect", "milo_default")
    run("build", "-f", "docker/ui-check.Dockerfile", "-t", "milo-ui-check", ".")
    created = False
    try:
        run("run", "-d", "--name", name, "--network", "milo_default", "--read-only", "--tmpfs", "/tmp:size=64m",
            "-e", "MILO_DATA_DIR=/tmp/milo-ui", "-e", "MILO_PUBLIC_URL=https://" + name + ":8080",
            "--mount", "type=bind,source=" + str(root / "certs") + ",target=/certs,readonly", "milo-milo")
        created = True
        run("run", "--rm", "--network", "milo_default", "-e", "MILO_UI_URL=https://" + name + ":8080",
            "-e", "MILO_UI_FIXTURE=1", "--mount", "type=bind,source=" + str(output) + ",target=/screenshots", "milo-ui-check")
    finally:
        if created:
            run("rm", "-f", name)


if __name__ == "__main__":
    main()
