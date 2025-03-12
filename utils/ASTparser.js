const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const walk = require('acorn-walk');
const jsx = require('acorn-jsx');
const ts = require('typescript');

class ASTParser {
    constructor(baseDir) {
        this.baseDir = baseDir;
        this.parser = acorn.Parser.extend(jsx());
        
        // Results array to store all findings
        this.results = [];

        // Patterns that indicate data sinks (where data is written or stored)
        this.dataSinkPatterns = {
            // Database operations
            database: [
                'save', 'create', 'update', 'delete', 'insert', 'upsert',
                'write', 'set', 'put', 'add', 'push', 'store',
                'persist', 'createQueryBuilder', 'execute'
            ],
            // File operations
            file: [
                'writeFile', 'appendFile', 'createWriteStream', 'writeFileSync',
                'appendFileSync'
            ],
            // API/Network operations
            api: [
                'post', 'put', 'patch', 'delete'
            ],
            // Cache operations
            cache: [
                'set', 'cache', 'store'
            ]
        };

        // Threshold for determining if a match is a data sink
        this.threshold = 0.6;
    }

    // Calculate prediction score based on various factors
    calculatePredictionScore(node, methodName, filePath, content) {
        let score = 0;
        const allPatterns = [
            ...this.dataSinkPatterns.database,
            ...this.dataSinkPatterns.file,
            ...this.dataSinkPatterns.api,
            ...this.dataSinkPatterns.cache
        ];

        // Base score from pattern matching
        const exactMatch = allPatterns.some(pattern => methodName === pattern);
        const partialMatch = allPatterns.some(pattern => methodName.includes(pattern));
        
        if (exactMatch) score += 0.5;
        if (partialMatch) score += 0.3;

        // Context-based scoring
        const nodeContext = this.getNodeContext(content, node.loc);
        
        // Check for database context
        if (/\b(database|db|repository|entity|model|typeorm|sequelize|mongoose)\b/i.test(nodeContext)) {
            score += 0.2;
        }

        // Check for mutation context
        if (/\b(update|create|insert|save|modify|change|set|add)\b/i.test(nodeContext)) {
            score += 0.15;
        }

        // Check for file system context
        if (/\b(file|fs|stream|write|path)\b/i.test(nodeContext)) {
            score += 0.15;
        }

        // Check for API context
        if (/\b(api|http|request|response|endpoint|rest|graphql|mutation)\b/i.test(nodeContext)) {
            score += 0.15;
        }

        // Check for common data sink variable names
        if (/\b(result|output|response|data|payload)\b/i.test(nodeContext)) {
            score += 0.1;
        }

        // Penalize for read-only context indicators
        if (/\b(get|find|read|select|query|fetch)\b/i.test(methodName)) {
            score -= 0.3;
        }

        // Normalize score between 0 and 1
        return Math.max(0, Math.min(1, score));
    }

    getNodeContext(content, loc) {
        if (!loc) return '';
        
        const lines = content.split('\n');
        const startLine = Math.max(0, loc.start.line - 3);
        const endLine = Math.min(lines.length, loc.end.line + 3);
        return lines.slice(startLine, endLine).join('\n');
    }

    async analyzeFile(filePath) {
        try {
            console.log(`Analyzing: ${filePath}`);
            const content = fs.readFileSync(filePath, 'utf8');
            let ast;

            // Handle TypeScript files
            if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
                // Convert TypeScript to JavaScript
                const result = ts.transpileModule(content, {
                    compilerOptions: {
                        target: ts.ScriptTarget.ESNext,
                        module: ts.ModuleKind.CommonJS,
                        jsx: ts.JsxEmit.Preserve
                    }
                });
                
                try {
                    ast = this.parser.parse(result.outputText, {
                        sourceType: 'module',
                        ecmaVersion: 'latest',
                        locations: true
                    });
                } catch (parseError) {
                    console.warn(`Warning: Could not parse transpiled TS: ${filePath}: ${parseError.message}`);
                    return;
                }
            } else {
                // Handle JavaScript files directly
                try {
                    ast = this.parser.parse(content, {
                        sourceType: 'module',
                        ecmaVersion: 'latest',
                        locations: true
                    });
                } catch (parseError) {
                    console.warn(`Warning: Could not parse JS: ${filePath}: ${parseError.message}`);
                    return;
                }
            }

            // Analyze the AST for data sinks
            this.findDataSinks(ast, content, filePath);

        } catch (error) {
            console.warn(`Warning: Error processing ${filePath}: ${error.message}`);
        }
    }

    findDataSinks(ast, content, filePath) {
        walk.simple(ast, {
            // Check method calls
            CallExpression: (node) => {
                if (node.callee.type === 'MemberExpression' && 
                    node.callee.property && 
                    node.callee.property.type === 'Identifier') {
                    
                    const methodName = node.callee.property.name;
                    const predictionScore = this.calculatePredictionScore(node, methodName, filePath, content);
                    const isDataSink = predictionScore >= this.threshold ? 1 : 0;
                    
                    // Get the code chunk
                    const codeChunk = this.getNodeContext(content, node.loc);
                    
                    this.results.push({
                        Full_file_path: filePath.replace(this.baseDir, '').replace(/\\/g, '/'),
                        Code_chunk: codeChunk,
                        Is_data_sink: isDataSink,
                        Prediction_score: parseFloat(predictionScore.toFixed(2))
                    });
                }
            },
            
            // Check assignments that might be data sinks
            AssignmentExpression: (node) => {
                if (node.operator === '=' && 
                    node.left.type === 'MemberExpression' && 
                    node.left.property && 
                    node.left.property.type === 'Identifier') {
                    
                    const propertyName = node.left.property.name;
                    const predictionScore = this.calculatePredictionScore(node, propertyName, filePath, content) * 0.8; // Slightly lower weight for assignments
                    const isDataSink = predictionScore >= this.threshold ? 1 : 0;
                    
                    // Get the code chunk
                    const codeChunk = this.getNodeContext(content, node.loc);
                    
                    this.results.push({
                        Full_file_path: filePath.replace(this.baseDir, '').replace(/\\/g, '/'),
                        Code_chunk: codeChunk,
                        Is_data_sink: isDataSink,
                        Prediction_score: parseFloat(predictionScore.toFixed(2))
                    });
                }
            }
        });
    }

    async analyzeDirectory(dir = this.baseDir) {
        try {
            const files = fs.readdirSync(dir);
            
            for (const file of files) {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);
                
                if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
                    await this.analyzeDirectory(fullPath);
                } else if (stat.isFile() && /\.(js|ts|jsx|tsx)$/.test(file)) {
                    await this.analyzeFile(fullPath);
                }
            }
        } catch (error) {
            console.error(`Error reading directory ${dir}: ${error.message}`);
        }
    }

    generateJSONReport(outputPath) {
        const output = {
            Predictions: this.results
        };

        fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
        console.log(`Analysis complete! Results saved to: ${outputPath}`);
        console.log(`Found ${this.results.length} potential data sinks.`);
        console.log(`${this.results.filter(r => r.Is_data_sink === 1).length} classified as data sinks.`);
    }
}

// CLI interface
const main = async () => {
    const codebasePath = 'd:\\CodeAnalysis\\twenty\\packages\\twenty-server';
    const outputPath = path.join('d:\\CodeAnalysis', 'data-sinks-analysis.json');

    try {
        console.log(`Analyzing codebase: ${codebasePath}`);
        console.log('This may take a while depending on the size of the codebase...');
        
        const analyzer = new ASTParser(codebasePath);
        await analyzer.analyzeDirectory();
        analyzer.generateJSONReport(outputPath);
    } catch (error) {
        console.error('Error during analysis:', error);
        process.exit(1);
    }
};

main();