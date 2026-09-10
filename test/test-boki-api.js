async function testBackend() {
    console.log("=== Testing Spring Boot Backend API Endpoints ===");
    
    const endpoints = [
        "http://localhost:8080/api/health",
        "http://localhost:8080/api/books",
        "http://localhost:8080/api/categories",
        "http://localhost:8080/api/public/config"
    ];

    for (const url of endpoints) {
        try {
            const start = Date.now();
            const res = await fetch(url, {
                headers: {
                    'Origin': 'http://localhost:3000',
                    'Accept': 'application/json'
                }
            });
            const text = await res.text();
            console.log(`[${res.status}] ${url} (${Date.now() - start}ms)`);
            console.log("  CORS Header:", res.headers.get('access-control-allow-origin'));
            console.log("  Snippet:", text.substring(0, 150));
        } catch (e) {
            console.log(`Failed ${url}:`, e.message);
        }
    }
}

testBackend();
