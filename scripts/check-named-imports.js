const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      if (file === 'node_modules' || file === '.git' || file === 'dist') return;
      results = results.concat(walk(filePath));
    } else {
      if (/\.(ts|tsx|js|jsx)$/.test(file)) results.push(filePath);
    }
  });
  return results;
}

function tryResolveImport(importPath, importerDir) {
  if (importPath.startsWith('@/')) importPath = './' + importPath.slice(2);
  if (!importPath.startsWith('.')) return null;
  const cand = [];
  const base = path.resolve(importerDir, importPath);
  cand.push(base);
  cand.push(base + '.tsx');
  cand.push(base + '.ts');
  cand.push(base + '.js');
  cand.push(base + '.jsx');
  cand.push(path.join(base, 'index.tsx'));
  cand.push(path.join(base, 'index.ts'));
  cand.push(path.join(base, 'index.js'));
  cand.push(path.join(base, 'index.jsx'));

  for (const c of cand) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

const files = walk(root);
const namedImportRegex = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
let issues = [];

files.forEach((file) => {
  const content = fs.readFileSync(file, 'utf8');
  let m;
  while ((m = namedImportRegex.exec(content))) {
    const importedList = m[1].split(',').map(s => s.trim().split(' as ')[0]);
    const importPath = m[2];
    const resolved = tryResolveImport(importPath, path.dirname(file));
    if (!resolved) continue;
    const target = fs.readFileSync(resolved, 'utf8');
    importedList.forEach((name) => {
      const re = new RegExp('export\\s+(const|function|class|let|type|interface|enum)\\s+' + name + '\\b');
      const re2 = new RegExp('export\\s*\\{[^}]*\\b' + name + '\\b[^}]*\\}');
      const re3 = new RegExp('export\\s+type\\s+' + name + '\\b');
      if (!(re.test(target) || re2.test(target) || re3.test(target))) {
        issues.push({ importer: path.relative(root, file), importPath, resolved: path.relative(root, resolved), name });
      }
    });
  }
});

if (issues.length === 0) {
  console.log('No named-import mismatches found.');
  process.exit(0);
}

console.log('Found named-imports pointing to files WITHOUT that named export:');
issues.forEach((it) => {
  console.log('- importer:', it.importer, 'importPath:', it.importPath, '-> resolved:', it.resolved, 'missing:', it.name);
});
process.exit(1);
