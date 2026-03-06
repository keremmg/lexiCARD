import json
import re
import time
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from deep_translator import GoogleTranslator

translator = GoogleTranslator(source='en', target='tr')

# Load the file
with open('oxford3000_data.js', 'r', encoding='utf-8') as f:
    text = f.read()

# Find all dictionary entries missing 'ex:'
matches = []
for match in re.finditer(r'\{([^\}]+)\}', text):
    content = match.group(1)
    if 'w:"' in content and 'ex:"' not in content:
        w_match = re.search(r'w:"([^"]+)"', content)
        if w_match:
            word = w_match.group(1)
            matches.append((match.group(0), word))

print(f"Found {len(matches)} missing examples.")

if len(matches) == 0:
    print("Done!")
    exit(0)

def strip_html(text):
    clean = re.sub('<[^<]+?>', '', text)
    clean = re.sub(r'^\d+\s*', '', clean)
    return clean.strip()

def get_wiktionary_example(word_tuple):
    full_match, word = word_tuple
    clean_word = word.split(',')[0].strip().split('(')[0].strip()
    url = f"https://en.wiktionary.org/api/rest_v1/page/definition/{urllib.parse.quote(clean_word)}"
    req = urllib.request.Request(url, headers={'User-Agent': 'LexiCardApp/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            data = json.loads(r.read())
            if 'en' in data:
                for entry in data['en']:
                    if 'definitions' in entry:
                        for defn in entry['definitions']:
                            if 'examples' in defn and len(defn['examples']) > 0:
                                return (full_match, word, strip_html(defn['examples'][0]))
                            if 'parsedExamples' in defn and len(defn['parsedExamples']) > 0:
                                return (full_match, word, strip_html(defn['parsedExamples'][0].get('example', '')))
    except Exception:
        pass
    return (full_match, word, None)

new_text = text
processed = 0
found = 0

print("Fetching examples with 15 workers...")
results = []
with ThreadPoolExecutor(max_workers=15) as executor:
    futures = {executor.submit(get_wiktionary_example, m): m for m in matches}
    
    for i, future in enumerate(as_completed(futures)):
        full_match, word, example = future.result()
        if example:
            results.append((full_match, word, example))
        
        if (i + 1) % 50 == 0:
            print(f"  Fetched {i+1}/{len(matches)}...")

print(f"Fetched {len(results)} examples from Wiktionary. Now translating and saving...")

# Batch translate to avoid translator limits
batch_size = 30
for i in range(0, len(results), batch_size):
    batch = results[i:i+batch_size]
    en_sents = [x[2] for x in batch]
    try:
        joined = '\n'.join(en_sents)
        translated = translator.translate(joined)
        tr_sents = [t.strip() for t in translated.split('\n')]
        
        if len(tr_sents) == len(en_sents):
            for j, (full_match, word, example) in enumerate(batch):
                en_sent = example.replace('"', '\\"').replace('\n', ' ').strip()
                tr_sent = tr_sents[j].replace('"', '\\"').replace('\n', ' ').strip()
                
                replacement = full_match[:-1] + f',ex:"{en_sent}",exTr:"{tr_sent}"}}'
                new_text = new_text.replace(full_match, replacement, 1)
                found += 1
        else:
            print("  Translation mismatch, skipping a batch.")
    except Exception as e:
        print(f"  Translation error: {e}")
    time.sleep(1)

# Final save
with open('oxford3000_data.js', 'w', encoding='utf-8') as f:
    f.write(new_text)

print(f"Done! Evaluated {len(matches)} missing examples, successfully fetched and translated {found}.")
