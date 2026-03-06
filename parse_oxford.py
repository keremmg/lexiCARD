import fitz
import json
import re

doc = fitz.open('oxford3000.pdf')
all_text = ''
for page in doc:
    all_text += page.get_text() + '\n'
doc.close()

# Parse words by level
levels = {}
current_level = None

lines = all_text.split('\n')
for line in lines:
    line = line.strip()
    if not line:
        continue
    
    # Detect level headers  
    if line in ['A1', 'A2', 'B1', 'B2']:
        current_level = line
        if current_level not in levels:
            levels[current_level] = []
        continue
    
    # Skip headers and non-word lines
    if 'Oxford University' in line or 'oxford3000' in line:
        continue
    if 'The Oxford 3000' in line or 'level.' in line:
        continue
    if line.startswith('©') or line.startswith('www.') or 'wordlist' in line.lower():
        continue
    
    if current_level and len(line) > 0:
        # Clean up word entries like "word n., v." or "word (context) adj."
        # Remove POS tags at the end
        clean = re.sub(r'\s+(n|v|adj|adv|prep|conj|det|pron|exclam|modal v|auxiliary v|number|ordinal number|indefinite article|definite article)[\.,/].*$', '', line).strip()
        # Remove trailing annotations
        clean = re.sub(r'\s+$', '', clean)
        
        if clean and len(clean) < 40 and re.match(r'^[a-zA-Z]', clean):
            # Extract POS from original line
            pos_match = re.search(r'\b(n|v|adj|adv|prep|conj|det|pron|exclam)\b', line.split(clean, 1)[-1] if clean in line else '')
            pos = pos_match.group(1) if pos_match else ''
            
            # Map pos to full name
            pos_map = {'n': 'noun', 'v': 'verb', 'adj': 'adjective', 'adv': 'adverb', 
                       'prep': 'other', 'conj': 'other', 'det': 'other', 'pron': 'other', 'exclam': 'other'}
            full_pos = pos_map.get(pos, 'other')
            
            levels[current_level].append({
                'word': clean,
                'pos': full_pos
            })

# Print summary
for lvl in ['A1', 'A2', 'B1', 'B2']:
    words = levels.get(lvl, [])
    print(f"{lvl}: {len(words)} words")
    if len(words) > 0:
        first5 = [w['word'] for w in words[:5]]
        last5 = [w['word'] for w in words[-5:]]
        print(f"  First: {first5}")
        print(f"  Last:  {last5}")

# Save as JSON
with open('oxford3000_parsed.json', 'w', encoding='utf-8') as f:
    json.dump(levels, f, ensure_ascii=False, indent=2)

print(f"\nTotal words: {sum(len(v) for v in levels.values())}")
print("Saved to oxford3000_parsed.json")
