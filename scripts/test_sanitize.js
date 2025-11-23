// Test harness for sanitizeFileName logic copied from FileGenerator
function sanitizeFileName(name) {
  let v = name.replace(/\[([^\]]+)\]\((.*?)\)/g, '$1');
  v = v
    .replace(/[<>:\"/\\|?*]/g, '_')
    .replace(/\./g, '_')
    .trim()
    .substring(0, 100);
  v = v.replace(/_+/g, '_');
  if (!v) return 'untitled';
  return v;
}

const tests = [
  {
    in: 'Add sections ([Watch](https://youtu.be/wkgvyEYfkIo?si=ZNkG1ZRIWsIdAiVm))',
    expect: 'Add sections (Watch)'
  },
  { in: '[Link Only](https://example.com)', expect: 'Link Only' },
  { in: 'Read [Obsidian Guide](https://obsidian.md) and take notes', expect: 'Read Obsidian Guide and take notes' },
  { in: 'Special chars <>:\"/\\|?* and dots...', expect: 'Special chars _ and dots_' },
  // We preserve original parentheses; only markdown links are replaced
  { in: 'Title with (parentheses) and [Link](url)', expect: 'Title with (parentheses) and Link' },
  { in: 'Multiple [One](u) and [Two](v) links', expect: 'Multiple One and Two links' }
];

let failed = 0;
console.log('sanitizeFileName test results:');
for (const t of tests) {
  const out = sanitizeFileName(t.in);
  const ok = out === t.expect;
  console.log(`${ok ? '✓' : '✗'}  input: ${t.in}`);
  console.log(`   output:   ${out}`);
  console.log(`   expected: ${t.expect}\n`);
  if (!ok) failed++;
}

if (failed > 0) {
  console.error(`${failed} test(s) failed`);
  process.exit(1);
}

console.log('All sanitizeFileName tests passed');
