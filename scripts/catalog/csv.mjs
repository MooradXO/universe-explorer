/** Streaming RFC 4180 reader, including quoted newlines and escaped quotes. */
export async function* readCsv(chunks, { maxRecordCharacters = 1024 * 1024 } = {}) {
  let record = [];
  let field = '';
  let state = 'start';
  let skipLf = false;
  let characters = 0;
  let first = true;
  for await (const chunk of chunks) {
    if (typeof chunk !== 'string') throw new Error('CSV input must be decoded UTF-8 text.');
    for (const character of chunk) {
      if (first) { first = false; if (character === '\uFEFF') continue; }
      if (skipLf) { skipLf = false; if (character === '\n') continue; }
      if (++characters > maxRecordCharacters) throw new Error('CSV record exceeds size limit.');
      if (state === 'quoted') {
        if (character === '"') state = 'after-quote';
        else field += character;
        continue;
      }
      if (state === 'after-quote' && character === '"') { field += '"'; state = 'quoted'; continue; }
      if (character === ',' || character === '\n' || character === '\r') {
        record.push(field); field = ''; state = 'start';
        if (character !== ',') {
          yield record;
          record = []; characters = 0; skipLf = character === '\r';
        }
      } else if (character === '"' && state === 'start') {
        state = 'quoted';
      } else {
        if (state === 'after-quote' || character === '"') throw new Error('Invalid CSV quoting.');
        field += character; state = 'plain';
      }
    }
  }
  if (state === 'quoted') throw new Error('Truncated quoted CSV field.');
  if (record.length || field.length || state !== 'start') { record.push(field); yield record; }
}
