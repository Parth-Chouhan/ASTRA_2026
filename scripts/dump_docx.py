import zipfile, xml.etree.ElementTree as ET

with zipfile.ZipFile(r"c:\Users\Administrator\Downloads\astra\Lunar_Evaluator_Updated_Workflow (2).docx") as z:
    root = ET.fromstring(z.read("word/document.xml"))
    with open(r"c:\Users\Administrator\Downloads\astra\docx_text.txt", "w", encoding="utf-8") as out:
        for p in root.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p"):
            out.write("".join(p.itertext()).strip() + "\n")
print("Wrote docx_text.txt")

