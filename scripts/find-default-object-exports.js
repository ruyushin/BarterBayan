const fs = require('fs');
const path = require('path');
function walk(dir){
  let res=[];
  for(const f of fs.readdirSync(dir)){
    const fp = path.join(dir,f);
    if(fs.statSync(fp).isDirectory()){
      if(f==='node_modules' || f==='.git') continue;
      res = res.concat(walk(fp));
    } else {
      if(/\.(js|jsx|ts|tsx)$/.test(f)) res.push(fp);
    }
  }
  return res;
}
const files = walk(process.cwd());
for(const file of files){
  try{
    const txt = fs.readFileSync(file,'utf8');
    if(/export\s+default\s*\{/.test(txt)){
      console.log(file);
    }
  }catch(e){}
}
