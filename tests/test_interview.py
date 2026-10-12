import sys
from pathlib import Path
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src' / 'server'))
from interview import prepare
from assessment import assess
from document_assessment import cover_assessment, recommend_documents

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

    def test_interview_quotes_cv_and_actual_job_requirements(self):
        cv = 'Experience: Built Python reporting pipelines and reduced weekly reporting time by 35%.\nSkills: Python SQL.\n' + 'Delivered reliable customer reports with clear documentation and measurable service outcomes. ' * 3
        job = {'role': 'Reporting Engineer', 'company': 'Example Analytics', 'description': 'Build Python reporting pipelines for finance customers. Operate Kubernetes workloads and resolve production incidents.'}
        plan = prepare(cv, job)
        self.assertEqual(plan['company'], 'Example Analytics')
        self.assertIn('35%', plan['requirements'][0]['evidence'])
        self.assertIn('35%', plan['requirements'][0]['question'])
        self.assertIn('finance customers', plan['requirements'][0]['question'])
        self.assertEqual(plan['requirements'][1]['evidence'], '')
        self.assertIn('No direct CV evidence', plan['requirements'][1]['answerOutline'][0])
        changed = prepare('Experience: Managed nursing rosters and trained hospital staff.', job)
        self.assertNotEqual(plan['requirements'][0]['evidence'], changed['requirements'][0]['evidence'])
        self.assertFalse(prepare(cv, {'role':'Engineer','description':'Visa sponsorship is available. Build Python reporting pipelines.'})['requirements'][0]['requirement'].startswith('Visa'))

    def test_cover_quality_and_roles_use_cover_letter_without_cv(self):
        letter = 'Dear Hiring Manager, I am applying for the Python Developer role at Example Analytics. I built Python reporting systems and reduced processing time by 35%. Your company mission motivates me to deliver reliable customer outcomes. Thank you for considering my application; I look forward to discussing the role.'
        score = cover_assessment(letter, {'role': 'Python Developer', 'company': 'Example Analytics'})
        self.assertGreater(score['score'], 50)
        recommendations = recommend_documents('', letter)
        self.assertIn('Python Developer', recommendations['roles'])
        item = next(s for s in recommendations['suggestions'] if s['role'] == 'Python Developer')
        self.assertEqual(item['sources'], ['Cover letter'])
        self.assertIn('Python', item['evidence'][0]['text'])
