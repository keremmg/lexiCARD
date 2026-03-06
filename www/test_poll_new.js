async function testApi() {
    try {
        const prompt = 'You are a vocabulary generator. Return valid JSON only, without markdown formatting.\\n\\nThe word is allegro in Italian. Return translation, partOfSpeech, phonetics, and 2 sentences.';

        const systemPrompt = 'You are a vocabulary generator. Return valid JSON only, without markdown formatting.';

        // Try new pollinations openai endpoint
        const res = await fetch('https://text.pollinations.ai/openai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt }
                ],
                model: 'openai',
                jsonMode: true
            })
        });
        console.log("Pollinations status:", res.status);
        console.log(await res.text());

    } catch (e) { console.error(e); }
}

testApi();
