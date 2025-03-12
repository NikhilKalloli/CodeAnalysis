const fs = require('fs');
const path = require('path');

class ResultTransformer {
    constructor() {
        this.baseGithubUrl = 'https://github.com/twentyhq/twenty/tree/main/packages/twenty-server';
    }

    transformResults() {
        try {
            // Read the analysis results
            const analysisFile = fs.readFileSync('data-sinks-analysis-ast.json', 'utf8');
            const analysis = JSON.parse(analysisFile);

            // Create a map to track unique file paths and their data sink status
            const uniqueFiles = new Map();

            // Process predictions and handle duplicates
            analysis.Predictions.forEach(prediction => {
                // Clean up the file path
                let filePath = prediction.Full_file_path;
                filePath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
                filePath = filePath.replace('@types', '%40types');
                const githubUrl = `${this.baseGithubUrl}/${filePath}`;

                // Check if we've seen this file before
                if (uniqueFiles.has(githubUrl)) {
                    const existingEntry = uniqueFiles.get(githubUrl);
                    // Only update if current entry is false and new entry is true
                    if (!existingEntry.is_data_sink && prediction.Is_data_sink === 1) {
                        uniqueFiles.set(githubUrl, {
                            file_path: githubUrl,
                            is_data_sink: prediction.Is_data_sink,
                            original_score: prediction.Prediction_score
                        });
                    }
                } else {
                    // First time seeing this file
                    uniqueFiles.set(githubUrl, {
                        file_path: githubUrl,
                        is_data_sink: prediction.Is_data_sink,
                        original_score: prediction.Prediction_score
                    });
                }
            });

            // Convert map to array and remove the original_score field
            const transformedData = Array.from(uniqueFiles.values()).map(({ file_path, is_data_sink }) => ({
                file_path,
                is_data_sink
            }));

            // Sort data by file path for consistency
            transformedData.sort((a, b) => a.file_path.localeCompare(b.file_path));

            // Write transformed data
            const outputPath = 'ast_data_sinks.json';
            fs.writeFileSync(outputPath, JSON.stringify(transformedData, null, 2));

            // Generate CSV format
            const csvContent = this.generateCSV(transformedData);
            fs.writeFileSync('ast_data-sinks.csv', csvContent);

            // Print summary
            console.log(`\nTransformation complete!`);
            console.log(`Original entries: ${analysis.Predictions.length}`);
            console.log(`Unique files after deduplication: ${transformedData.length}`);
            console.log(`Data sinks found: ${transformedData.filter(d => d.is_data_sink === 1).length}`);
            
            // Print deduplication stats
            const duplicatesRemoved = analysis.Predictions.length - transformedData.length;
            console.log(`\nDeduplication Stats:`);
            console.log(`- Duplicates removed: ${duplicatesRemoved}`);
            console.log(`- Entries prioritized with data_sink=true: ${transformedData.filter(d => d.is_data_sink === 1).length}`);

            console.log(`\nResults saved to:`);
            console.log(`- JSON: ${outputPath}`);
            console.log(`- CSV: ast_data-sinks.csv`);

            // Validate URLs
            this.validateUrls(transformedData);

            // Log some example duplicates that were handled (for verification)
            this.logDuplicateExamples(analysis.Predictions);

        } catch (error) {
            console.error('Error transforming results:', error);
            process.exit(1);
        }
    }

    logDuplicateExamples(originalPredictions) {
        // Create a map to find duplicates
        const duplicateMap = new Map();
        originalPredictions.forEach(pred => {
            let filePath = pred.Full_file_path;
            filePath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
            filePath = filePath.replace('@types', '%40types');
            const githubUrl = `${this.baseGithubUrl}/${filePath}`;

            if (!duplicateMap.has(githubUrl)) {
                duplicateMap.set(githubUrl, []);
            }
            duplicateMap.get(githubUrl).push({
                is_data_sink: pred.Is_data_sink,
                score: pred.Prediction_score
            });
        });

        // Find and log some examples of handled duplicates
        console.log('\nExample duplicate handling:');
        let examplesLogged = 0;
        duplicateMap.forEach((entries, filePath) => {
            if (entries.length > 1 && examplesLogged < 3) {
                console.log(`\nFile: ${filePath}`);
                console.log('Entries:');
                entries.forEach((entry, idx) => {
                    console.log(`  ${idx + 1}. is_data_sink: ${entry.is_data_sink}, score: ${entry.score}`);
                });
                examplesLogged++;
            }
        });
    }

    generateCSV(data) {
        let csv = 'file_path,is_data_sink\n';
        data.forEach(row => {
            csv += `"${row.file_path}",${row.is_data_sink}\n`;
        });
        return csv;
    }

    validateUrls(data) {
        console.log('\nValidating URLs...');
        
        const issues = data.filter(entry => {
            const hasSpaces = entry.file_path.includes(' ');
            const hasInvalidChars = /[<>:"|?*]/.test(entry.file_path);
            const isWellFormed = entry.file_path.startsWith(this.baseGithubUrl);
            
            return hasSpaces || hasInvalidChars || !isWellFormed;
        });

        if (issues.length > 0) {
            console.log('\nWarning: Found potentially problematic URLs:');
            issues.forEach(entry => {
                console.log(`- ${entry.file_path}`);
            });
        } else {
            console.log('All URLs appear to be well-formed.');
        }
    }
}

// Run the transformation
const transformer = new ResultTransformer();
transformer.transformResults(); 