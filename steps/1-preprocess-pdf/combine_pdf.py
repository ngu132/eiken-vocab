import pypdf

def merge_pdfs(
    question: str | None,
    answer: str | None,
    script: str | None,
) -> pypdf.PdfWriter:
    writer = pypdf.PdfWriter()

    pages: list[pypdf.PageObject] = []
    if question:
        question_pdf = pypdf.PdfReader(question)
        for page in question_pdf.pages[2:-2]:
            pages.append(page)
    if answer:
        answer_pdf = pypdf.PdfReader(answer)
        for page in answer_pdf.pages:
            pages.append(page)
    if script:
        script_pdf = pypdf.PdfReader(script)
        for page in script_pdf.pages:
            pages.append(page)

    n = len(pages)
    i = 0
    while i < n:
        # 4 up
        lt = pages[i]
        rt = pages[i+1] if i+1 < n else None
        lb = pages[i+2] if i+2 < n else None
        rb = pages[i+3] if i+3 < n else None

        single_w = max(
            float(lt.mediabox.width),
            float(rt.mediabox.width) if rt is not None else 0,
        )
        single_h = max(
            float(lt.mediabox.height),
            float(lb.mediabox.height) if lb is not None else 0,
        )

        out = writer.add_blank_page(width=single_w*2, height=single_h*2)

        
        if lt:
            out.merge_transformed_page(lt, pypdf.Transformation().translate(0, single_h))
        if rt:
            out.merge_transformed_page(rt, pypdf.Transformation().translate(single_w, single_h))
        if lb:
            out.merge_transformed_page(lb, pypdf.Transformation().translate(0, 0))
        if rb:
            out.merge_transformed_page(rb, pypdf.Transformation().translate(single_w, 0))
        i += 4
    return writer

