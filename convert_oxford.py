import json
import re

# Load parsed data
with open('oxford3000_parsed.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Clean up words
cleaned = {}
for level, words in data.items():
    cleaned[level] = []
    seen = set()
    for w in words:
        word = w['word'].strip()
        # Clean up multi-word entries like "a, an indefinite article"
        word = re.sub(r'\s+indefinite article.*', '', word)
        word = re.sub(r'\s+definite article.*', '', word)
        word = re.sub(r'\s+ordinal number.*', '', word)
        word = re.sub(r'\s+number.*', '', word)
        # Remove numbered variants like "close1"
        word = re.sub(r'\d+$', '', word)
        # Clean weird chars
        word = word.replace('\xa0', ' ').strip()
        # Remove parenthetical context from word itself
        word = re.sub(r'\s*\(.*?\)\s*', ' ', word).strip()
        
        if not word or len(word) > 30 or word.lower() in seen:
            continue
        if not re.match(r'^[a-zA-Z]', word):
            continue
            
        seen.add(word.lower())
        pos = w.get('pos', 'other')
        cleaned[level].append({'word': word, 'pos': pos})

# Generate JS file
js_lines = ['// Oxford 3000 Word List by CEFR Level',
            '// Source: Oxford University Press',
            '// Auto-generated from The_Oxford_3000_by_CEFR_level.pdf',
            '',
            'const OXFORD_3000 = {']

for level in ['A1', 'A2', 'B1', 'B2']:
    words = cleaned.get(level, [])
    js_lines.append(f'  "{level}": [')
    for w in words:
        word_escaped = w['word'].replace("'", "\\'").replace('"', '\\"')
        js_lines.append(f'    {{w:"{word_escaped}",p:"{w["pos"]}"}},')
    js_lines.append('  ],')
    print(f"{level}: {len(words)} words (cleaned)")

js_lines.append('};')

with open('oxford3000_data.js', 'w', encoding='utf-8') as f:
    f.write('\n'.join(js_lines))

print(f"\nTotal: {sum(len(v) for v in cleaned.values())} words")
print("Written to oxford3000_data.js")
