const testGet = async () => {
    const res = await fetch('http://localhost:3000/api/config?name=ai-short-drama-storage');
    const data = await res.json();
    console.log(data);
};
testGet();
