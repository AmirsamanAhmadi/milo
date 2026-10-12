import sys
from pathlib import Path
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src' / 'server'))
from interview import prepare
from assessment import assess

class InterviewTests(unittest.TestCase):
    def test_study_plan_prioritizes_gaps_and_uses_job_requirements(self):
        plan = prepare('Skills Python', {'role': 'Developer', 'description': 'Python SQL Docker'})
        self.assertEqual({t['skill'] for t in plan['topics']}, {'Python', 'SQL', 'Docker'})
        self.assertEqual(plan['topics'][-1]['skill'], 'Python')
        self.assertTrue(plan['topics'][0]['resource']['url'].startswith('https://'))
        self.assertTrue(plan['checklist'])

    def test_recommendations_require_readable_cv(self):
        self.assertEqual(assess('Python', [])['recommendations'], [])
        cv = 'Experience Skills Python SQL Project management Education ' + 'delivered customer projects with measurable outcomes ' * 8
        self.assertIn('Python Developer', assess(cv, [])['recommendations'])
        self.assertIn('Project Manager', assess(cv, [])['recommendations'])
