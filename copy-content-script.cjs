const fs = require('fs');
const path = require('path');

const src = path.resolve(__dirname, 'dist/content/index.iife.js');
const destDir = path.resolve(__dirname, 'chrome-extension/content');
const dest = path.join(destDir, 'index.iife.js');

if (!fs.existsSync(src)) {
  console.error('源文件不存在:', src);
  process.exit(1);
}
if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log('Copied content script to chrome-extension/content/index.iife.js'); 