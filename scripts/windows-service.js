/**
 * windows-service.js – Installiert Anwesenheit-NEO-onprem als Windows-Dienst.
 *
 * Voraussetzung: optionales Paket `node-windows` ist installiert.
 *   npm install node-windows
 *
 * Nutzung:
 *   npm run build
 *   npm run service:install      // Dienst installieren und starten
 *   npm run service:uninstall    // Dienst entfernen
 *
 * Der Dienst startet dist/src/server.js und startet automatisch beim Booten.
 * Alternative ohne Windows-Dienst: PM2 (siehe ecosystem.config.js).
 */
const path = require('path');

let Service;
try {
  Service = require('node-windows').Service;
} catch (e) {
  console.error('Das Paket "node-windows" ist nicht installiert.');
  console.error('Bitte zuerst ausführen:  npm install node-windows');
  console.error('Alternativ PM2 nutzen (siehe ecosystem.config.js).');
  process.exit(1);
}

const svc = new Service({
  name: 'AnwesenheitNEO',
  description: 'Anwesenheit-NEO-onprem – self-hostbares Anwesenheitssystem',
  script: path.join(__dirname, '..', 'dist', 'src', 'server.js'),
  nodeOptions: [],
  workingDirectory: path.join(__dirname, '..'),
  env: [{ name: 'NODE_ENV', value: 'production' }],
});

const action = process.argv[2];

svc.on('install', () => {
  console.log('Dienst installiert. Starte …');
  svc.start();
});
svc.on('alreadyinstalled', () => console.log('Dienst ist bereits installiert.'));
svc.on('start', () => console.log('Dienst "AnwesenheitNEO" läuft.'));
svc.on('uninstall', () => console.log('Dienst deinstalliert.'));

if (action === 'install') {
  svc.install();
} else if (action === 'uninstall') {
  svc.uninstall();
} else {
  console.error('Verwendung: node scripts/windows-service.js <install|uninstall>');
  process.exit(1);
}
