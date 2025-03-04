const fs = require('fs');
const path = require('path');
const parser = require('@typescript-eslint/typescript-estree');

class CodebaseAnalyzer {
    constructor(baseDir) {
        this.baseDir = baseDir;
        this.results = {
            dataSinks: [],
            dataSources: [],
            authFlows: [],
            dataModels: []
        };
    }

    async analyzeFile(filePath) {
        const content = fs.readFileSync(filePath, 'utf8');
        const ast = parser.parse(content, {
            jsx: true,
            loc: true
        });

        // Analyze data sinks (write operations, network calls)
        this.findDataSinks(ast, filePath);
        
        // Analyze data sources (read operations, API imports)
        this.findDataSources(ast, filePath);
        
        // Analyze authentication flows
        this.findAuthFlows(ast, filePath);
        
        // Analyze data models
        this.findDataModels(ast, filePath);
    }

    findDataSinks(ast, filePath) {
        // Pattern matching for write operations and network calls
        const sinkPatterns = [
            'write', 'post', 'put', 'create', 'update', 'delete',
            'save', 'insert', 'updateOne', 'deleteOne'
        ];

        this.traverseTree(ast, (node) => {
            if (node.type === 'CallExpression' && 
                node.callee.type === 'MemberExpression' &&
                node.callee.property.type === 'Identifier') {
                const methodName = node.callee.property.name;
                if (sinkPatterns.some(p => methodName.toLowerCase().includes(p))) {
                    this.results.dataSinks.push({
                        type: 'write_operation',
                        name: methodName,
                        file: filePath,
                        line: node.loc.start.line
                    });
                }
            }
        });
    }

    findDataSources(ast, filePath) {
        // Pattern matching for read operations and imports
        const sourcePatterns = ['get', 'find', 'findOne', 'fetch', 'read'];

        this.traverseTree(ast, (node) => {
            if (node.type === 'ImportDeclaration') {
                this.results.dataSources.push({
                    type: 'import',
                    name: node.source.value,
                    file: filePath,
                    line: node.loc.start.line
                });
            } else if (node.type === 'CallExpression' && 
                      node.callee.type === 'MemberExpression' &&
                      node.callee.property.type === 'Identifier') {
                const methodName = node.callee.property.name;
                if (sourcePatterns.some(p => methodName.toLowerCase().includes(p))) {
                    this.results.dataSources.push({
                        type: 'read_operation',
                        name: methodName,
                        file: filePath,
                        line: node.loc.start.line
                    });
                }
            }
        });
    }

    findAuthFlows(ast, filePath) {
        // Pattern matching for authentication-related code
        const authPatterns = [
            'jwt', 'oauth', 'authenticate', 'login', 'logout',
            'session', 'passport', 'token', 'auth'
        ];

        this.traverseTree(ast, (node) => {
            if (node.type === 'Identifier' && 
                authPatterns.some(p => node.name.toLowerCase().includes(p))) {
                this.results.authFlows.push({
                    type: 'auth_mechanism',
                    name: node.name,
                    file: filePath,
                    line: node.loc.start.line
                });
            }
        });
    }

    findDataModels(ast, filePath) {
        this.traverseTree(ast, (node) => {
            if (['ClassDeclaration', 'InterfaceDeclaration', 'TypeAlias'].includes(node.type)) {
                this.results.dataModels.push({
                    type: node.type.replace('Declaration', '').toLowerCase(),
                    name: node.id.name,
                    file: filePath,
                    line: node.loc.start.line
                });
            }
        });
    }

    traverseTree(node, callback) {
        if (!node || typeof node !== 'object') return;
        
        callback(node);
        
        for (const key in node) {
            if (Array.isArray(node[key])) {
                node[key].forEach(child => this.traverseTree(child, callback));
            } else if (node[key] && typeof node[key] === 'object') {
                this.traverseTree(node[key], callback);
            }
        }
    }

    async generateCSVReport(outputPath) {
        const headers = ['Category', 'Type', 'Name', 'File', 'Line'];
        const rows = [headers];

        // Add data sinks
        this.results.dataSinks.forEach(sink => {
            rows.push(['DataSink', sink.type, sink.name, sink.file, sink.line]);
        });

        // Add data sources
        this.results.dataSources.forEach(source => {
            rows.push(['DataSource', source.type, source.name, source.file, source.line]);
        });

        // Add auth flows
        this.results.authFlows.forEach(auth => {
            rows.push(['AuthFlow', auth.type, auth.name, auth.file, auth.line]);
        });

        // Add data models
        this.results.dataModels.forEach(model => {
            rows.push(['DataModel', model.type, model.name, model.file, model.line]);
        });

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
                console.log(`Analyzing: ${fullPath}`);
                await this.analyzeFile(fullPath);
            }
        }
    }
}

// CLI interface
const main = async () => {
    if (process.argv.length < 3) {
        console.error('Usage: node codebase-analyzer.js <codebase-path> [output-csv-path]');
        process.exit(1);
    }

    const codebasePath = path.resolve(process.argv[2]);
    const outputPath = process.argv[3] || path.join(process.cwd(), 'codebase-analysis.csv');

    try {
        console.log(`Analyzing codebase: ${codebasePath}`);
        const analyzer = new CodebaseAnalyzer(codebasePath);
        await analyzer.analyzeDirectory();
        await analyzer.generateCSVReport(outputPath);
        console.log(`Analysis complete! Results saved to: ${outputPath}`);
    } catch (error) {
        console.error('Error during analysis:', error);
        process.exit(1);
    }
};

main();
