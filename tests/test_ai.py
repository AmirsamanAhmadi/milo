import importlib.util
import json
import os
import secrets
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("ai", Path(__file__).resolve().parents[1] / "src/server/ai.py")
ai = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ai)
RESULT = {"score": 70, "summary": "Review", "strengths": ["Evidence"], "gaps": ["Gap"],
          "recommendations": ["Review"], "ats_notes": [], "tailored_cv": "", "cover_letter": ""}


class AITests(unittest.TestCase):
    def test_openai_uses_structured_output_and_does_not_store_response(self):
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, size):
                return json.dumps({"status": "completed", "output": [{"content": [{"type": "output_text", "text": json.dumps(RESULT)}]}]}).encode()
        def open_request(request, timeout):
            payload = json.loads(request.data)
            self.assertFalse(payload["store"])
            self.assertTrue(payload["text"]["format"]["strict"])
            self.assertIn("untrusted", payload["instructions"])
            return Response()
        with patch.dict(os.environ, {"OPENAI_API_KEY": secrets.token_hex(32), "OPENAI_MODEL": "fixture-model", "MILO_AI_PROVIDER": "OpenAI"}):
            self.assertEqual(ai.generate({"action": "assess", "cv": "CV", "job": {}}, open_request)["score"], 70)

    def test_invalid_scores_and_shapes_are_rejected(self):
        for value in (101, -1, True, "95"):
            with self.assertRaises(ValueError): ai.validate({**RESULT, "score": value})
        with self.assertRaises(ValueError): ai.validate({"score": 70})

    def test_local_ai_uses_only_configured_endpoint(self):
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, size): return json.dumps({"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(RESULT)}}]}).encode()
        def open_request(request, timeout):
            self.assertEqual(request.full_url, "http://localhost:11434/v1/chat/completions")
            self.assertEqual(json.loads(request.data)["model"], "local-model")
            return Response()
        with patch.dict(os.environ, {"MILO_AI_PROVIDER": "Local AI", "LOCAL_AI_URL": "http://localhost:11434/v1", "LOCAL_AI_MODEL": "local-model"}):
            self.assertEqual(ai.generate({"action": "assess"}, open_request)["score"], 70)

    def test_codex_generation_is_ephemeral_and_excludes_server_secrets(self):
        def run(command, **kwargs):
            self.assertIn('--ephemeral', command)
            self.assertIn('read-only', command)
            self.assertIn('shell_tool', command)
            self.assertNotIn('OPENAI_API_KEY', kwargs['env'])
            self.assertEqual(kwargs['env']['CODEX_HOME'], '/private/member')
            Path(command[command.index('--output-last-message') + 1]).write_text(json.dumps(RESULT))
        with patch.dict(os.environ, {'MILO_AI_PROVIDER': 'ChatGPT', 'MILO_CODEX_HOME': '/private/member'}), patch.object(ai.subprocess, 'run', run):
            self.assertEqual(ai.generate({'action': 'assess'})['score'], 70)


if __name__ == "__main__":
    unittest.main()
