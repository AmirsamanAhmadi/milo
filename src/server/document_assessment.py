"""Local cover-letter checks and document-grounded role suggestions."""
import re
from assessment import assess

def cover_assessment(text, job=None):
    job = job or {}
    words = text.split()
    checks = [
        ('Recipient or greeting', bool(re.search(r'dear|hiring (?:team|manager)|hello', text, re.I)), 15),
        ('Target role', job.get('role', '').lower() in text.lower() if job.get('role') else bool(re.search(r'apply|application|position|role', text, re.I)), 20),
        ('Company motivation', job.get('company', '').lower() in text.lower() if job.get('company') else bool(re.search(r'company|organisation|organization|your team|mission', text, re.I)), 20),
        ('Concrete experience or outcome', bool(re.search(r'\d+\s*%|\b(?:delivered|built|led|managed|reduced|improved|created)\b', text, re.I)), 25),
        ('Closing or next step', bool(re.search(r'regards|sincerely|thank you|discuss|interview|look forward', text, re.I)), 10),
        ('Concise length (100–500 words)', 100 <= len(words) <= 500, 10),
    ]
    available = len(words) >= 30
    return {'label': 'Cover letter quality', 'available': available,
            'score': sum(weight for _, present, weight in checks if present) if available else None,
            'checks': [{'name': name, 'present': present, 'weight': weight} for name, present, weight in checks],
            'reason': ('Local writing checks; claims are not verified and this is not a hiring probability.' if available else 'Add at least 30 words of readable cover-letter text.'),
            'target': (job.get('role', '') + ' · ' + job.get('company', '')).strip(' ·')}

def recommend_documents(cv, cover):
    suggestions = {}
    skills = []
    for source, text in [('CV', cv), ('Cover letter', cover)]:
        result = assess(text, [])
        skills.extend(result['skills'])
        lines = [line.strip() for line in re.split(r'\n|(?<=[.!?])\s+', text) if line.strip()]
        line_roles = [(line, assess(line, [], minimum_words=0)['recommendations']) for line in lines]
        for role in result['recommendations']:
            item = suggestions.setdefault(role, {'role': role, 'sources': [], 'evidence': []})
            item['sources'].append(source)
            # Show the supplied skill text so recommendations remain reviewable.
            relevant = [line for line, roles in line_roles if role in roles]
            if relevant:
                item['evidence'].append({'source': source, 'text': relevant[0][:350]})
    return {'roles': list(suggestions)[:10], 'suggestions': list(suggestions.values())[:10],
            'skills': list(dict.fromkeys(skills)), 'available': len(cv.split()) >= 30 or len(cover.split()) >= 30}
