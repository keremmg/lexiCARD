import fitz
import re

out = open('c1_raw.txt', 'w', encoding='utf-8')

for pdf in ["The_Oxford_5000.pdf", "American_Oxford_5000_by_CEFR_level.pdf"]:
    out.write(f"\n--- {pdf} ---\n")
    try:
        doc = fitz.open(pdf)
        all_text = ""
        for page in doc:
            all_text += page.get_text() + "\n"
        
        lines = all_text.split('\n')
        for i, l in enumerate(lines):
            l = l.strip()
            if l == 'C1':
                # Grab a little context around it
                start = max(0, i-2)
                end = min(len(lines), i+3)
                context = " | ".join([lines[j].strip() for j in range(start, end)])
                out.write(context + "\n")
                
        doc.close()
    except Exception as e:
        out.write(str(e) + "\n")

out.close()
