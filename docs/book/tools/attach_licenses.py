"""Chromium PDF의 기존 링크·책갈피를 유지해 화면 자료 라이선스와 설치기 촬영본을 첨부한다."""
import base64
import io
import json
import sys
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject


def links(reader):
    """증분 저장 뒤에도 각 페이지의 이동 대상과 외부 URL이 같은지 비교한다."""
    result = []
    for number, page in enumerate(reader.pages):
        for ref in page.get("/Annots", []):
            item = ref.get_object()
            if item.get("/Subtype") == "/Link":
                content = io.BytesIO()
                item.write_to_stream(content)
                result.append((number, content.getvalue()))
    return result


def attach(source, output, manifest):
    attachments = json.loads(manifest.read_text(encoding="utf-8"))
    original = PdfReader(source)
    writer = PdfWriter(original, incremental=True)
    expected = {}
    for item in attachments:
        data = base64.b64decode(item["encoded"], validate=True)
        file = writer.add_attachment(item["name"], data)
        file.subtype = NameObject("/" + item.get("type", "text/plain"))
        expected[item["name"]] = data
    writer.write(output)
    result = PdfReader(output)
    for filename, data in expected.items():
        if list(result.attachments[filename]) != [data]:
            raise ValueError(f"PDF 첨부 파일 원문 불일치: {filename}")
    if len(original.pages) != len(result.pages) or links(original) != links(result):
        raise ValueError("라이선스 첨부 뒤 페이지 또는 링크 변경")
    if set(original.named_destinations) != set(result.named_destinations):
        raise ValueError("라이선스 첨부 뒤 이름 있는 이동 대상 변경")


if __name__ == "__main__":
    attach(*(Path(arg) for arg in sys.argv[1:]))
