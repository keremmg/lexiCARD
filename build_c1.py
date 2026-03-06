import re
import json
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from deep_translator import GoogleTranslator
import time

translator = GoogleTranslator(source='en', target='tr')

words = {}

# Parse British Oxford 5000
with open('The_Oxford_5000.txt', 'r', encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if ' C1' in line or line.endswith('C1'):
            # e.g., "absorb v. B2, C1" or "abolish v. C1"
            # Or "acid n. B2, adj. C1"
            # Let's extract the word (first token)
            match = re.match(r'^([a-zA-Z-]+)\s', line)
            if match:
                w = match.group(1).lower()
                words[w] = {'word': w, 'pos': 'other'}

# Parse American Oxford 5000
in_c1 = False
with open('American_Oxford_5000_by_CEFR_level.txt', 'r', encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if line == 'C1':
            in_c1 = True
            continue
        if line in ['A1', 'A2', 'B1', 'B2', 'C2']:
            in_c1 = False
            continue
            
        if in_c1 and line and not line.startswith('©') and not line.startswith('2 /') and not line.startswith('The Oxford') and not line[0].isdigit():
            match = re.match(r'^([a-zA-Z-]+)\s', line)
            if match:
                w = match.group(1).lower()
                if w not in words:
                    words[w] = {'word': w, 'pos': 'other'}

print(f"Extracted {len(words)} C1 words.")

# Limit to a small number for testing just to make sure then we do all of them? No, let's do all.
word_list = list(words.values())

def fetch_data(item):
    w = item['word']
    result = {
        'word': w,
        'translation': '',
        'partOfSpeech': 'other',
        'phoneticUS': '',
        'phoneticGB': '',
        'sentences': []
    }
    
    # 1. Dictionary API
    url = f"https://api.dictionaryapi.dev/api/v2/entries/en/{urllib.parse.quote(w)}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    en_sentence = ""
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            data = json.loads(r.read())
            entry = data[0]
            
            # Phonetics
            phons = entry.get('phonetics', [])
            us_phon = next((p['text'] for p in phons if 'audio' in p and '-us' in p['audio']), '')
            if not us_phon: us_phon = next((p['text'] for p in phons if 'text' in p), '')
            uk_phon = next((p['text'] for p in phons if 'audio' in p and '-uk' in p['audio']), '')
            
            result['phoneticUS'] = us_phon
            result['phoneticGB'] = uk_phon if uk_phon != us_phon else ''
            
            # POS & Example
            for m in entry.get('meanings', []):
                pos = m.get('partOfSpeech', 'other')
                if result['partOfSpeech'] == 'other': result['partOfSpeech'] = pos
                for d in m.get('definitions', []):
                    if 'example' in d and not en_sentence:
                        en_sentence = d['example']
                        result['partOfSpeech'] = pos
                        break
                if en_sentence: break
    except Exception:
        pass
        
    # 2. If no example, fallback to Wiktionary
    if not en_sentence:
        wiki_url = f"https://en.wiktionary.org/api/rest_v1/page/definition/{urllib.parse.quote(w)}"
        wiki_req = urllib.request.Request(wiki_url, headers={'User-Agent': 'Mozilla/5.0'})
        try:
            with urllib.request.urlopen(wiki_req, timeout=5) as r:
                data = json.loads(r.read())
                if 'en' in data:
                    for entry in data['en']:
                        for defn in entry.get('definitions', []):
                            if 'examples' in defn and len(defn['examples']) > 0:
                                ex = defn['examples'][0]
                                ex = re.sub('<[^<]+?>', '', ex).strip()
                                en_sentence = ex
                                break
                            if 'parsedExamples' in defn and len(defn['parsedExamples']) > 0:
                                ex = defn['parsedExamples'][0].get('example', '')
                                ex = re.sub('<[^<]+?>', '', ex).strip()
                                en_sentence = ex
                                break
                        if en_sentence: break
        except Exception:
            pass
            
    if not en_sentence:
        en_sentence = f"This is an example sentence for {w}."
        
    result['temp_en_sentence'] = en_sentence
    return result

print("Fetching API data (Dictionary API + Wiktionary)...")
fetched = []
with ThreadPoolExecutor(max_workers=10) as executor:
    futures = {executor.submit(fetch_data, item): item for item in word_list}
    for i, fut in enumerate(as_completed(futures)):
        fetched.append(fut.result())
        if (i+1) % 50 == 0: print(f"  {i+1}/{len(word_list)} done.")

print("Batch translating words and sentences...")
# To optimize, we'll translate batches of 40 words + 40 sentences at once.
final_list = []
batch_size = 40
for i in range(0, len(fetched), batch_size):
    batch = fetched[i:i+batch_size]
    
    # words
    en_words = [item['word'] for item in batch]
    try:
        joined_w = '\n'.join(en_words)
        tr_w = translator.translate(joined_w).split('\n')
        if len(tr_w) != len(en_words): tr_w = [translator.translate(w) for w in en_words] # fallback to single if mismatch
    except:
        tr_w = ['' for _ in en_words]
        
    # sentences
    en_sents = [item['temp_en_sentence'] for item in batch]
    try:
        joined_s = '\n'.join(en_sents)
        tr_s = translator.translate(joined_s).split('\n')
        if len(tr_s) != len(en_sents): tr_s = [translator.translate(s) for s in en_sents]
    except:
        tr_s = ['' for _ in en_sents]
        
    for j, item in enumerate(batch):
        item['translation'] = tr_w[j].strip() if j < len(tr_w) else ''
        tr_sentence = tr_s[j].strip() if j < len(tr_s) else ''
        en_s = item['temp_en_sentence']
        
        item['sentences'] = [{'en': en_s, 'tr': tr_sentence}] if en_s else []
        del item['temp_en_sentence']
        final_list.append(item)
        
    print(f"  Translated batch {(i//batch_size)+1} / {(len(fetched)//batch_size)+1}")
    time.sleep(1)

# Dump to JS file format
js_content = "const OXFORD_C1 = " + json.dumps(final_list, indent=2, ensure_ascii=False) + ";\n"
with open('oxford_c1_data.js', 'w', encoding='utf-8') as f:
    f.write(js_content)

print(f"Successfully saved {len(final_list)} C1 words to oxford_c1_data.js")
