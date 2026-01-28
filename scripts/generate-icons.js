/**
 * Generate simple placeholder PWA icons.
 * Run: node scripts/generate-icons.js
 *
 * Note: For production, replace these with proper designed icons.
 */

const fs = require('fs');
const path = require('path');

// Simple 1x1 pixel gold PNG (placeholder)
// For a real app, use proper icon design tools
const createPlaceholderIcon = (size) => {
    // Create a simple SVG that can be used as a data URI
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <rect width="${size}" height="${size}" fill="#0f172a"/>
        <circle cx="${size/2}" cy="${size/2}" r="${size*0.35}" fill="#d4af37"/>
        <text x="${size/2}" y="${size/2 + size*0.12}" font-family="Arial, sans-serif" font-size="${size*0.35}" font-weight="bold" fill="#0f172a" text-anchor="middle">LN</text>
    </svg>`;
    return svg;
};

const iconsDir = path.join(__dirname, '..', 'icons');

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
}

// Generate SVG icons (browser can use these, or convert to PNG)
[192, 512].forEach(size => {
    const svg = createPlaceholderIcon(size);
    const filename = `icon-${size}.svg`;
    fs.writeFileSync(path.join(iconsDir, filename), svg);
    console.log(`Created ${filename}`);
});

console.log('\\nNote: For production, convert SVG to PNG or create proper icons.');
console.log('You can use tools like:');
console.log('- https://realfavicongenerator.net/');
console.log('- Figma or similar design tools');
