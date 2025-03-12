const express = require('express');
const csv = require('./node_modules/csv-parse/dist/cjs/index.d.cts');
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
            skip_empty_lines: true,
            relax_quotes: true,
            relax_column_count: true,
            trim: true,
            skip_records_with_error: true
        }))
        .on('data', (data) => {
            // Ensure all expected fields are present
            const record = {
                Category: data.Category || '',
                Type: data.Type || '',
                Name: data.Name || '',
                File: data.File || '',
                Line: data.Line || '',
                Context: data.Context || ''
            };
            results.push(record);
        })
        .on('error', (error) => {
            console.warn('Warning: Error parsing record:', error.message);
        })
        .on('end', () => {
            res.json(results);
        });
});

app.listen(port, () => {
    console.log(`Visualizer running at http://localhost:${port}`);
});
