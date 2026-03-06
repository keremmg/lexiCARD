import json
import time
import os
import sys
import string
from g4f.client import Client

def get_word_details(language, words_batch, retries=3):
    client = Client()
    # words_batch is a list of dicts: {"base_en": "..", "target_word": "..", "pos": ".."}
    
    word_list_str = "\n".join([f"{w['target_word']} (meaning: {w['base_en']}, pos: {w['pos']})" for w in words_batch])
    
    prompt = f"""You are a {language} language expert. I will provide you a list of {len(words_batch)} {language} words.
For EACH word, provide its Turkish translation, IPA phonetic pronunciation, and a {language} example sentence with its Turkish translation.

Words to process:
{word_list_str}

Return ONLY a valid JSON array of objects, in the EXACT same order. Do not write anything else. Do not use markdown blocks, just raw JSON.
Each object MUST have these exact keys:
- "word": the {language} word I provided
- "translation": the Turkish translation
- "partOfSpeech": exactly one of (noun, verb, adjective, adverb, preposition, conjunction, pronoun, determiner, phrase)
- "phoneticUS": the phonetic pronunciation (IPA format) of the {language} word
- "sentences": an array containing exactly 1 object with "en" (a {language} example sentence using the word) and "tr" (the Turkish translation of that sentence).

Example output format for 1 word:
[
  {{
    "word": "sol",
    "translation": "güneş",
    "partOfSpeech": "noun",
    "phoneticUS": "/sol/",
    "sentences": [
      {{"en": "El sol es muy brillante hoy.", "tr": "Güneş bugün çok parlak."}}
    ]
  }}
]
"""
    for attempt in range(retries):
        try:
            print(f"Generating details batch size {len(words_batch)} (attempt {attempt+1})...")
            response = client.chat.completions.create(
                model='gpt-4',
                messages=[{'role': 'user', 'content': prompt}]
            )
            content = response.choices[0].message.content.strip()
            
            # Clean up markdown
            if content.startswith('```'):
                lines = content.split('\n')
                if lines[0].startswith('```'): lines = lines[1:]
                if lines[-1].startswith('```'): lines = lines[:-1]
                content = '\n'.join(lines)
            
            data = json.loads(content)
            if isinstance(data, list) and len(data) > 0:
                print(f"Successfully generated {len(data)} words.")
                return data
        except Exception as e:
            print(f"Failed: {e}")
            time.sleep(2)
            
    return []

def load_checkpoint(filename):
    if os.path.exists(filename):
        with open(filename, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def save_checkpoint(filename, data):
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def generate_for_language(language):
    seed_file = f"{language.lower()}_seed.json"
    if not os.path.exists(seed_file):
        print(f"Seed file {seed_file} not found. Run create_seed_lists.py first.")
        return
        
    with open(seed_file, 'r', encoding='utf-8') as f:
        seed_data = json.load(f)
        
    levels = ['A1', 'A2', 'B1', 'B2']
    all_data = {lvl: [] for lvl in levels}
    
    for lvl in levels:
        seed_words = seed_data.get(lvl, [])
        if not seed_words:
            continue
            
        ckpt_file = f"{language.lower()}_{lvl}_checkpoint.json"
        existing_data = load_checkpoint(ckpt_file)
        
        # We might already have generated words using the old method. Since they are good, we can keep them.
        # But for simplicity, if we are doing this new seed targeted flow, we just build the parallel list.
        # However, to save the user's previously generated 1088 Italian words (which took 2 hours),
        # we will LOAD them and just fill the REST from the seed.
        
        seen_base_words = set([item['word'].lower().strip() for item in existing_data])
        all_data[lvl] = existing_data
        
        print(f"--- Processing {lvl} for {language} (Currently {len(existing_data)}/500) ---")
        
        # How many more do we need?
        needed = 500 - len(existing_data)
        if needed <= 0:
            print(f"{lvl} already complete.")
            continue
            
        # Select seeds we haven't processed yet. We'll just take the top 'needed' ones from the seed list
        # that aren't already in our seen list (just in case they overlap).
        pending_seeds = []
        for s in seed_words:
            if s['target_word'].lower().strip() not in seen_base_words:
                pending_seeds.append(s)
                if len(pending_seeds) >= needed:
                    break
        
        # Process in batches of 25 to avoid AI getting stuck
        batch_size = 25
        fails_in_a_row = 0
        
        for i in range(0, len(pending_seeds), batch_size):
            if fails_in_a_row > 5:
                print("Too many consecutive failures. Taking a long break.")
                time.sleep(30)
                fails_in_a_row = 0
                
            batch = pending_seeds[i:i+batch_size]
            print(f"Requesting details for {len(batch)} words... ({i}/{len(pending_seeds)})")
            
            results = get_word_details(language, batch)
            if results:
                for r in results:
                    # Basic validation
                    if 'word' in r and 'translation' in r and 'sentences' in r:
                        w = r['word'].lower().strip()
                        if w not in seen_base_words:
                            seen_base_words.add(w)
                            all_data[lvl].append(r)
                            
                save_checkpoint(ckpt_file, all_data[lvl])
                fails_in_a_row = 0
                time.sleep(1)
            else:
                fails_in_a_row += 1
                time.sleep(3)
                
        # Ensure exactly 500 or however many we managed
        all_data[lvl] = all_data[lvl][:500]
        save_checkpoint(ckpt_file, all_data[lvl])
        print(f"Finished {lvl} for {language} with {len(all_data[lvl])} words.")

    output_file = f"{language.lower()}_data.js"
    with open(output_file, 'w', encoding='utf-8') as f:
        for lvl in levels:
            var_name = f"{language.upper()}_{lvl}"
            f.write(f"const {var_name} = {json.dumps(all_data[lvl], indent=2, ensure_ascii=False)};\n\n")
            
    print(f"Saved {language} lists to {output_file}")

if __name__ == '__main__':
    langs = sys.argv[1:] if len(sys.argv) > 1 else ['Italian', 'French']
    for l in langs:
        generate_for_language(l)
