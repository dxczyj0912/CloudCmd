const fs=require('fs');
const s=fs.readFileSync('assets/js/shell.js','utf8');
const i=s.indexOf("'--line-buffered'");
console.log(i);
console.log(JSON.stringify(s.slice(i-260, i+60)));
