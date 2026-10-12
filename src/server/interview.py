"""Build a local interview study plan from the JD and CV skill evidence."""
from assessment import SKILLS, assess, mentions

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
    return {'role': job.get('role', ''), 'topics': [
        {'skill': s, 'priority': 'Study first: no CV evidence found' if s in fit['missing'] else 'Refresh and prepare an example',
         'exercise': f'Explain how you used {s}, describe a realistic problem for this role, and walk through your solution and trade-offs.',
         'resource': {'title': RESOURCES[s][0], 'url': RESOURCES[s][1]} if s in RESOURCES else None}
        for s in topics],
        'checklist': ['Review the company website, products, customers and recent announcements.',
                      'Prepare three STAR stories with measurable outcomes relevant to the job description.',
                      'Review each stated responsibility and qualification; write down honest evidence and gaps.',
                      'Practise a role-specific task and explain your reasoning aloud.',
                      'Prepare questions about team goals, onboarding, success measures and work authorisation.'],
        'questions': [f'Tell me about a time you applied {s} and what changed as a result.' for s in topics[:6]],
        'note': 'Topics are inferred from the supplied job description. They are preparation guidance, not confirmed interview questions.'}
