"""Smoke check a running Compose deployment; never deletes volumes or prepares mock data.
Usage: python3 scripts/check_compose.py [http://localhost:3000]
"""
import json
import subprocess
import sys
from urllib.error import HTTPError
from urllib.request import urlopen


def main():
    base = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000").rstrip("/")
    config = json.loads(subprocess.check_output(["docker", "compose", "config", "--format", "json"]))
    assert set(config["services"]) == {"data-init", "backend", "frontend"}
    assert "ports" not in config["services"]["backend"]
    assert config["services"]["backend"]["volumes"][0]["read_only"]
    with urlopen(base, timeout=30) as response:
        assert response.status == 200
    with urlopen(base + "/api/health", timeout=30) as response:
        health = json.load(response)
    assert health["status"] == "ok" and health["m101_cached"] is True, health
    with urlopen(base + "/api/frames?ra=210.80227&dec=54.34895&fov=3", timeout=30) as response:
        data = json.load(response)
    assert data["provenance"]["data_origin"] == "observed_spherex"
    assert len(data["epochs"]) == 2 and len(data["frames"]) == 2
    for frame in data["frames"]:
        assert frame["detector"] == 2
        assert (frame["width"], frame["height"]) == (30, 30)
        assert len(frame["pixelData"]) == len(frame["validMask"]) == 900
        assert any(value == 0 for value in frame["validMask"])
    try:
        urlopen(base + "/api/frames?ra=0&dec=0&fov=3", timeout=30)
        raise AssertionError("Unsupported field unexpectedly succeeded")
    except HTTPError as exc:
        assert exc.code == 404
    print("PASS Compose: proxy, health, two authentic M101 frames, masks and unsupported field")
    print("Observation IDs:", ", ".join(frame["id"] for frame in data["frames"]))


if __name__ == "__main__":
    main()
