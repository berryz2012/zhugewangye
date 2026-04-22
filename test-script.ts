const testFile = async () => {
    console.log('fetching');
    await fetch('http://localhost:3000/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'ai-short-drama-storage', value: '{"state":{"apiKeys":{"globalApiKey":"hello"}}}' })
    });
    console.log('done');
};
testFile();
