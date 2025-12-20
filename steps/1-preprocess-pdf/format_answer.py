import pdfplumber
import re

NUMBER_PATTERN = re.compile(r"^\d$")
BRACKET_NUMBER_PATTERN = re.compile(r"^\(\d+?\)$")
PART_NUMBER_PATTERN = re.compile(r"^Part[\s\S]?\d+$")
NO_NUMBER_PATTERN = re.compile(r"^No\.? ?\d+$")

def get_qas_by_pdf(pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        first_page = pdf.pages[0]
        tables = first_page.extract_tables()
        qas = []
        for table in tables:
            parsed = None
            if BRACKET_NUMBER_PATTERN.match(table[0][1]) or PART_NUMBER_PATTERN.match(table[0][0]):
                qa_map = {}
                for row in table:
                    for i in range(1, len(row), 2):
                        q = row[i]
                        a = row[i + 1] if i + 1 < len(row) else ""
                        if not q or not (BRACKET_NUMBER_PATTERN.match(q) or NO_NUMBER_PATTERN.match(q)):
                            continue
                        qa_map[
                            int(q.replace('(', '').replace(')', '').replace('No.', '').strip())
                        ] = a
                qa_map = dict(sorted(qa_map.items()))
                parsed = { "type": "qa", "index": table[0][0].replace('\n', ''), "data": qa_map }
            elif len(table[0]) == 2:
                parsed = { "table": "example", "index": table[0][0],"data": table[0][1] }
            else:
                raise ValueError("Unknown table format")
            qas.append(parsed)
        return qas
def llmify_qas(qas):
    text = ""
    for qa in qas:
        text += f'<section{qa["index"]}>\n'
        if qa.get("type") == "qa":
            for q_num, a_text in qa["data"].items():
                text += (f"Q{q_num}:{a_text}\n")
        elif qa.get("table") == "example":
            text += (f'<example>{qa["data"]}</example>\n')
        text += f'</section{qa["index"]}>\n'
    return text
