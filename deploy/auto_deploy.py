"""Deploy validated release packages through Hostinger, preserving its saved env."""
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.request

API = "https://developers.hostinger.com/api/vps/v1/virtual-machines/1083072"
PROJECT = "socialchutney-project1"
FRONTEND = "https://app.thesocialchutneyco.com"
BACKEND = "https://backend.thesocialchutneyco.com"


def api(path, method="GET", payload=None):
    token = os.environ["HOSTINGER_API_TOKEN"]
    request = urllib.request.Request(
        API + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        method=method,
        headers={"Authorization": "Bearer " + token,
                 "Content-Type": "application/json", "User-Agent": "SocialChutney-Deploy"},
    )
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.load(response)
        except (urllib.error.URLError, ValueError):
            if attempt == 4:
                raise RuntimeError("Hostinger API unavailable; inspect its action status") from None
            time.sleep(10)


def wait_action(action):
    deadline = time.monotonic() + 600
    while time.monotonic() < deadline:
        state = api("/actions/" + str(action["id"]))["state"]
        if state == "success":
            return
        if state in {"failed", "error", "cancelled"}:
            raise RuntimeError("Hostinger deployment action failed")
        time.sleep(10)
    raise RuntimeError("Hostinger deployment action timed out")


def get(url):
    with urllib.request.urlopen(url, timeout=15) as response:
        return response.read().decode()


def verify(expected_sha=None):
    deadline = time.monotonic() + 300
    while time.monotonic() < deadline:
        try:
            get(BACKEND + "/api/")
            html = get(FRONTEND + "/")
            if '<div id="root"' not in html:
                raise ValueError("Frontend HTML missing")
            if expected_sha and get(FRONTEND + "/deploy-version.txt").strip() != expected_sha:
                raise ValueError("Frontend version has not switched")
            return
        except (urllib.error.URLError, ValueError, TimeoutError):
            time.sleep(10)
    raise RuntimeError("Public HTTPS health/version checks failed")


def main():
    sha = os.environ["DEPLOY_SHA"]
    if len(sha) != 40 or any(c not in "0123456789abcdef" for c in sha):
        raise ValueError("Invalid deployment commit")
    previous = api("/docker/" + PROJECT)
    content = Path(__file__).with_name("auto-compose.yaml").read_text().replace("__DEPLOY_SHA__", sha)
    payload = {"project_name": PROJECT, "content": content,
               "environment": previous["environment"]}
    try:
        wait_action(api("/docker", "POST", payload))
        verify(sha)
    except Exception:
        print("Deployment failed; restoring previous configuration", flush=True)
        rollback = {"project_name": PROJECT, "content": previous["content"],
                    "environment": previous["environment"]}
        wait_action(api("/docker", "POST", rollback))
        verify()
        raise RuntimeError("Deployment failed; previous configuration restored") from None
    print("Production verified at commit " + sha)


if __name__ == "__main__":
    main()
