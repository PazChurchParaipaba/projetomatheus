const fs = require('fs');
const content = fs.readFileSync('src/services/whatsapp.ts', 'utf8');
let braces = 0;
let lines = content.split('\n');
let unclosedLines = [];
for(let i=0; i<lines.length; i++) {
    for(let j=0; j<lines[i].length; j++) {
        if(lines[i][j] === '{') { braces++; unclosedLines.push(i+1); }
        else if(lines[i][j] === '}') { braces--; unclosedLines.pop(); }
    }
}
console.log('Brace count difference:', braces);
console.log('Unclosed braces on lines:', unclosedLines);
