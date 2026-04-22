import http from 'http';

http.get('http://localhost:3000/api/config?name=ai-short-drama-storage', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log('GET result:', data));
});
