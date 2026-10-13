#!/bin/bash
set -euo pipefail

test_directory="$(mktemp -d)"
trap 'rm -rf "${test_directory}"' EXIT
cd "${test_directory}"

python3 - <<'PY'
import importlib

for module in (
    "numpy", "pandas", "scipy", "matplotlib", "openpyxl", "xlsxwriter",
    "docx", "pptx", "pypdf", "pdfplumber", "reportlab", "PIL",
    "requests", "httpx", "bs4", "lxml", "yaml",
):
    importlib.import_module(module)

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from bs4 import BeautifulSoup
from docx import Document
from PIL import Image
from pptx import Presentation
from pypdf import PdfReader
from reportlab.pdfgen import canvas
import pdfplumber
import yaml

frame = pd.DataFrame({"value": [1, 2, 3]})
assert np.sum(frame["value"].to_numpy()) == 6
for engine in ("openpyxl", "xlsxwriter"):
    filename = f"table-{engine}.xlsx"
    frame.to_excel(filename, index=False, engine=engine)
    assert pd.read_excel(filename)["value"].tolist() == [1, 2, 3]

document = Document()
document.add_paragraph("sandbox smoke test")
document.save("document.docx")
assert Document("document.docx").paragraphs[0].text == "sandbox smoke test"

presentation = Presentation()
presentation.slides.add_slide(presentation.slide_layouts[6])
presentation.save("presentation.pptx")
assert len(Presentation("presentation.pptx").slides) == 1

pdf = canvas.Canvas("document.pdf")
pdf.drawString(72, 720, "sandbox smoke test")
pdf.save()
assert len(PdfReader("document.pdf").pages) == 1
with pdfplumber.open("document.pdf") as document:
    assert "sandbox smoke test" in document.pages[0].extract_text()

plt.plot([1, 2, 3])
plt.savefig("chart.png")
plt.close()
with Image.open("chart.png") as image:
    assert image.format == "PNG"

assert BeautifulSoup("<p>sandbox</p>", "lxml").p.text == "sandbox"
assert yaml.safe_load("value: 3")["value"] == 3
print("Python: imports, data, XLSX, DOCX, PPTX, PDF, PNG, HTML and YAML passed")
PY

node - <<'JS'
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { Document, Packer, Paragraph } = require('docx');
const PptxGenJS = require('pptxgenjs');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

async function main() {
  for (const name of ['axios', 'cheerio', 'dayjs', 'lodash', 'yaml', 'zod', 'typescript']) {
    require(name);
  }
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Data').addRow(['sandbox', 3]);
  const readback = new ExcelJS.Workbook();
  await readback.xlsx.load(await workbook.xlsx.writeBuffer());
  assert.equal(readback.getWorksheet('Data').getCell('B1').value, 3);

  const docx = await Packer.toBuffer(new Document({ sections: [
    { children: [new Paragraph('sandbox smoke test')] }
  ] }));
  assert.equal(docx.subarray(0, 2).toString(), 'PK');
  const presentation = new PptxGenJS();
  presentation.addSlide().addText('sandbox smoke test', { x: 1, y: 1, w: 5, h: 1 });
  const pptx = await presentation.write({ outputType: 'nodebuffer' });
  assert.equal(pptx.subarray(0, 2).toString(), 'PK');

  const pdf = await PDFDocument.create();
  pdf.addPage();
  assert.equal((await PDFDocument.load(await pdf.save())).getPageCount(), 1);
  const image = await sharp({ create: {
    width: 2, height: 3, channels: 3, background: '#ffffff'
  } }).png().toBuffer();
  assert.equal((await sharp(image).metadata()).height, 3);
  assert.deepEqual(parse(stringify([['sandbox', '3']])), [['sandbox', '3']]);
  assert.equal(require('cheerio').load('<p>sandbox</p>')('p').text(), 'sandbox');
  assert.equal(require('yaml').parse('value: 3').value, 3);
  assert.equal(require('zod').z.number().safeParse('bad input').success, false);
  console.log('Node CommonJS: imports, XLSX, DOCX, PPTX, PDF, PNG, CSV, HTML and YAML passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
JS

node --input-type=module - <<'JS'
import assert from 'node:assert/strict';
import { parse } from 'yaml';
for (const name of [
  'axios', 'cheerio', 'csv-parse', 'csv-stringify', 'dayjs', 'docx', 'exceljs',
  'lodash', 'pdf-lib', 'pptxgenjs', 'sharp', 'typescript', 'yaml', 'zod'
]) {
  await import(name);
}
assert.equal(parse('value: 3').value, 3);
console.log('Node ESM: imports from an independent working directory passed');
JS

tsx -e 'const value: number = 3; if (value !== 3) throw new Error("TypeScript smoke test failed");'
tsc --version
python3 -m pip check
