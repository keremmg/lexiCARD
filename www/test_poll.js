const prompt = `You are a vocabulary card generator for people whose native language is Turkish and who are learning Italian.

Given the word "allegro" in Italian:

1. "translation": Provide the Turkish translation (the most common one).
2. "partOfSpeech": One of: noun, verb, adjective, adverb, phrase, other
3. "phoneticD1": IPA phonetic transcription for Italy dialect, wrapped in slashes like /.../ 
4. "phoneticD2": IPA phonetic for  dialect (use empty string "" if same as D1 or not applicable)
5. "altSpelling": Alternative spelling in the other dialect (e.g. colour vs color). Empty string if none.
6. "sentences": Array of exactly 2 objects, each with "en" (example sentence in Italian) and "tr" (Turkish translation of that sentence)

IMPORTANT:
- If the word is nonsense, misspelled, or doesn't exist, respond with: {"error": "This word does not appear to be valid."}
- All phonetics must use IPA symbols
- Sentences should be natural and useful for learners
- Your sentence examples MUST be in Italian, DO NOT write them in English unless Italian is English!

Respond with valid JSON only, no markdown formatting.`;

fetch('https://text.pollinations.ai/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        messages: [
            { role: 'system', content: 'You are a vocabulary generator. Return valid JSON only, without markdown formatting.' },
            { role: 'user', content: prompt }
        ],
        jsonMode: true
    })
}).then(r => r.text()).then(console.log).catch(console.error);
