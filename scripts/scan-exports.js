const fs = require('fs');
const path = require('path');

function walk(dir){
  const files = fs.readdirSync(dir);
  let res = [];
  for(const f of files){
    const fp = path.join(dir,f);
    const stat = fs.statSync(fp);
    if(stat.isDirectory()){
      if(f==='node_modules' || f==='dist' || f==='.git') continue;
      res = res.concat(walk(fp));
    } else {
      if(/\.(js|jsx|ts|tsx)$/.test(f)) res.push(fp);
    }
  }
  return res;
}

const root = path.resolve(__dirname,'..');
const appDir = path.join(root,'app');
const files = walk(appDir);
const issues = [];

for(const file of files){
  const txt = fs.readFileSync(file,'utf8');
  const lines = txt.split(/\r?\n/);
  for(let i=0;i<lines.length;i++){
    const l = lines[i].trim();
    if(l.startsWith('export default')){
      const after = l.slice('export default'.length).trim();
      const context = lines.slice(Math.max(0,i-2),i+3).join('\n');
      issues.push({file: path.relative(root,file), line:i+1, after, context});
    }
  }
}

if(issues.length===0){
  console.log('No export default found in app files.');
  process.exit(0);
}
console.log('Found export default occurrences:');
for(const it of issues){
  console.log(`- ${it.file} (line ${it.line}): after='${it.after}'`);
}
process.exit(0);
