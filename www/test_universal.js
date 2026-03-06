async function simulateFallback(word, languageName) {
    try {
        const n = (languageName || '').toLowerCase();
        let sl = 'en';
        let tatLang = 'eng';

        // Comprehensive language mapping
        const langMap = {
            sp: ['es', 'spa'], it: ['it', 'ita'], fr: ['fr', 'fra'],
            ge: ['de', 'deu'], po: ['pt', 'por'], tu: ['tr', 'tur'],
            ko: ['ko', 'kor'], ja: ['ja', 'jpn'], zh: ['zh-CN', 'cmn'],
            ar: ['ar', 'ara'], ru: ['ru', 'rus']
        };

        if (n.includes('spanish') || n.includes('español')) { sl = 'es'; tatLang = 'spa'; }
        else if (n.includes('italian') || n.includes('italiano')) { sl = 'it'; tatLang = 'ita'; }
        else if (n.includes('french') || n.includes('français')) { sl = 'fr'; tatLang = 'fra'; }
        else if (n.includes('german') || n.includes('deutsch')) { sl = 'de'; tatLang = 'deu'; }
        else if (n.includes('portuguese') || n.includes('português')) { sl = 'pt'; tatLang = 'por'; }
        else if (n.includes('korean') || n.includes('한국어')) { sl = 'ko'; tatLang = 'kor'; }
        else if (n.includes('japanese') || n.includes('日本語')) { sl = 'ja'; tatLang = 'jpn'; }
        else if (n.includes('chinese') || n.includes('中文')) { sl = 'zh-CN'; tatLang = 'cmn'; }
        else if (n.includes('russian') || n.includes('русский')) { sl = 'ru'; tatLang = 'rus'; }

        const tl = 'tr';

        // 1. Translation + Phonetics (Romanization) via Google Translate to TR
        const trUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&dt=rm&dt=bd&q=${encodeURIComponent(word)}`;
        const trRes = await fetch(trUrl);
        const trData = await trRes.json();

        const translation = trData[0]?.[0]?.[0] || '';
        const romanization = trData[0]?.[1]?.[3] || trData[0]?.[0]?.[3] || '';

        let pos = '';
        // Try to get POS from TR dict data
        if (trData[1] && trData[1][0] && trData[1][0][0]) {
            pos = trData[1][0][0].toLowerCase();
        }

        // 2. If NO POS from TR translation (which is common), do a fast fetch to EN for POS
        if (!pos) {
            try {
                const enUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=en&dt=bd&q=${encodeURIComponent(word)}`;
                const enRes = await fetch(enUrl);
                const enData = await enRes.json();
                if (enData[1] && enData[1][0] && enData[1][0][0]) {
                    pos = enData[1][0][0].toLowerCase();
                }
            } catch (e) { }
        }
        // Default fallback
        if (!pos) pos = 'noun';

        let d1 = '';
        // Use romanization as phonetic transcription if it differs from the original word
        if (romanization && romanization.replace(/[\s·-]/g, '').toLowerCase() !== word.replace(/[\s·-]/g, '').toLowerCase()) {
            d1 = '/' + romanization + '/';
        } else {
            // For languages with Latin script where romanization is same as word, Google Translate 
            // sometimes has no phonetic spelling for simple words. That's fine.
            d1 = '';
        }

        const sentences = [];

        // 3. Example sentences via Tatoeba (works well for European, Russian, some Asian)
        try {
            const tatRes = await fetch(`https://tatoeba.org/en/api_v0/search?query=${encodeURIComponent(word)}&from=${tatLang}&limit=15`);
            if (tatRes.ok) {
                const tatData = await tatRes.json();
                const results = tatData.results || [];
                for (const r of results) {
                    if (sentences.length >= 2) break;
                    const sentText = r.text;
                    const allTrans = [...(r.translations?.[0] || []), ...(r.translations?.[1] || [])];
                    const trTrans = allTrans.find(t => t.lang === 'tur');
                    // Skip if translated sentence is too short/long or doesn't actually translate well
                    if (trTrans && trTrans.text.length > 3) {
                        sentences.push({ en: sentText, tr: trTrans.text });
                    }
                }
            }
        } catch (e) { }

        // 4. Fallback: Generate sentences using Google Translate if Tatoeba found < 2
        if (sentences.length < 2 && translation) {
            try {
                const templatesEn = [
                    `This means ${translation}.`,
                    `I learned the word ${translation}.`
                ];

                for (const tpl of templatesEn) {
                    if (sentences.length >= 2) break;
                    // Translate template to target language
                    const stRes = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${sl}&dt=t&q=${encodeURIComponent(tpl)}`);
                    if (stRes.ok) {
                        const stData = await stRes.json();
                        let targetSent = stData[0]?.map(x => x[0]).join('') || '';

                        // Replace the translation string with the actual word in target lang if possible
                        // Note: This is a hacky fallback. Better to just use the generated sentence as is, 
                        // but it won't contain the word explicitly. 
                        // Better templates: TR source.
                        // "Kelime anlamı: translation" -> translate to SL.
                    }
                }
            } catch (e) { }
        }

        // Better Sentence Generator: 
        // Just use Google Translate to translate a simple sentence into Target Language, then translate that into TR
        if (sentences.length < 2 && translation) {
            try {
                // This is a simple fallback: Just return the word and translation as a "vocabulary pair"
                sentences.push({ en: `[Vocab]: ${word}`, tr: translation });
                if (sentences.length < 2) {
                    sentences.push({ en: `[Word]: ${word}`, tr: translation });
                }
            } catch (e) { }
        }

        return {
            translation,
            partOfSpeech: pos,
            phoneticD1: d1,
            phoneticD2: '',
            sentences
        };
    } catch (err) {
        throw new Error('FALLBACK_FAILED');
    }
}

async function testAll() {
    const tests = [
        { sl: 'Italian', w: 'allegro' },
        { sl: 'Korean', w: '안녕하세요' },
        { sl: 'French', w: 'toujours' },
        { sl: 'Japanese', w: 'ありがとう' },
        { sl: 'Russian', w: 'привет' }
    ];

    for (const t of tests) {
        console.log(`\nTesting ${t.sl} word: ${t.w}`);
        const res = await simulateFallback(t.w, t.sl);
        console.log(JSON.stringify(res, null, 2));
    }
}
testAll();
