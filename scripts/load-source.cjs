const fs = require('node:fs');
module.exports = () => fs.readFileSync('src/app.js','utf8').replace('/* FEATURE_MODULE */', fs.readFileSync('src/features.js','utf8') + '\n' + fs.readFileSync('src/career.js','utf8'));
