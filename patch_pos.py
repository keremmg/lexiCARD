import re
import json
import os

def load_words_from_txt(filepaths):
    # Map word to its original POS string from the PDF like "n., v." or "prep."
    word_to_pos_raw = {}
    
    for filepath in filepaths:
        if not os.path.exists(filepath):
            continue
        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('©') or line.startswith('www.') or 'wordlist' in line.lower() or '/' in line or 'The Oxford' in line:
                    continue
                if line in ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']:
                    continue
                
                # Examples:
                # about prep., adv. A1
                # above prep., adv. A1
                # absorb v. B2
                # absolute adj. B2
                # abuse n., v. C1
                
                # Match word at start. Then any characters. Then optional CEFR.
                # Simplified: word might have spaces, but oxford lists usually don't.
                match = re.search(r'^([a-zA-Z-]+)\s+(.+?)(?:\s+[A-C][1-2])?$', line)
                if match:
                    word = match.group(1).lower()
                    pos_raw = match.group(2).strip()
                    
                    # Ensure pos_raw contains at least one standard marker
                    if re.search(r'\b(n|v|adj|adv|prep|conj|det|pron|exclam|number)\.', pos_raw) or ',' in pos_raw:
                        word_to_pos_raw[word] = pos_raw
    return word_to_pos_raw

def parse_pos_string(raw_str):
    # Maps abbreviations to full words
    mapping = {
        'n.': 'noun',
        'v.': 'verb',
        'adj.': 'adjective',
        'adv.': 'adverb',
        'prep.': 'preposition',
        'conj.': 'conjunction',
        'det.': 'determiner',
        'pron.': 'pronoun',
        'exclam.': 'phrase',
        'number': 'other',
        'modal v.': 'verb',
        'auxiliary v.': 'verb',
        'indefinite article': 'determiner',
        'definite article': 'determiner'
    }
    
    parts = []
    # Split by comma
    tokens = [t.strip() for t in raw_str.split(',')]
    for t in tokens:
        # Some might look like "adv. A1" if regex didn't strip it perfectly
        t_clean = t.split(' ')[0] if ' ' in t and not 'v.' in t and not 'article' in t else t
        
        # simple check
        for k, v in mapping.items():
            if k in t:
                if v not in parts:
                    parts.append(v)
                break
    
    if not parts:
        return 'other'
    
    return ', '.join(parts)


def patch_js_file(js_file_path, var_name, word_map):
    if not os.path.exists(js_file_path):
        print(f"File not found: {js_file_path}")
        return
        
    with open(js_file_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    # Extract the JSON part
    prefix_match = re.match(rf'^const {var_name} = (.*);$', content, re.DOTALL)
    if not prefix_match:
        prefix_match = re.match(rf'^const {var_name} = (.*)', content, re.DOTALL)
        
    if prefix_match:
        json_str = prefix_match.group(1)
        try:
            data = json.loads(json_str)
            patched_count = 0
            if isinstance(data, list):
                for item in data:
                    word = item['word'].lower()
                    if word in word_map:
                        full_pos = parse_pos_string(word_map[word])
                        if full_pos and full_pos != 'other':
                            item['partOfSpeech'] = full_pos
                            patched_count += 1
            elif isinstance(data, dict):
                for level, items in data.items():
                    for item in items:
                        word = item.get('w', '').lower()
                        if word in word_map:
                            full_pos = parse_pos_string(word_map[word])
                            if full_pos and full_pos != 'other':
                                item['p'] = full_pos
                                patched_count += 1
            
            # Write back
            new_content = f"const {var_name} = " + json.dumps(data, indent=2, ensure_ascii=False) + ";\n"
            with open(js_file_path, 'w', encoding='utf-8') as f_out:
                f_out.write(new_content)
                
            print(f"Patched {patched_count} words in {js_file_path}")
            
        except json.JSONDecodeError as e:
            print(f"Error decoding JSON in {js_file_path}: {e}")
    else:
        print(f"Could not parse {var_name} from {js_file_path}")


if __name__ == '__main__':
    texts = ['The_Oxford_5000.txt', 'American_Oxford_5000_by_CEFR_level.txt']
    print("Loading words from PDFs...")
    pos_map = load_words_from_txt(texts)
    print(f"Found POS mappings for {len(pos_map)} words.")
    
    patch_js_file('oxford3000_data.js', 'OXFORD_3000', pos_map)
    patch_js_file('oxford_c1_data.js', 'OXFORD_C1', pos_map)
    print("Done.")
