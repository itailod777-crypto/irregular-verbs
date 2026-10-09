'use strict';
// קלט מהטרמינל, כולל קלט מוסתר לסיסמאות (לא מודפס למסך ולא ללוגים).
const readline = require('readline');

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const origWrite = rl._writeToOutput;
    process.stdout.write(question);
    rl._writeToOutput = function (s) { if (s.includes('\n') || s.includes('\r')) origWrite.call(rl, s); };
    rl.question('', (a) => { rl._writeToOutput = origWrite; rl.close(); process.stdout.write('\n'); resolve(a); });
  });
}

module.exports = { ask, askHidden };
