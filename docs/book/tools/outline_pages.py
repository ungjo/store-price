"""PDF 책갈피의 실제 쪽 번호를 목차 조판에 전달한다."""
import json
import sys
from pypdf import PdfReader

pdf = PdfReader(sys.argv[1])
pages = {}
def visit(items):
    for item in items:
        if isinstance(item, list):
            visit(item)
        else:
            name = " ".join(item.title.split())
            pages[name] = pdf.get_destination_page_number(item) + 1
visit(pdf.outline)
print(json.dumps({"pages": pages, "count": len(pdf.pages)}, ensure_ascii=True))
