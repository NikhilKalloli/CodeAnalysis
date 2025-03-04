const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const walk = require('acorn-walk');
const jsx = require('acorn-jsx');

class AcornAnalyzer {
    constructor(baseDir) {
        this.baseDir = baseDir;
        this.parser = acorn.Parser.extend(jsx());
        
        this.results = {
            dataSinks: [],
            dataSources: [],
            authFlows: [],
            dataModels: []
        };

        // Pattern definitions
        this.patterns = {
            sinks: ['write', 'save', 'create', 'update', 'delete', 'post', 'put'],
            sources: ['get', 'find', 'fetch', 'read'],
            auth: ['jwt', 'oauth', 'auth', 'session', 'passport', 'token', 'login', 'logout']
        };
    }

    async analyzeFile(filePath) {
        console.log(`Analyzing: ${filePath}`);
        const content = fs.readFileSync(filePath, 'utf8');
        
        try {
            const ast = this.parser.parse(content, {
                sourceType: 'module',
                ecmaVersion: 'latest',
                locations: true
            });

            // Analyze the AST
            this.findDataFlows(ast, content, filePath);
            this.findAuthFlows(ast, content, filePath);
            this.findDataModels(ast, content, filePath);

        } catch (error) {
            console.warn(`Warning: Could not parse ${filePath}: ${error.message}`);
        }
    }

    findDataFlows(ast, content, filePath) {
        walk.simple(ast, {
            CallExpression: (node) => {
                if (node.callee.type === 'MemberExpression' && node.callee.property.type === 'Identifier') {
                    const methodName = node.callee.property.name;
                    
                    // Check for data sinks
                    if (this.patterns.sinks.some(p => methodName.toLowerCase().includes(p))) {
                        this.results.dataSinks.push({
                            type: 'write_operation',
                            name: methodName,
                            file: filePath,
                            line: node.loc.start.line,
                            column: node.loc.start.column,
                            context: this.getNodeContext(content, node.loc)
                        });
                    }
                    
                    // Check for data sources
                    if (this.patterns.sources.some(p => methodName.toLowerCase().includes(p))) {
                        this.results.dataSources.push({
                            type: 'read_operation',
                            name: methodName,
                            file: filePath,
                            line: node.loc.start.line,
                            column: node.loc.start.column,
                            context: this.getNodeContext(content, node.loc)
                        });
                    }
                }
            },
            ImportDeclaration: (node) => {
                this.results.dataSources.push({
                    type: 'import',
                    name: node.source.value,
                    file: filePath,
                    line: node.loc.start.line,
                    column: node.loc.start.column,
                    context: this.getNodeContext(content, node.loc)
                });
            }
        });
    }

    findAuthFlows(ast, content, filePath) {
        walk.simple(ast, {
            Identifier: (node) => {
                if (this.patterns.auth.some(p => node.name.toLowerCase().includes(p))) {
                    this.results.authFlows.push({
                        type: 'auth_mechanism',
                        name: node.name,
                        file: filePath,
                        line: node.loc.start.line,
                        column: node.loc.start.column,
                        context: this.getNodeContext(content, node.loc)
                    });
                }
            }
        });
    }

    findDataModels(ast, content, filePath) {
        walk.simple(ast, {
            ClassDeclaration: (node) => {
                this.results.dataModels.push({
                    type: 'class',
                    name: node.id.name,
                    file: filePath,
                    line: node.loc.start.line,
                    column: node.loc.start.column,
                    context: this.getNodeContext(content, node.loc)
                });
            },
            TSInterfaceDeclaration: (node) => {
                this.results.dataModels.push({
                    type: 'interface',
                    name: node.id.name,
                    file: filePath,
                    line: node.loc.start.line,
                    column: node.loc.start.column,
                    context: this.getNodeContext(content, node.loc)
                });
            }
        });
    }

    getNodeContext(content, loc) {
        const lines = content.split('\n');
        const startLine = Math.max(0, loc.start.line - 2);
        const endLine = Math.min(lines.length, loc.end.line + 1);
        return lines.slice(startLine, endLine).join('\n');
    }

    escapeCSV(field) {
        if (field === null || field === undefined) {
            return '';
        }
        const stringField = String(field);
        // If the field contains quotes, commas, or newlines, wrap it in quotes and escape internal quotes
        if (stringField.includes('"') || stringField.includes(',') || stringField.includes('\n') || stringField.includes('\r')) {
            return `"${stringField.replace(/"/g, '""')}"`;
        }
        return stringField;
    }

    async generateCSVReport(outputPath) {
        const headers = ['Category', 'Type', 'Name', 'File', 'Line', 'Column', 'Context'];
        const rows = [headers.map(h => this.escapeCSV(h))];

        for (const [category, items] of Object.entries(this.results)) {
            for (const item of items) {
                const row = [
                    category,
                    item.type,
                    item.name,
                    item.file,
                    item.line,
                    item.column,
                    // Clean up context: remove extra whitespace and normalize line endings
                    item.context.replace(/\r\n/g, '\n').trim()
                ].map(field => this.escapeCSV(field));
                
                rows.push(row);
            }
        }

        const csvContent = rows.map(row => row.join(',')).join('\n');
        fs.writeFileSync(outputPath, csvContent, 'utf8');
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
        console.error('Usage: node acorn-analyzer.js <codebase-path> [output-csv-path]');
        process.exit(1);
    }

    const codebasePath = path.resolve(process.argv[2]);
    const outputPath = process.argv[3] || path.join(process.cwd(), 'codebase-analysis.csv');

    try {
        console.log(`Analyzing codebase: ${codebasePath}`);
        const analyzer = new AcornAnalyzer(codebasePath);
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
