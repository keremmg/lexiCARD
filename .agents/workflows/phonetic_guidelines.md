---
description: Phonetic transcription rules for LexiCard vocabulary cards
---

# LexiCard Phonetic Guidelines

## Standard
Always use **IPA (International Phonetic Alphabet)** symbols for all transcriptions.
Enclose phonetic text in slashes: `/ˈɛləkwənt/`

## Language-Specific Dialect Labels

Each language has its own regional labels. Do NOT use generic "US"/"British" for non-English languages.

| Language   | Dialect 1 Label | Dialect 1 Meaning         | Dialect 2 Label | Dialect 2 Meaning         |
|------------|-----------------|---------------------------|-----------------|---------------------------|
| English    | `US`            | General American          | `UK`            | Received Pronunciation    |
| Spanish    | `ES`            | Spain (Castilian)         | `LATAM`         | Latin American            |
| French     | `FR`            | France (Parisian)         | `QC`            | Quebec                    |
| Portuguese | `PT`            | Portugal (European)       | `BR`            | Brazilian                 |
| Arabic     | `MSA`           | Modern Standard Arabic    | `EGY`           | Egyptian (most common)    |
| German     | `DE`            | Standard German           | `AT`            | Austrian German           |
| Chinese    | `MAN`           | Mandarin (Putonghua)      | `CAN`           | Cantonese                 |

For languages not listed above, use ISO 639-1 codes (e.g., `IT` for Italian, `KO` for Korean).

## Output Format

When generating phonetics for a card, output:
```
Dialect 1 Field: /IPA transcription/
Dialect 2 Field: /IPA transcription/   ← Only if meaningfully different
```

If Dialect 1 and Dialect 2 pronunciations are **identical**, only fill in Dialect 1.
The app will automatically display a `BOTH` badge when both fields are identical.

## Validation Rules

1. **Nonsense words** (e.g., `fdgdf`, `xzqq`): Do NOT generate phonetics. Warn the user:
   > ⚠️ This doesn't appear to be a real word. Please verify the spelling before adding phonetics.

2. **Proper nouns** (names, cities): Provide phonetics but note they may vary by speaker.

3. **Loanwords**: Use the pronunciation from the target language, not the source language.
   - Example: "Sushi" in English → `/ˈsuːʃi/` (English pronunciation), not the Japanese `/suɕi/`

## Card Editor Field Mapping

The card editor shows dialect-aware labels based on the deck's language:

| Language | Field 1 Label           | Field 2 Label              |
|----------|-------------------------|----------------------------|
| English  | 🔵 US Phonetic          | 🔴 UK Phonetic             |
| Spanish  | 🔵 ES (Spain) Phonetic  | 🟢 LATAM Phonetic          |
| French   | 🔵 FR Phonetic          | 🟣 QC (Quebec) Phonetic    |
| Other    | 🔵 Main Dialect         | 🔴 Alt Dialect             |
