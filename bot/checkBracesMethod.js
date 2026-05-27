const fs = require('fs');
const content = fs.readFileSync('src/services/whatsapp.ts', 'utf8');
const lines = content.split('\n').slice(138, 874); // 139 to 874
let braces = 0;
for(let i=0; i<lines.length; i++) {
    for(let j=0; j<lines[i].length; j++) {
        if(lines[i][j] === '{') braces++;
        else if(lines[i][j] === '}') braces--;
    }
}
console.log('Brace count difference in connectToWhatsApp:', braces);
