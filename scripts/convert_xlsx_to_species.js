// Node script: convert_xlsx_to_species.js
// Usage:
// 1) npm install xlsx
// 2) node scripts/convert_xlsx_to_species.js "2023 야조회 종목록.xlsx"

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

if (process.argv.length < 3) {
  console.error('Usage: node convert_xlsx_to_species.js <input.xlsx> [output.js]');
  process.exit(1);
}

const input = process.argv[2];
const output = process.argv[3] || path.join(process.cwd(), 'species-data.js');

if (!fs.existsSync(input)) {
  console.error('Input file not found:', input);
  process.exit(1);
}

function parseWorkbook(filePath) {
  const wb = XLSX.readFile(filePath);
  const first = wb.SheetNames[0];
  const sheet = wb.Sheets[first];
  // try header-based parse first
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  if (!rows || rows.length === 0) return [];
  const headerRow = rows[0].map(h => (h || '').toString().trim());
  const headerNames = headerRow.map(h => h.toLowerCase());
  const hasHeader = headerNames.some(h => ['번호','no','과','국명','학명','영명','특이사항','notes','name'].includes(h));
  const out = [];
  if (hasHeader) {
    const idx = {
      id: headerNames.findIndex(h => ['번호','no','id'].includes(h)),
      family: headerNames.findIndex(h => ['과','family'].includes(h)),
      kor: headerNames.findIndex(h => ['국명','kor','name','국어명'].includes(h)),
      eng: headerNames.findIndex(h => ['영명','eng','english'].includes(h)),
      sci: headerNames.findIndex(h => ['학명','sci','scientific'].includes(h)),
      notes: headerNames.findIndex(h => ['특이사항','notes','remark','비고'].includes(h))
    };
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;
      const item = {
        id: idx.id >= 0 ? row[idx.id] : row[0],
        family: idx.family >= 0 ? row[idx.family] : (row[1] || ''),
        kor: idx.kor >= 0 ? row[idx.kor] : (row[2] || ''),
        eng: idx.eng >= 0 ? row[idx.eng] : '',
        sci: idx.sci >= 0 ? row[idx.sci] : (row[3] || ''),
        notes: idx.notes >= 0 ? row[idx.notes] : (row[4] || '')
      };
      out.push(item);
    }
  } else {
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;
      const item = {
        id: row[0],
        family: row[1] || '',
        kor: row[2] || '',
        eng: row[3] || '',
        sci: row[4] || '',
        notes: row[5] || ''
      };
      out.push(item);
    }
  }
  return out.map((x, i) => ({
    id: Number(x.id) || (i+1),
    family: (x.family || '').toString().trim(),
    kor: (x.kor || '').toString().trim(),
    eng: (x.eng || '').toString().trim(),
    sci: (x.sci || '').toString().trim(),
    notes: (x.notes || '').toString().trim()
  }));
}

try {
  const list = parseWorkbook(input);
  const js = `// Auto-generated from ${path.basename(input)}\nwindow.EMBEDDED_DEFAULT_SPECIES = ${JSON.stringify(list, null, 2)};\n`;
  fs.writeFileSync(output, js, 'utf8');
  console.log('Wrote', output, 'with', list.length, 'items');
} catch (e) {
  console.error('Error parsing/writing:', e);
  process.exit(1);
}
