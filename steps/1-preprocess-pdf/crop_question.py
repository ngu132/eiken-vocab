from pypdf import PdfReader, PdfWriter
import io

def clop_question_pdf(src: str):
    reader = PdfReader(src)
    dst = io.BytesIO()
    writer = PdfWriter()

    for i in range(2, -1):
        writer.add_page(reader.pages[i])

    writer.write(dst)
    dst.seek(0)
    return dst
