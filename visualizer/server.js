const express = require('express');
const csv = require('csv-parse');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

// Serve static files from the current directory
app.use(express.static(__dirname));

// Convert CSV to JSON and serve it
app.get('/data.json', (req, res) => {
    const results = [];
    fs.createReadStream(path.join(__dirname, '..', 'codebase-analysis.csv'))
        .pipe(csv.parse({
            columns: true,
            skip_empty_lines: true
        }))
        .on('data', (data) => results.push(data))
        .on('end', () => {
            res.json(results);
        });
});

app.listen(port, () => {
    console.log(`Visualizer running at http://localhost:${port}`);
});
