// Simple dry-run simulator for filename sanitization
const tasks = [
  { id: '1', content: 'Read [Obsidian Guide](https://obsidian.md) and take notes' },
  { id: '2', content: 'Fix bug in [sync engine](https://repo/issues/123) ASAP' },
  { id: '3', content: 'Plain title without link' },
  { id: '4', content: '[Link Only](https://example.com)' },
  { id: '5', content: 'Special chars <>:"/\\|?* and dots...' }
];

function sanitizeFileName(name) {
  // Convert markdown links like [display text](url) -> display text
  let v = name.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');

  v = v
    .replace(/[<>:\"/\\|?*]/g, '_')
    .replace(/\./g, '_')
    .trim()
    .substring(0, 100);

  v = v.replace(/_+/g, '_');
  if (!v) return 'untitled';
  return v;
}

console.log('Simulated dry-run creation:');
for (const t of tasks) {
  const fileName = sanitizeFileName(t.content || `Task ${t.id}`);
  const filePath = `SyncFolder/${fileName}.md`;
  console.log(`Dry-run: would create file at ${filePath}`);
  console.log(`  frontmatter.title: "${t.content}"`);
  console.log(`  file name derived: "${fileName}"\n`);
}

console.log('Done. Frontmatter titles remain unchanged; filenames sanitized.');
