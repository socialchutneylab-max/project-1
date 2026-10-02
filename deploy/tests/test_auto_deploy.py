import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import auto_deploy


class DeploymentTests(unittest.TestCase):
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
