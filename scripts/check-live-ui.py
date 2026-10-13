"""Run browser QA against a disposable instance, without touching live data."""
from pathlib import Path
import subprocess
import uuid
import time


def main():
    root = Path(__file__).resolve().parents[1]
    output = root / "docs" / "screenshots"
    output.mkdir(parents=True, exist_ok=True)
    name = "milo-ui-review-" + uuid.uuid4().hex[:8]
    def run(*args):
        subprocess.run(["docker", *args], cwd=root, check=True)
    run("compose", "build", "database", "milo")
    run("network", "inspect", "milo_default")
    run("build", "-f", "docker/ui-check.Dockerfile", "-t", "milo-ui-check", ".")
    created = False
    database_created = False
    socket_volume = name + "-socket"
    database_name = name + "-database"
    run("volume", "create", socket_volume)
    try:
        run("run", "-d", "--name", database_name, "--read-only", "--tmpfs", "/data:size=64m,uid=1000,gid=1000,mode=700",
            "--mount", "type=volume,source=" + socket_volume + ",target=/run/milo-db", "milo-database")
        database_created = True
        for _ in range(30):
            health = subprocess.check_output(["docker", "inspect", "--format", "{{.State.Health.Status}}", database_name], text=True).strip()
            if health == "healthy":
                break
            time.sleep(1)
        else:
            raise RuntimeError("Disposable database did not become healthy")
        run("run", "-d", "--name", name, "--network", "milo_default", "--read-only", "--tmpfs", "/tmp:size=64m",
            "--mount", "type=volume,source=" + socket_volume + ",target=/run/milo-db", "-e", "MILO_DB_SOCKET=/run/milo-db/database.sock",
            "-e", "MILO_DATA_DIR=/tmp/milo-ui", "-e", "MILO_PUBLIC_URL=http://" + name + ":8080", "milo-milo")
        created = True
        run("run", "--rm", "--network", "milo_default", "-e", "MILO_UI_URL=http://" + name + ":8080",
            "-e", "MILO_UI_FIXTURE=1", "--mount", "type=bind,source=" + str(output) + ",target=/screenshots", "milo-ui-check")
    finally:
        if created:
            run("rm", "-f", name)
        if database_created:
            run("rm", "-f", database_name)
        run("volume", "rm", socket_volume)


if __name__ == "__main__":
    main()
