import zipfile, xml.etree.ElementTree as ET

with zipfile.ZipFile(r"c:\Users\Administrator\Downloads\astra\Lunar_Evaluator_Updated_Workflow (2).docx") as z:
    root = ET.fromstring(z.read("word/document.xml"))
    for p in root.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p"):
        txt = "".join(p.itertext()).strip()
        if any(w in txt.lower() for w in ["apollo", "chandrayaan", "malapert", "mouton", "shackleton", "tsiolkovskiy"]):
            print("P:", txt)

