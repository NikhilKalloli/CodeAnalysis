const fs = require('fs');
const path = require('path');

class MetricsAnalyzer {
    constructor(jsonPath) {
        this.data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    }

    analyzeMetrics() {
        // Basic metrics
        const totalFiles = this.data.length;
        const dataSinks = this.data.filter(item => item.is_data_sink === 1);
        const dataSinkCount = dataSinks.length;
        const dataSinkPercentage = ((dataSinkCount / totalFiles) * 100).toFixed(2);

        // Directory patterns analysis
        const directoryPatterns = new Map();
        const fileExtensions = new Map();
        const commonPatterns = new Map();

        this.data.forEach(item => {
            // Extract directory path
            const urlPath = item.file_path.split('twenty-server/')[1];
            const directories = urlPath.split('/');
            const dirPath = directories.slice(0, -1).join('/');
            
            // Count directory occurrences
            directoryPatterns.set(dirPath, (directoryPatterns.get(dirPath) || 0) + 1);

            // Count file extensions
            const ext = path.extname(urlPath);
            fileExtensions.set(ext, (fileExtensions.get(ext) || 0) + 1);

            // Analyze common patterns in data sink files
            if (item.is_data_sink === 1) {
                const fileName = directories[directories.length - 1];
                // Extract common naming patterns
                const patterns = [
                    fileName.includes('.controller.') ? 'controller' : null,
                    fileName.includes('.service.') ? 'service' : null,
                    fileName.includes('.repository.') ? 'repository' : null,
                    fileName.includes('.entity.') ? 'entity' : null,
                    fileName.includes('.mutation.') ? 'mutation' : null,
                    fileName.includes('.resolver.') ? 'resolver' : null
                ].filter(Boolean);

                patterns.forEach(pattern => {
                    commonPatterns.set(pattern, (commonPatterns.get(pattern) || 0) + 1);
                });
            }
        });

        // Sort directories by frequency
        const topDirectories = Array.from(directoryPatterns.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        // Generate regex patterns for data sink files
        const regexPatterns = this.generateRegexPatterns(dataSinks);

        // Print the analysis
        console.log('\n=== Data Sink Analysis ===');
        console.log(`Total Files Analyzed: ${totalFiles}`);
        console.log(`Data Sinks Found: ${dataSinkCount} (${dataSinkPercentage}%)`);

        console.log('\n=== Top 10 Directories ===');
        topDirectories.forEach(([dir, count]) => {
            const sinkCount = this.data.filter(item => 
                item.file_path.includes(dir) && item.is_data_sink === 1
            ).length;
            console.log(`${dir}: ${count} files (${sinkCount} sinks)`);
        });

        console.log('\n=== File Extensions ===');
        fileExtensions.forEach((count, ext) => {
            const sinkCount = this.data.filter(item => 
                item.file_path.endsWith(ext) && item.is_data_sink === 1
            ).length;
            console.log(`${ext}: ${count} files (${sinkCount} sinks)`);
        });

        console.log('\n=== Common Patterns in Data Sinks ===');
        commonPatterns.forEach((count, pattern) => {
            console.log(`${pattern}: ${count} files`);
        });

        console.log('\n=== Regex Patterns for Data Sinks ===');
        regexPatterns.forEach((pattern, category) => {
            console.log(`\n${category}:`);
            console.log(pattern);
        });

        // Save detailed analysis to file
        this.saveAnalysis({
            metrics: {
                totalFiles,
                dataSinkCount,
                dataSinkPercentage
            },
            topDirectories: Object.fromEntries(topDirectories),
            fileExtensions: Object.fromEntries(fileExtensions),
            commonPatterns: Object.fromEntries(commonPatterns),
            regexPatterns: Object.fromEntries(regexPatterns)
        });
    }

    generateRegexPatterns(dataSinks) {
        const patterns = new Map();

        // Pattern for all data sink files
        const allPaths = dataSinks.map(item => 
            item.file_path.split('twenty-server/')[1]
        );

        // Generate patterns by category
        patterns.set('All Data Sink Files', 
            '(' + allPaths.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')');

        // Pattern for common file types
        patterns.set('Common File Types',
            '\\.(controller|service|repository|entity|mutation|resolver)\\.(ts|js)$');

        // Pattern for common directories
        const commonDirs = ['src/database', 'src/modules', 'src/engine'];
        patterns.set('Common Directories',
            `(${commonDirs.join('|')})/.*\\.(ts|js)$`);

        return patterns;
    }

    saveAnalysis(analysis) {
        const outputPath = 'data-sink-analysis.json';
        fs.writeFileSync(outputPath, JSON.stringify(analysis, null, 2));
        console.log(`\nDetailed analysis saved to: ${outputPath}`);
    }
}

// Run the analysis
const analyzer = new MetricsAnalyzer('ast_data_sinks.json');
analyzer.analyzeMetrics(); 