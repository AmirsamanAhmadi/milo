import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("assessment", Path(__file__).resolve().parents[1] / "src/server/assessment.py")
assessment = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assessment)

CV = """Alex Example alex@example.com
Experience: Delivered Python projects and improved reporting by 25%.
Skills: Python, SQL, Docker, stakeholder management and communication.
Education: University degree and professional certification.
Worked with teams to build reliable services and explain technical results to colleagues."""
DESCRIPTION = "We need an engineer with Python, SQL, Docker and Kubernetes. You will build reliable services, collaborate with colleagues, review code and maintain production systems with clear documentation."


class AssessmentTests(unittest.TestCase):
    def test_scores_explain_matches_and_missing_evidence(self):
        result = assessment.assess(CV, [{"role": "Engineer", "description": DESCRIPTION}])
        self.assertEqual(result["cv"]["score"], 100)
        fit = result["fits"][0]
        self.assertEqual(fit["score"], 75)
        self.assertEqual(fit["missing"], ["Kubernetes"])
        self.assertTrue(any(item["skill"] == "Python" for item in fit["evidence"]))

    def test_absent_cv_or_description_does_not_invent_a_score(self):
        self.assertIsNone(assessment.assess("", [{"description": DESCRIPTION}])["fits"][0]["score"])
        self.assertIsNone(assessment.assess(CV, [{"role": "Python Engineer"}])["fits"][0]["score"])

    def test_skill_boundaries_do_not_match_java_inside_javascript(self):
        self.assertFalse(assessment.mentions("JavaScript developer", "java"))


if __name__ == "__main__":
    unittest.main()
