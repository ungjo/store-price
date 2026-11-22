"""Match print-page starts to the continuous HTML using the text of the finished PDF."""
import bisect
import difflib
import json
import re
import sys
import unicodedata

from pypdf import PdfReader


def compact(text):
    return "".join(ch for ch in unicodedata.normalize("NFKC", text)
                   if not ch.isspace() and ch not in "\u00ad\u200b\ufeff")


def unique_landmarks(html, pdf, size=18):
    # 긴 고유 문자열로 같은 문맥을 먼저 묶어 반복되는 제목·명령이 서로 바뀌지 않게 한다.
    lookup = {}
    for pos in range(0, len(html) - size + 1, size):
        word = html[pos:pos + size]
        lookup[word] = pos if word not in lookup else -1
    candidates = []
    for pos in range(len(pdf) - size + 1):
        target = lookup.get(pdf[pos:pos + size], -1)
        if target >= 0:
            candidates.append((pos, target))
    tails, indices, previous = [], [], []
    for i, (_, target) in enumerate(candidates):
        slot = bisect.bisect_left(tails, target)
        previous.append(indices[slot-1] if slot else -1)
        if slot == len(tails):
            tails.append(target)
            indices.append(i)
        else:
            tails[slot], indices[slot] = target, i
    chosen = []
    i = indices[-1] if indices else -1
    while i >= 0:
        chosen.append(candidates[i])
        i = previous[i]
    end_pdf = end_html = 0
    for pos, target in reversed(chosen):
        if pos >= end_pdf and target >= end_html:
            yield pos, target, size
            end_pdf, end_html = pos+size, target+size


def matching_ranges(html, pdf):
    last_pdf = last_html = 0
    for pos, target, length in [*unique_landmarks(html, pdf), (len(pdf), len(html), 0)]:
        if pos > last_pdf and target > last_html:
            gap = difflib.SequenceMatcher(None, pdf[last_pdf:pos], html[last_html:target], autojunk=False)
            for a, b, size in gap.get_matching_blocks():
                if size:
                    yield last_pdf+a, last_html+b, size
        if length:
            yield pos, target, length
        last_pdf, last_html = pos+length, target+length


def page_offsets(reader, html):
    pages = []
    for n, page in enumerate(reader.pages, 1):
        text = compact(page.extract_text() or "")
        footer = compact("꼬마 시장 Android 앱 개발 실습서") + str(n)
        if not text.endswith(footer):
            raise ValueError(f"{n}쪽 인쇄 꼬리말을 찾을 수 없습니다.")
        body = text[:-len(footer)]
        if not body:
            raise ValueError(f"{n}쪽에 HTML 경계와 대조할 인쇄 본문이 없습니다.")
        pages.append(body)
    pdf = "".join(pages)
    # 지문 경계에서 하나의 실제 일치 구간이 잘릴 수 있다. 다시 합쳐 첫 글자까지 보존한다.
    blocks = []
    for p, h, size in matching_ranges(html, pdf):
        if blocks and blocks[-1][0] + blocks[-1][2] == p and blocks[-1][1] + blocks[-1][2] == h:
            blocks[-1][2] += size
        else:
            blocks.append([p, h, size])
    ends = [p + length for p, _, length in blocks]
    cursor = 0
    result = []
    for number, text in enumerate(pages, 1):
        # 표가 다음 쪽으로 넘어가면서 반복되는 열 이름, 글머리표, 장식 글자는 건너뛴다.
        # 1~2글자만 우연히 맞는 조각은 이 지면의 첫 본문으로 보지 않는다.
        i = bisect.bisect_right(ends, cursor)
        while i < len(blocks):
            p, h, size = blocks[i]
            start = max(cursor, p)
            if min(p+size, cursor+len(text))-start >= min(4, len(text)):
                break
            i += 1
        else:
            raise ValueError(f"{number}쪽과 일치하는 HTML 본문이 없습니다.")
        if start >= cursor+len(text):
            raise ValueError(f"{number}쪽과 다음 쪽 사이에서 HTML 경계를 찾지 못했습니다.")
        pos = h + start - p
        if result and pos <= result[-1]["offset"]:
            raise ValueError(f"{number}쪽 HTML 경계가 앞 쪽과 겹칩니다.")
        result.append({"offset": pos, "printPrefix": text[:start-cursor]})
        cursor += len(text)
    return result


if __name__ == "__main__":
    with open(sys.argv[1], "rb") as f:
        reader = PdfReader(f)
        offsets = page_offsets(reader, json.loads(sys.stdin.buffer.read()))
    print(json.dumps(offsets, ensure_ascii=True))
