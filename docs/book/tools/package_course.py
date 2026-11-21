"""독자용 예제 꾸러미를 Git 기준 시점과 장별 실습 파일로 만든다."""
import hashlib
import io
import json
import re
import subprocess
import zipfile
from pathlib import Path, PurePosixPath

book = Path(__file__).resolve().parents[1]
course = book / "course"
output = book / "output" / "market-lab.zip"
steps = course / "steps"
refs = {4: "adcfaab", 11: "479f6f5", 15: "e15dac6", 16: "c949154",
        17: "97b00ff", 18: "807d295", 19: "35b12e4", 20: "9f5fd1318294b2bc5a7cfd700952f3512835febd"}
titles = {int(n): name.strip() for n, name in re.findall(
    r"^### (\d+)장 (.+)$", (book / "table-of-contents.md").read_text("utf-8"), re.M)}
chapters = {}
seen = set()
mobile = "apps/mobile/"
shortcut_path = mobile + "src/components/talkback-settings-button.tsx"
# 각 장의 기준 커밋은 유지하고, 세 화면에 같은 Android 설정 버튼만 보강한다.
shortcut_screens = {
    "App.tsx": ("./src/components/", "                  </View>\n\n                  <View style={styles.welcome}>", 20),
    "src/components/catalog-loader.tsx": ("./", "        </ScrollView>", 10),
    "src/components/shopping-receipt.tsx": ("./", "    </ScrollView>", 6),
}

def source_files(revision):
    result = subprocess.run(["git", "archive", "--format=zip", revision], cwd=book.parents[1],
                            stdout=subprocess.PIPE, check=True)
    with zipfile.ZipFile(io.BytesIO(result.stdout)) as archive:
        for item in archive.infolist():
            if item.is_dir():
                continue
            name = item.filename
            path = PurePosixPath(name)
            if (any(part in {".git", ".expo", ".artifacts", "node_modules", "credentials", "__pycache__"}
                    for part in path.parts)
                    or (path.name.startswith(".env") and path.name != ".env.example")
                    or path.suffix.lower() in {".jks", ".apk", ".aab", ".keystore", ".pem", ".p12"}
                    or name.startswith("data/") or "credentials.json" in name):
                raise ValueError("꾸러미에 적합하지 않은 파일: " + name)
            yield name, archive.read(item)

def local_files(directory):
    for path in sorted(directory.rglob("*")):
        if path.is_file():
            yield path.relative_to(directory).as_posix(), path.read_bytes()

def with_shortcut(name, data):
    screen = name.removeprefix(mobile)
    if screen not in shortcut_screens or not name.startswith(mobile):
        return data
    prefix, anchor, indent = shortcut_screens[screen]
    source = data.decode("utf-8")
    if source.count(anchor) != 1:
        raise ValueError("설정 버튼을 배치할 화면을 확인하세요: " + name)
    imports, body = source.split("\n\n", 1)
    if screen != "App.tsx":
        imports = imports.replace("Pressable,", "Platform, Pressable,", 1)
    button_import = f"import {{ TalkBackSettingsButton }} from '{prefix}talkback-settings-button';"
    native_button = " " * indent + "{Platform.OS === 'android' && <TalkBackSettingsButton />}"
    body = body.replace(anchor, native_button + "\n" + anchor)
    return (imports + "\n\n" + button_import + "\n" + body).encode("utf-8")

def put_object(archive, data):
    fingerprint = hashlib.sha256(data).hexdigest()
    if fingerprint not in seen:
        archive.writestr("objects/" + fingerprint, data)
        seen.add(fingerprint)
    return fingerprint

output.parent.mkdir(exist_ok=True)
temp = output.with_suffix(".partial")
with zipfile.ZipFile(temp, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    previous = {}
    for number in range(3, 21):
        key = f"{number:02d}"
        if number in refs:
            sources = source_files(refs[number])
            # 20장 완성본은 설정 버튼과 50,000원 예산·지불을 포함한 검증 커밋을 그대로 실습한다.
            if 16 <= number <= 19:
                previous = {n: put_object(archive, with_shortcut(n, b)) for n, b in sources}
                shortcut = subprocess.check_output(["git", "show", "3487654:" + shortcut_path], cwd=book.parents[1])
                previous[shortcut_path] = put_object(archive, shortcut)
            else:
                previous = {n: put_object(archive, b) for n, b in sources}
        files = previous.copy()
        if number == 3 or 5 <= number <= 10:
            prefix = "" if number == 3 else "apps/mobile/"
            for name, data in local_files(steps / key):
                files[prefix + name] = put_object(archive, data)
        chapters[key] = {"label": titles[number], "files": dict(sorted(files.items()))}
        if number >= 4 and "apps/mobile/package-lock.json" not in files:
            raise ValueError("앱 루트와 잠금 파일을 찾을 수 없습니다")
        previous = files
    for name in ["start.mjs", "README.md"]:
        archive.write(course / name, name)
    for key in ["11", "13", "14"]:
        for name, data in local_files(steps / key):
            archive.writestr("steps/" + key + "/" + name, data)
    archive.write(book / "samples/cart-total.ts", "practice/cart-total.ts")
    archive.writestr("index.json", json.dumps({"chapters": chapters}, ensure_ascii=False))
with zipfile.ZipFile(temp) as archive:
    assert archive.testzip() is None
    assert all(hashlib.sha256(archive.read("objects/" + key)).hexdigest() == key for key in seen)
temp.replace(output)
print(output, len(chapters), "chapters", len(seen), "unique files")
