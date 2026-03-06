async function test() {
    // Italian allegro to Turkish with romanization
    const res = await fetch(
        'https://translate.googleapis.com/translate_a/single?client=gtx&sl=it&tl=tr&dt=t&dt=rm&q=allegro'
    );
    const d = await res.json();
    // d[0] = translation pairs, d[0][0][3] or d[0][1][3] is often the romanization
    console.log('d[0]:', JSON.stringify(d[0]));
    // Check index 3 for romanization data
    if (d[3]) console.log('d[3]:', JSON.stringify(d[3]));

    // The romanization is often in d[0][1][3] as syllable breakdown
    for (let i = 0; i < (d[0]?.length || 0); i++) {
        const item = d[0][i];
        if (Array.isArray(item)) {
            for (let j = 0; j < item.length; j++) {
                if (typeof item[j] === 'string' && item[j].length > 0) {
                    console.log(`d[0][${i}][${j}]:`, item[j]);
                }
            }
        }
    }
}
test().catch(console.error);
