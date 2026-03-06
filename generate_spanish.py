import json
import time
from g4f.client import Client

def get_words(level, count=50, retries=3):
    client = Client()
    prompt = f"""You are a Spanish language expert. Provide exactly {count} common and important Spanish vocabulary words specifically for CEFR level {level}.
Return ONLY a valid JSON array of objects. Do not write anything else. Do not use markdown blocks, just raw JSON.
Each object MUST have these exact keys:
- "word": the Spanish word
- "translation": the Turkish translation
- "partOfSpeech": exactly one of (noun, verb, adjective, adverb, preposition, conjunction, pronoun, determiner, phrase)
- "phoneticUS": the phonetic pronunciation (IPA format) of the Spanish word
- "sentences": an array containing exactly 1 object with "en" (a Spanish example sentence using the word) and "tr" (the Turkish translation of that sentence).

Example output:
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
            print(f"Generating {count} words for {level} (Attempt {attempt+1})...")
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
                print(f"Successfully generated {len(data)} words for {level}.")
                return data
        except Exception as e:
            print(f"Failed attempt {attempt+1} for {level}: {e}")
            time.sleep(2)
            
    print(f"Failed to generate words for {level} after all retries.")
    return []

if __name__ == '__main__':
    levels = ['A1', 'A2', 'B1', 'B2']
    all_data = {}
    
    for lvl in levels:
        words = get_words(lvl, count=75) # Batch of 75 words per level
        all_data[lvl] = words
        time.sleep(2) # rate limit pause
        
    # Write to JS file
    output_file = 'spanish_data.js'
    with open(output_file, 'w', encoding='utf-8') as f:
        for lvl in levels:
            var_name = f"SPANISH_{lvl}"
            f.write(f"const {var_name} = {json.dumps(all_data[lvl], indent=2, ensure_ascii=False)};\n\n")
            
    print(f"Saved all Spanish lists to {output_file}")
