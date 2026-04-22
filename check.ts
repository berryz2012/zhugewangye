import fs from 'fs';

try {
    const raw = fs.readFileSync('uploads/config_ai-short-drama-storage.json', 'utf-8');
    console.log(raw.slice(0, 100)); // only log head
} catch (e) {
    console.log('No file');
}
