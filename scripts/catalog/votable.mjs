import { DOMParser } from '@xmldom/xmldom';

/** Bounded TABLEDATA reader. Values remain strings, including 64-bit source IDs. */
export function readVotable(xml, { maxBytes = 16 * 1024 * 1024, maxRows = 10000 } = {}) {
  if (Buffer.byteLength(xml) > maxBytes) throw new Error('VOTable exceeds byte budget');
  if (/<!\s*(DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error('DTD/entities are not accepted');
  const doc = new DOMParser({ onError(level, message) { throw new Error(`Invalid XML (${level}): ${message}`); } }).parseFromString(xml, 'application/xml');
  if (doc.documentElement.localName !== 'VOTABLE') throw new Error('Expected VOTable response');
  const elements = (node, name) => Array.from(node.getElementsByTagNameNS('*', name));
  const params = {};
  for (const node of [...elements(doc, 'PARAM'), ...elements(doc, 'INFO')]) {
    const name = node.getAttribute('name');
    const value = node.getAttribute('value') || node.textContent.trim();
    if (name === 'QUERY_STATUS' && value !== 'OK') throw new Error(`Remote query status: ${value}`);
    if (name) params[name] = value;
  }
  if (params.RECORDS_AVAILABLE && params.RECORDS_RETURNED && BigInt(params.RECORDS_AVAILABLE) > BigInt(params.RECORDS_RETURNED)) throw new Error('Truncated NED response');
  let totalRows = 0;
  const tables = elements(doc, 'TABLE').map(table => {
    const fields = Array.from(table.childNodes).filter(node => node.localName === 'FIELD').map(node => ({
      key: node.getAttribute('ID') || node.getAttribute('name'), name: node.getAttribute('name'),
      datatype: node.getAttribute('datatype'), unit: node.getAttribute('unit') || null,
    }));
    if (!fields.length || new Set(fields.map(field => field.key)).size !== fields.length) throw new Error('Invalid VOTable columns');
    if (elements(table, 'BINARY').length || elements(table, 'BINARY2').length || elements(table, 'FITS').length) throw new Error('Unsupported VOTable serialization; request TABLEDATA');
    const data = elements(table, 'TABLEDATA');
    if (data.length !== 1) throw new Error('Missing VOTable TABLEDATA');
    const rows = elements(data[0], 'TR').map(tr => {
      if (++totalRows > maxRows) throw new Error('VOTable exceeds row budget');
      const cells = Array.from(tr.childNodes).filter(node => node.localName === 'TD');
      if (cells.length !== fields.length) throw new Error('VOTable row width mismatch');
      return Object.fromEntries(fields.map((field, index) => [field.key, cells[index].textContent.trim()]));
    });
    if (table.hasAttribute('nrows') && BigInt(table.getAttribute('nrows')) !== BigInt(rows.length)) throw new Error('VOTable nrows mismatch');
    return { id: table.getAttribute('ID'), name: table.getAttribute('name'), fields, rows };
  });
  if (!tables.length) throw new Error('Missing VOTable table');
  return { params, tables };
}
