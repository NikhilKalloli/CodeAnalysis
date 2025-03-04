const fs = require('fs');
const path = require('path');
const Parser = require('tree-sitter');
const JavaScript = require('tree-sitter-javascript');

class TreeSitterAnalyzer {
    constructor(baseDir) {
        this.baseDir = baseDir;
        this.parser = new Parser();
        this.parser.setLanguage(JavaScript);
        
        // Define Tree-sitter queries for different analysis types
        this.queries = {
            dataSinks: `
                (call_expression
                    function: (member_expression
                        property: (property_identifier) @method)
                    (#match? @method "^(write|save|create|update|delete|post|put)"))
            `,
            dataSources: `
                (import_declaration
                    source: (string) @source)
                (call_expression
                    function: (member_expression
                        property: (property_identifier) @method)
                    (#match? @method "^(get|find|fetch|read)"))
            `,
            authFlows: `
                (identifier) @auth
                (#match? @auth "(jwt|oauth|auth|session|passport|token|login|logout)")
                
                (call_expression
                    function: (member_expression
                        property: (property_identifier) @method)
                    (#match? @method "authenticate|isAuthenticated"))
            `,
            dataModels: `
                (class_declaration
                    name: (identifier) @name) @class
                
                (interface_declaration
                    name: (identifier) @name) @interface
                    
                (type_alias_declaration
                    name: (identifier) @name) @type
            `
        };

        this.results = {
            dataSinks: [],
            dataSources: [],
            authFlows: [],
            dataModels: []
        };
    }

    async analyzeFile(filePath) {
        console.log(`Analyzing: ${filePath}`);
        const content = fs.readFileSync(filePath, 'utf8');
        const tree = this.parser.parse(content);

        // Analyze each aspect using Tree-sitter queries
        for (const [category, queryString] of Object.entries(this.queries)) {
            const query = this.parser.language.query(queryString);
            const matches = query.matches(tree.rootNode);
            
            for (const match of matches) {
                const node = match.captures[0].node;
                const result = {
                    type: match.pattern,
                    name: node.text,
                    file: filePath,
                    line: node.startPosition.row + 1,
                    column: node.startPosition.column + 1,
                    context: this.getNodeContext(node, content)
                };

                this.results[category].push(result);
            }
        }
    }

    getNodeContext(node, content) {
        const lines = content.split('\n');
        const startLine = Math.max(0, node.startPosition.row - 1);
        const endLine = Math.min(lines.length, node.endPosition.row + 2);
        return lines.slice(startLine, endLine).join('\n');
    }

    async generateCSVReport(outputPath) {
        const headers = ['Category', 'Type', 'Name', 'File', 'Line', 'Column', 'Context'];
        const rows = [headers];

        for (const [category, items] of Object.entries(this.results)) {
            for (const item of items) {
                rows.push([
                    category,
                    item.type,
                    item.name,
                    item.file,
                    item.line,
                    item.column,
                    item.context.replace(/,/g, ';').replace(/\n/g, ' ')
                ]);
            }
        }

        const csvContent = rows.map(row => row.join(',')).join('\n');
        fs.writeFileSync(outputPath, csvContent);
    }

    async analyzeDirectory(dir = this.baseDir) {
        const files = fs.readdirSync(dir);
        
        for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory() && !file.startsWith('.')) {
                await this.analyzeDirectory(fullPath);
            } else if (stat.isFile() && /\.(js|ts|jsx|tsx)$/.test(file)) {
                await this.analyzeFile(fullPath);
            }
        }
    }

    printSummary() {
        console.log('\nAnalysis Summary:');
        console.log('----------------');
        for (const [category, items] of Object.entries(this.results)) {
            console.log(`${category}: ${items.length} findings`);
        }
    }
}

// CLI interface
const main = async () => {
    if (process.argv.length < 3) {
        console.error('Usage: node tree-sitter-analyzer.js <codebase-path> [output-csv-path]');
        process.exit(1);
    }

    const codebasePath = path.resolve(process.argv[2]);
    const outputPath = process.argv[3] || path.join(process.cwd(), 'codebase-analysis.csv');

    try {
        console.log(`Analyzing codebase: ${codebasePath}`);
        const analyzer = new TreeSitterAnalyzer(codebasePath);
        await analyzer.analyzeDirectory();
        await analyzer.generateCSVReport(outputPath);
        analyzer.printSummary();
        console.log(`\nAnalysis complete! Results saved to: ${outputPath}`);
    } catch (error) {
        console.error('Error during analysis:', error);
        process.exit(1);
    }
};

main();
