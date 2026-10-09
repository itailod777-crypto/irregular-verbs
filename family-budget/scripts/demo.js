'use strict';
// מפעיל את האפליקציה עם נתוני דוגמה בלבד: npm run demo
const path = require('path');
process.env.BUDGET_DATA_DIR = path.join(__dirname, '..', 'data-demo');
require('./seed-demo');
require('../server');
