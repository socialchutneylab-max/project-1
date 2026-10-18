import os
from pathlib import Path
import sys
import unittest
import urllib.error
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import auto_deploy


class DeploymentTests(unittest.TestCase):
    def test_hostinger_requests_target_vps2(self):
        response = MagicMock()
        response.__enter__.return_value.read.return_value = b'{"id": 1}'
        with patch.dict(os.environ, HOSTINGER_API_TOKEN="test-only"), \
             patch.object(auto_deploy.urllib.request, "urlopen", return_value=response) as open_url:
            auto_deploy.api("/docker/socialchutney-project1")
        self.assertEqual(open_url.call_args.args[0].full_url,
                         "https://developers.hostinger.com/api/vps/v1/virtual-machines/2071790/docker/socialchutney-project1")

    def test_health_request_pins_vps2_with_hostname_tls_verification(self):
        response = MagicMock()
        response.__enter__.return_value.read.return_value = b"healthy"
        with patch.object(auto_deploy.urllib.request, "urlopen", return_value=response), \
             patch("subprocess.run", return_value=SimpleNamespace(stdout="healthy")) as run:
            self.assertEqual(auto_deploy.get(auto_deploy.BACKEND + "/api/"), "healthy")
        run.assert_called_once()
        command = run.call_args.args[0]
        self.assertIn("backend.thesocialchutneyco.com:443:200.141.13.72", command)
        self.assertIn("--resolve", command)
        self.assertIn("--fail", command)
        self.assertNotIn("--insecure", command)
        self.assertNotIn("-k", command)
        self.assertFalse(run.call_args.kwargs.get("shell", False))

    def test_write_is_not_repeated_after_lost_response(self):
        with patch.dict(os.environ, HOSTINGER_API_TOKEN="test-only"), \
             patch.object(auto_deploy.urllib.request, "urlopen", side_effect=urllib.error.URLError("response lost")) as open_url, \
             patch.object(auto_deploy.time, "sleep"):
            with self.assertRaises(RuntimeError):
                auto_deploy.api("/docker", "POST", {"project_name": "socialchutney-project1"})
        self.assertEqual(open_url.call_count, 1)

    def test_lost_deploy_response_does_not_queue_competing_rollback(self):
        previous = {"content": "old compose", "environment": "DATABASE_URL=private"}
        outcome_error = auto_deploy.UnknownWriteOutcome
        with patch.dict(os.environ, DEPLOY_SHA="a" * 40), \
             patch.object(auto_deploy, "api", side_effect=[previous, outcome_error("response lost"), {"id": 2}]) as api, \
             patch.object(auto_deploy, "wait_action"), patch.object(auto_deploy, "verify"), \
             patch.object(auto_deploy.Path, "read_text", return_value="version=__DEPLOY_SHA__"):
            with self.assertRaises(outcome_error):
                auto_deploy.main()
        self.assertEqual(api.call_count, 2)

    def run_deploy(self, verify_failure=False):
        previous = {"content": "old compose", "environment": "DATABASE_URL=private"}
        with patch.dict(os.environ, DEPLOY_SHA="a" * 40), \
             patch.object(auto_deploy, "api", side_effect=[previous, {"id": 1}, {"id": 2}]) as api, \
             patch.object(auto_deploy, "wait_action"), \
             patch.object(auto_deploy, "verify", side_effect=[RuntimeError("unhealthy"), None] if verify_failure else None), \
             patch.object(auto_deploy.Path, "read_text", return_value="version=__DEPLOY_SHA__"):
            if verify_failure:
                with self.assertRaisesRegex(RuntimeError, "previous configuration restored"):
                    auto_deploy.main()
            else:
                auto_deploy.main()
            return previous, api.call_args_list

    def test_keeps_saved_environment_and_pins_commit(self):
        previous, calls = self.run_deploy()
        payload = calls[1].args[2]
        self.assertEqual(payload["environment"], previous["environment"])
        self.assertEqual(payload["content"], "version=" + "a" * 40)
        self.assertEqual(len(calls), 2)

    def test_restores_previous_configuration_after_health_failure(self):
        previous, calls = self.run_deploy(verify_failure=True)
        rollback = calls[2].args[2]
        self.assertEqual(rollback["content"], previous["content"])
        self.assertEqual(rollback["environment"], previous["environment"])

    def test_rejects_invalid_commit_before_api_access(self):
        with patch.dict(os.environ, DEPLOY_SHA="invalid"), patch.object(auto_deploy, "api") as api:
            with self.assertRaises(ValueError):
                auto_deploy.main()
            api.assert_not_called()


if __name__ == "__main__":
    unittest.main()
