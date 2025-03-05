const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3001;

// Serve static files
app.use(express.static(__dirname));

// Serve JSON data
app.get('/data.json', (req, res) => {
    const jsonPath = path.join(__dirname, '..', 'output.json');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    res.json(jsonData);
});

app.listen(port, () => {
    console.log(`JSON Visualizer running at http://localhost:${port}`);
});
