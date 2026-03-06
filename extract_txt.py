import fitz
import re

for pdf in ["The_Oxford_5000.pdf", "American_Oxford_5000_by_CEFR_level.pdf"]:
    print(f"--- {pdf} ---")
    out = open(pdf.replace('.pdf', '.txt'), 'w', encoding='utf-8')
    try:
        doc = fitz.open(pdf)
        all_text = ""
        for page in doc:
            all_text += page.get_text() + "\n"
        out.write(all_text)
        doc.close()
    except Exception as e:
        out.write(str(e) + "\n")
    out.close()
