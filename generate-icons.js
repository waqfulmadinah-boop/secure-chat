// generate-icons.js — run: node generate-icons.js
const fs = require('fs');

function createPNG(size) {
  // Simple green circle with M letter as SVG → PNG (using data URL approach)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="#00a884"/>
    <text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-weight="bold" font-size="${size*0.45}" fill="white">M</text>
  </svg>`;
  return svg;
}

fs.writeFileSync('public/icon-192.svg', createPNG(192));
fs.writeFileSync('public/icon-512.svg', createPNG(512));
console.log('SVG icons created. Updating manifest...');
