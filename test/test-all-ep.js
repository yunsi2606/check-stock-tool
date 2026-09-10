async function testAllEndpoints() {
    console.log("=== Testing Endpoints with Origin http://localhost:3001 ===");
    
    const endpoints = [
        "/api/health",
        "/api/books",
        "/api/categories",
        "/api/public/config",
        "/api/auth/register"
    ];

    for (const ep of endpoints) {
        try {
            const res = await fetch(`http://localhost:8080${ep}`, {
                headers: {
                    'Origin': 'http://localhost:3001',
                    'Accept': 'application/json'
                }
            });
            const text = await res.text();
            console.log(`[${res.status}] ${ep} -> ${text.substring(0, 150)}`);
        } catch (e) {
            console.log(`Failed ${ep}:`, e.message);
        }
    }
}

testAllEndpoints();
