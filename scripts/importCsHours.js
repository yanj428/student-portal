// Loads the school's community service running record (one tab per student)
// into the portal as approved activities with no project report.
//
//   npm run import:hours -- "path/to/workbook.xlsx"            (dry run: changes nothing)
//   npm run import:hours -- "path/to/workbook.xlsx" --apply    (writes to the database)
//   --date-fix "8-Aug-0205=2025-08-08"                          (repeatable: a date typed wrongly in the sheet)
//   --id-fix 241920=20241920                                    (repeatable: an ID typed wrongly on a tab)
//
// A tab belongs to the account <ID number>@kpis.ac.th (the ID is on the tab).
// Tabs with no matching account are listed and skipped. Running it again is
// safe: a row that was already imported is not added twice.
const fs = require('fs');
const crypto = require('crypto');
const zlib = require('zlib');

const db = require('../server/db');
const { SCHOOL_DOMAIN } = require('../server/config');

// ---- Reading an .xlsx (a zip of XML files) without a library ----

function readZip(buffer) {
  const files = new Map();
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error('This is not an .xlsx file.');
  let at = buffer.readUInt32LE(end + 16);
  for (let n = buffer.readUInt16LE(end + 10); n > 0; n -= 1) {
    const method = buffer.readUInt16LE(at + 10);
    const size = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const local = buffer.readUInt32LE(at + 42);
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLength);
    const dataStart = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const raw = buffer.subarray(dataStart, dataStart + size);
    files.set(name, () => (method === 0 ? raw : zlib.inflateRawSync(raw)).toString('utf8'));
    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

const decode = (text) => text
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, c) => String.fromCodePoint(Number(c))).replace(/&amp;/g, '&');

function readWorkbook(file) {
  const zip = readZip(fs.readFileSync(file));
  const read = (name) => (zip.has(name) ? zip.get(name)() : '');
  const strings = [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((m) => decode([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
  const rels = new Map([...read('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)].map((m) => {
    const tag = m[0];
    return [/Id="([^"]*)"/.exec(tag)[1], /Target="([^"]*)"/.exec(tag)[1]];
  }));
  return [...read('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)].map((m) => {
    const tag = m[0];
    const target = rels.get(/r:id="([^"]*)"/.exec(tag)[1]);
    const rows = [];
    [...read(`xl/${target.replace(/^\/?(xl\/)?/, '')}`).matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)].forEach(([, rowNumber, body]) => {
      const cells = {};
      [...body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].forEach(([, attrs, inner]) => {
        const value = /<v>([\s\S]*?)<\/v>/.exec(inner || '');
        if (!value) return;
        const column = /r="([A-Z]+)\d+"/.exec(attrs)[1];
        cells[column] = / t="s"/.test(attrs) ? strings[Number(value[1])] : decode(value[1]);
      });
      if (Object.keys(cells).length) rows.push({ number: Number(rowNumber), cells });
    });
    return { name: decode(/name="([^"]*)"/.exec(tag)[1]), rows };
  });
}

// ---- Turning a tab into activities ----

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function isoDate(cell, fixes) {
  if (!cell) return '';
  if (fixes.has(cell)) return fixes.get(cell);
  if (/^\d+(\.\d+)?$/.test(cell)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(cell)) * 86400000);
    return date.toISOString().slice(0, 10);
  }
  const text = /^(\d{1,2})-([A-Za-z]{3})[a-z]*-(\d{4})$/.exec(cell);
  const month = text ? MONTHS.indexOf(text[2].toLowerCase()) : -1;
  if (month < 0) return '';
  return `${text[3]}-${String(month + 1).padStart(2, '0')}-${text[1].padStart(2, '0')}`;
}

function readTab(sheet, fixes) {
  let name = '';
  let id = '';
  const activities = [];
  sheet.rows.forEach(({ number, cells }) => {
    if (cells.H === 'Student name:') name = cells.I || '';
    if (cells.H === 'ID Number:') id = cells.I ? String(Math.round(Number(cells.I))) : '';
    if (number === 1 || !cells.C || !(Number(cells.D) > 0)) return;
    activities.push({
      row: number,
      date: isoDate(cells.A, fixes),
      grade: Number(cells.B) || null,
      title: cells.C.trim(),
      hours: Math.round(Number(cells.D) * 100) / 100,
      staff: (cells.E || '').trim(),
      initials: (cells.F || '').trim().toUpperCase(),
    });
  });
  return { sheet: sheet.name, name, id, activities };
}

// ---- Main ----

const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith('--') && !['--date-fix', '--id-fix'].includes(args[i - 1]));
const apply = args.includes('--apply');
const optionPairs = (flag) => new Map(args.flatMap((a, i) => (args[i - 1] === flag ? [a.split('=')] : [])));
const fixes = optionPairs('--date-fix');
const idFixes = optionPairs('--id-fix');
if (!file) {
  console.error('Usage: npm run import:hours -- <workbook.xlsx> [--apply] [--date-fix "8-Aug-0205=2025-08-08"]');
  process.exit(1);
}

const tabs = readWorkbook(file)
  .filter((s) => !['Instructions', 'Sample'].includes(s.name))
  .map((s) => readTab(s, fixes))
  .filter((t) => t.activities.length > 0);

const all = db.readCsHours();
const already = new Set(all.map((e) => e.importKey).filter(Boolean));
const added = [];
let skippedTabs = 0;

tabs.forEach((tab) => {
  const accountId = idFixes.get(tab.id) || tab.id;
  const student = db.findByEmail(`${accountId}${SCHOOL_DOMAIN}`);
  if (!student) {
    skippedTabs += 1;
    console.log(`- ${tab.sheet}: no account for ${accountId}${SCHOOL_DOMAIN}, skipped (${tab.activities.length} activities)`);
    return;
  }
  const fresh = tab.activities.filter((a) => !already.has(`${tab.id}:${a.row}`));
  fresh.forEach((a) => added.push({
    id: crypto.randomUUID(),
    importKey: `${tab.id}:${a.row}`,
    studentId: student.id,
    title: a.title,
    clubId: '',
    clubName: '',
    organization: '',
    date: a.date,
    endDate: '',
    grade: a.grade,
    sdgs: [],
    links: [],
    evidence: [],
    tasks: [],
    hours: a.hours,
    advisorName: a.staff,
    advisorContact: '',
    status: 'approved',
    approvedBy: a.initials,
    note: '',
    studentSeen: true,
    createdAt: new Date().toISOString(),
  }));
  const hours = fresh.reduce((n, a) => n + a.hours, 0);
  const undated = fresh.filter((a) => !a.date).length;
  console.log(`+ ${tab.sheet}: ${fresh.length} new of ${tab.activities.length} activities, ${Math.round(hours * 100) / 100} hours${undated ? `, ${undated} with no date` : ''}`);
});

const totalHours = added.reduce((n, e) => n + e.hours, 0);
console.log(`\n${added.length} activities (${Math.round(totalHours * 100) / 100} hours) for ${tabs.length - skippedTabs} students; ${skippedTabs} tabs skipped.`);
const large = added.filter((e) => e.hours > 60);
if (large.length) console.log(`Check these in the sheet (over 60 hours): ${large.map((e) => `${e.title} (${e.hours})`).join('; ')}`);

if (!apply) {
  console.log('Dry run: nothing was changed. Add --apply to write these.');
} else if (added.length) {
  db.writeCsHours([...all, ...added]);
  console.log('Written.');
}
