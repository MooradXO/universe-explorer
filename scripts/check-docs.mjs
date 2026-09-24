import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0'))]
  .filter(file => file.endsWith('.md') && existsSync(file));
const errors = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  if (/[А-Яа-яЁё]/u.test(text)) errors.push(`${file}: documentation must be in English`);
  const prose = text.replace(/```[\s\S]*?```/g, '');
  for (const match of prose.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1];
    if (/^(?:[a-z]+:|#|\/)/i.test(target)) continue;
    const path = decodeURIComponent(target.split('#')[0]);
    if (path && !existsSync(resolve(dirname(file), path))) errors.push(`${file}: missing link ${target}`);
  }
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`Documentation: ${files.length} English Markdown files; local links PASS.`);
