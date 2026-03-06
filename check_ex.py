import json
import re

with open('oxford3000_data.js', 'r', encoding='utf-8') as f:
    text = f.read()

total_words = len(re.findall(r'w:"', text))
with_ex = len(re.findall(r'ex:"([^"]+)"', text))
missing = total_words - with_ex

print(f"Total words: {total_words}")
print(f"Words with examples: {with_ex}")
print(f"Words missing examples: {missing}")

# Extract a few missing words
missing_words = []
for match in re.finditer(r'\{w:"([^"]+)",p:"[^"]*",tr:"[^"]*"(,pUS:"[^"]*")?(,pGB:"[^"]*")?(,ex:"")?\}', text):
    missing_words.append(match.group(1))

print(f"Sample missing: {missing_words[:20]}")
