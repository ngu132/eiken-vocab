import pdfplumber
import re

EXCLUDE_LINE_PATTERNS = [
    r'^Grade\d$', # 不要なコンテキスト。級のみの行
    r'公益財団法人日本英語検定協会', # 不要なコンテキスト。協会名
    r'禁じます' # 不要なコンテキスト。
]
EXCLUDE_LINE_REGEX = re.compile('|'.join([f'({p})' for p in EXCLUDE_LINE_PATTERNS]))

def format_question(question: str):
    with pdfplumber.open(question) as pdf:
        pages = pdf.pages
        pages = pages[2:-1] # 1 ページ目は表紙、2 ページ目はほぼ空白だから除外
        
        text = ''
        for page in pages:
            lastTop = 0
            for v in page.extract_text_lines():
                if EXCLUDE_LINE_REGEX.search(v['text']):
                    continue
                top = int(v['top'])
                top_delta = top - lastTop
                if top_delta > 25:
                    text += '\n'
                text += v['text'] + '\n'
                #print(top_delta, v['text'])
                lastTop = top
    return text
    
    
        