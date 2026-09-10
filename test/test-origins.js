async function testOrigins() {
    console.log("=== Testing Origins ===");
    
    for (const origin of ['http://localhost:3000', 'http://localhost:3001']) {
        try {
            const res = await fetch("http://localhost:8080/api/books", {
                headers: {
                    'Origin': origin,
                    'Accept': 'application/json'
                }
            });
            const text = await res.text();
            console.log(`Origin '${origin}' -> Status: [${res.status}], Snippet: ${text.substring(0, 100)}`);
        } catch (e) {
            console.log(`Failed for '${origin}':`, e.message);
        }
    }
}

testOrigins();
