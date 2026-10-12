"""Build a local interview study plan from the JD and CV skill evidence."""
from assessment import SKILLS, assess, mentions
import re

RESOURCES = {
    'Python': ('Python tutorial', 'https://docs.python.org/3/tutorial/'),
    'JavaScript': ('JavaScript guide', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide'),
    'SQL': ('PostgreSQL tutorial', 'https://www.postgresql.org/docs/current/tutorial.html'),
    'Cloud': ('Microsoft Learn cloud training', 'https://learn.microsoft.com/en-us/training/azure/'),
    'Docker': ('Docker introduction', 'https://docs.docker.com/get-started/'),
    'Kubernetes': ('Kubernetes basics', 'https://kubernetes.io/docs/tutorials/kubernetes-basics/'),
    'React': ('React learning guide', 'https://react.dev/learn'),
    'Agile': ('Scrum Guide', 'https://scrumguides.org/scrum-guide.html'),
    'Git': ('Pro Git book', 'https://git-scm.com/book/en/v2'),
    'Security': ('OWASP learning resources', 'https://owasp.org/www-project-top-ten/'),
    'Machine learning': ('scikit-learn guide', 'https://scikit-learn.org/stable/getting_started.html'),
}

def prepare(cv, job):
    fit = assess(cv, [job])['fits'][0]
    text = job.get('role', '') + ' ' + job.get('description', '')
    topics = [s for s, terms in SKILLS.items() if any(mentions(text, t) for t in terms)]
    topics.sort(key=lambda s: (s not in fit['missing'], s))
    def lines(value):
        return [s.strip(' \t-•')[:600] for s in re.split(r'\n|(?<=[.!?])\s+', value) if len(s.split()) >= 3]
    requirements = [line for line in lines(job.get('description', ''))
                    if not re.search(r'\bsalary\b|\bbenefits\b|sponsorship.{0,30}(?:available|offered)|equal opportunity|apply (?:at|online)|we offer', line, re.I)][:18]
    cv_lines = lines(cv)
    stop = {'with', 'this', 'that', 'from', 'have', 'your', 'will', 'team', 'work', 'role', 'the', 'and', 'for'}
    def tokens(value):
        return {w.lower() for w in re.findall(r'[\w+#.-]{3,}', value) if w.lower() not in stop}
    comparisons = []
    for requirement in requirements:
        requested = tokens(requirement)
        evidence = sorted(cv_lines, key=lambda line: len(requested & tokens(line)), reverse=True)
        best = evidence[0] if evidence and len(requested & tokens(evidence[0])) >= 2 else ''
        company = job.get('company') or job.get('role', 'this role')
        question = (f'Your CV describes “{best}”. What decisions did you make, and how would you adapt that experience to “{requirement}” at {company}?' if best else
                    f'{company} asks for “{requirement}”. With no direct example in your CV, what transferable experience and practical learning plan would you bring to this responsibility?')
        metrics = re.findall(r'\b\d+(?:\.\d+)?\s*(?:%|percent)|\$\s*[\d,]+', best)
        comparisons.append({'requirement': requirement, 'evidence': best,
            'question': question,
            'answerOutline': [f'Start with your CV example: “{best}”.' if best else 'No direct CV evidence found. Explain the gap honestly and identify relevant transferable experience.',
                              'Explain your own actions, decisions and trade-offs for this specific requirement.',
                              f'Explain the reported outcome ({", ".join(metrics)}) and how you measured it.' if metrics else 'Use the actual outcome in your CV; add detail only if you can verify it.']})
    study = []
    for skill in topics:
        requirement = next((r for r in requirements if any(mentions(r, t) for t in SKILLS[skill])), job.get('description', '')[:600])
        evidence = next((r for r in cv_lines if any(mentions(r, t) for t in SKILLS[skill])), '')
        study.append({'skill': skill, 'priority': 'Study first: no CV evidence found' if not evidence else 'Prepare your CV example',
                      'requirement': requirement, 'evidence': evidence,
                      'exercise': f'Practise meeting “{requirement}”. ' + (f'Use your example “{evidence}” to explain what you owned and how the outcome relates to this job.' if evidence else f'Study {skill}, complete a small practical exercise for this requirement, and explain your current experience honestly.'),
                      'resource': {'title': RESOURCES[skill][0], 'url': RESOURCES[skill][1]} if skill in RESOURCES else None})
    checklist = [f'Prepare evidence for: “{item["requirement"]}”.' for item in comparisons[:4]]
    return {'role': job.get('role', ''), 'company': job.get('company', ''), 'topics': study,
            'requirements': comparisons, 'checklist': checklist,
            'questions': [item['question'] for item in comparisons[:6]],
            'cvAvailable': len(cv.split()) >= 30,
            'note': 'Prepared from your active CV and this job description. Quoted evidence is yours; inferred relevance needs your review. These are practice questions, not confirmed employer questions.'}
