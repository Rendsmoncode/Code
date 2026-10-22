// Ajoute un numéro de version aux fichiers CSS/JS dans index.html, pour que les navigateurs
// rechargent tout après chaque mise à jour (au lieu de mélanger ancienne et nouvelle version).
const fs = require('fs');
const v = Date.now().toString(36);
const html = fs.readFileSync('index.html', 'utf8')
  .replace(/(href|src)="(style\.css|cards\.css|app\.js)(\?v=\w+)?"/g, `$1="$2?v=${v}"`);
fs.writeFileSync('index.html', html);
console.log('version', v);
