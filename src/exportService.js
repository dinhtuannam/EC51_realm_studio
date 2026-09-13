'use strict';

const fs = require('fs');
const path = require('path');
const realmService = require('./realmService');

const EXPORT_DIR = path.join(__dirname, '..', 'exports');
const NUMERIC_TYPES = new Set(['int', 'float', 'double', 'decimal128']);

function pad(n) {
  return String(n).padStart(2, '0');
}

// {table}_yyyymmdd_hhmmss, per spec - one file per export click, not a
// rolling/shared file, so the name alone tells you when it was produced.
function timestampForFilename(date) {
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
    + `_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

function sanitizeForFilename(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function cellToDisplayString(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value.__complex) return value.preview;
  return String(value);
}

function escapeCsvField(value) {
  const str = cellToDisplayString(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(properties, rows) {
  const header = properties.map((p) => escapeCsvField(p.name)).join(',');
  const lines = rows.map((row) => properties.map((p) => escapeCsvField(row[p.name])).join(','));
  return [header, ...lines].join('\r\n') + '\r\n';
}

function escapeMarkdownCell(value) {
  return cellToDisplayString(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function toMarkdown(properties, rows) {
  const header = `| ${properties.map((p) => p.name).join(' | ')} |`;
  const divider = `| ${properties.map(() => '---').join(' | ')} |`;
  const lines = rows.map((row) => `| ${properties.map((p) => escapeMarkdownCell(row[p.name])).join(' | ')} |`);
  return [header, divider, ...lines].join('\n') + '\n';
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlCell(prop, rawValue) {
  if (rawValue === null || rawValue === undefined) return '<Cell></Cell>';
  if (typeof rawValue === 'object' && rawValue.__complex) {
    return `<Cell><Data ss:Type="String">${escapeXml(rawValue.preview)}</Data></Cell>`;
  }
  if (NUMERIC_TYPES.has(prop.type) && Number.isFinite(Number(rawValue))) {
    return `<Cell><Data ss:Type="Number">${Number(rawValue)}</Data></Cell>`;
  }
  return `<Cell><Data ss:Type="String">${escapeXml(String(rawValue))}</Data></Cell>`;
}

// SpreadsheetML 2003 XML - a plain, hand-writable XML dialect Excel (and
// Numbers/Google Sheets) opens directly via the mso-application processing
// instruction, unlike a real .xlsx which is a zip of several OOXML parts
// (binary container + CRC32 + multiple XML files). Avoids adding a
// dependency just for this one export path, at the cost of producing a
// legacy-ish .xls rather than a native .xlsx - still opens cleanly, not a
// renamed CSV.
function toExcelXml(properties, rows) {
  const headerCells = properties.map((p) => `<Cell><Data ss:Type="String">${escapeXml(p.name)}</Data></Cell>`).join('');
  const bodyRows = rows
    .map((row) => `<Row>${properties.map((p) => xmlCell(p, row[p.name])).join('')}</Row>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Sheet1">
  <Table>
   <Row>${headerCells}</Row>
   ${bodyRows}
  </Table>
 </Worksheet>
</Workbook>
`;
}

const FORMAT_HANDLERS = {
  csv: { ext: 'csv', build: toCsv },
  markdown: { ext: 'md', build: toMarkdown },
  excel: { ext: 'xls', build: toExcelXml },
};

function exportObjects(className, filter, format) {
  const handler = FORMAT_HANDLERS[format];
  if (!handler) {
    const err = new Error(`Format "${format}" không được hỗ trợ. Chỉ hỗ trợ: csv, excel, markdown.`);
    err.statusCode = 400;
    throw err;
  }
  // limit: Infinity bypasses listObjects' normal MAX_RESULTS page cap -
  // export must include every matching record, not just the first page.
  const { rows, schema } = realmService.listObjects(className, filter, 0, Infinity);
  const content = handler.build(schema.properties, rows);

  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  const fileName = `${sanitizeForFilename(className)}_${timestampForFilename(new Date())}.${handler.ext}`;
  const filePath = path.join(EXPORT_DIR, fileName);
  fs.writeFileSync(filePath, content, 'utf8');

  return { fileName, filePath, rowCount: rows.length };
}

module.exports = { exportObjects, EXPORT_DIR };
