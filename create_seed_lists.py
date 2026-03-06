import json
import time
import translators as ts
import sys

def translate_batch(words, lang_code, retries=3):
    text_to_translate = "\n".join(words)
    for attempt in range(retries):
        try:
            res = ts.translate_text(text_to_translate, translator='google', from_language='en', to_language=lang_code)
            translated = [w.strip() for w in res.split('\n') if w.strip()]
            if len(translated) == len(words):
                return translated
            else:
                print(f"Count mismatch. Expected {len(words)}, got {len(translated)}")
                print(translated)
        except Exception as e:
            print(f"Translation failed: {e}")
            time.sleep(1)
    
    # Fallback to single word translation if batch fails
    print("Falling back to single word translation...")
    translated = []
    for w in words:
        try:
            res = ts.translate_text(w, translator='google', from_language='en', to_language=lang_code)
            translated.append(res.strip())
            time.sleep(0.1)
        except Exception as e:
            print(f"Single word translation failed for {w}: {e}")
            translated.append(w) # Just keep original if fail
    return translated

def generate_translations(target_language, batch_size=50):
    lang_code_map = {
        'Italian': 'it',
        'French': 'fr'
    }
    
    code = lang_code_map.get(target_language)
    if not code:
        print(f"Language {target_language} not supported.")
        return
        
    with open('oxford3000_parsed.json', 'r', encoding='utf-8') as f:
        oxford = json.load(f)
        
    levels = ['A1', 'A2', 'B1', 'B2']
    seed_data = {}
    
    for lvl in levels:
        words = oxford.get(lvl, [])
        # We need approx 500 words per level, but we have more. We'll take exactly 500 to match the requirement.
        words = words[:500]
        
        # Prepare list of just English words
        # Remove anything after a comma or parenthesis to get just the base word for translation
        clean_words = []
        for w in words:
            bw = w['word'].split(',')[0].split('(')[0].strip()
            clean_words.append(bw)
            
        print(f"Translating {len(clean_words)} words for {target_language} {lvl}...")
        
        translated_words = []
        for i in range(0, len(clean_words), batch_size):
            batch = clean_words[i:i+batch_size]
            print(f"Translating batch {i}-{i+len(batch)}...")
            res = translate_batch(batch, code)
            translated_words.extend(res)
            time.sleep(0.5)
            
        # Compile final seed dataset format
        final_lvl_data = []
        for i in range(len(clean_words)):
            en_word = clean_words[i]
            tr_word = translated_words[i] if i < len(translated_words) else ""
            pos = words[i].get('pos', 'noun')
            
            # Note: At this stage, we have the TARGET language word mapped from the ENGLISH word.
            # E.g., apple -> mela (Italian).
            # But the user needs: word (Italian), translation (Turkish), phonetics, example sentence.
            # We still need the AI to provide sentences and phonetics, and Turkish translation.
            # But passing a firm list of 500 Italian words prevents the duplication cycle.
            
            final_lvl_data.append({
                "base_en": en_word,
                "target_word": tr_word,
                "pos": pos
            })
            
        seed_data[lvl] = final_lvl_data
        
    with open(f"{target_language.lower()}_seed.json", 'w', encoding='utf-8') as f:
        json.dump(seed_data, f, indent=2, ensure_ascii=False)
        
    print(f"Seed list for {target_language} created successfully.")

if __name__ == '__main__':
    langs = sys.argv[1:] if len(sys.argv) > 1 else ['Italian', 'French']
    for l in langs:
        generate_translations(l)
