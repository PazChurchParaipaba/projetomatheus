const fs = require('fs');
const content = fs.readFileSync('src/services/whatsapp.ts', 'utf8');
const lines = content.split('\n').slice(815, 873); // lines 816 to 873
let braces = 0;
for(let i=0; i<lines.length; i++) {
    for(let j=0; j<lines[i].length; j++) {
        if(lines[i][j] === '{') braces++;
        else if(lines[i][j] === '}') braces--;
    }
}
console.log('Brace count difference in 816-873:', braces);
