/**
 * server/networkInfo.js
 * Cari alamat IPv4 lokal laptop ini di jaringan Wi-Fi/LAN yang sama
 * dengan tablet, supaya bisa ditampilkan sebagai QR code / teks di
 * jendela AdrStation ("Scan QR Code" pada panel Adr AirLink di app
 * tablet).
 */

const os = require('os');

function getLanIpAddresses() {
  const interfaces = os.networkInterfaces();
  const results = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        results.push({ interfaceName: name, address: iface.address });
      }
    }
  }
  return results;
}

/** Alamat IP LAN "terbaik" untuk ditampilkan sebagai default (yang pertama ditemukan). */
function getPrimaryLanIp() {
  const list = getLanIpAddresses();
  return list.length ? list[0].address : null;
}

module.exports = { getLanIpAddresses, getPrimaryLanIp };
