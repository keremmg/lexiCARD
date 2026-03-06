async function test() {
    const words = [
        { sl: 'it', w: 'allegro' },
        { sl: 'ko', w: '안녕하세요' },
        { sl: 'fr', w: 'toujours' },
        { sl: 'de', w: 'gesundheit' }
    ];

    for (const { sl, w } of words) {
        console.log(`\n\n=== Testing [${sl}] ${w} ===`);
        // Hit Google Translate -> TR
        const urlTR = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=tr&dt=t&dt=rm&dt=bd&dt=ex&dt=md&q=${encodeURIComponent(w)}`;
        try {
            const res = await fetch(urlTR);
            const d = await res.json();
            const trText = d[0]?.[0]?.[0];
            const romanization = d[0]?.[1]?.[3] || d[0]?.[0]?.[3];
            console.log(`Translation: ${trText}`);
            console.log(`Romanization: ${romanization}`);

            let pos = 'noun';
            if (d[1] && d[1][0] && d[1][0][0]) pos = d[1][0][0];
            else if (d[12] && d[12][0] && d[12][0][0]) pos = d[12][0][0];
            console.log(`POS: ${pos}`);

            let examples = [];
            if (d[13] && d[13][0]) {
                examples = d[13][0].map(x => x[0].replace(/<[^>]+>/g, ''));
            }
            console.log(`TR Examples: ${examples.length}`);
        } catch (e) { console.error(e.message); }

        // Hit Google Translate -> EN (Often has MUCH better dictionary/example data)
        const urlEN = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=en&dt=t&dt=rm&dt=bd&dt=ex&dt=md&q=${encodeURIComponent(w)}`;
        try {
            const res = await fetch(urlEN);
            const d = await res.json();
            let pos = 'noun';
            if (d[1] && d[1][0] && d[1][0][0]) pos = d[1][0][0];
            else if (d[12] && d[12][0] && d[12][0][0]) pos = d[12][0][0];
            console.log(`EN POS: ${pos}`);

            let examples = [];
            if (d[13] && d[13][0]) {
                examples = d[13][0].map(x => x[0].replace(/<[^>]+>/g, ''));
            }
            console.log(`EN Examples (${examples.length}):`, examples.slice(0, 2));
        } catch (e) { console.error(e.message); }
    }
}
test();
