const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const walk = require('acorn-walk');
const jsx = require('acorn-jsx');
const ts = require('typescript');

class ASTAnalyzer {
    constructor(baseDir) {
        this.baseDir = baseDir;
        this.parser = acorn.Parser.extend(jsx());
        this.results = [];
        
        // Load patterns from combined-data-sink-patterns.json
        const patternsFile = fs.readFileSync('utils/combined-data-sink-patterns.json', 'utf8');
        this.patterns = JSON.parse(patternsFile);
        
        // Compile all patterns for efficient matching
        this.compiledPatterns = this.compilePatterns();
        
        // Threshold for determining if something is a data sink
        this.threshold = 0.5;
        
        // Weight configurations for different aspects
        this.weights = {
            patternMatch: 0.4,      // Weight for direct pattern matches
            contextMatch: 0.3,      // Weight for context-based matches
            filePathMatch: 0.2,     // Weight for file path patterns
            specialCase: 0.1        // Weight for special cases
        };
    }

    compilePatterns() {
        const compiled = {
            functionPatterns: new Set(),
            filePatterns: new Set(),
            contextKeywords: new Set(),
            confidenceScores: new Map(),
            regexPatterns: []
        };

        // Compile patterns from all categories
        for (const category of Object.values(this.patterns.categories)) {
            for (const pattern of category.patterns) {
                // Store basic pattern
                compiled.functionPatterns.add(pattern.pattern.toLowerCase());
                // Store confidence score
                compiled.confidenceScores.set(pattern.pattern.toLowerCase(), pattern.confidence);
                // Create regex pattern if it contains regex characters
                if (pattern.pattern.includes('\\') || pattern.pattern.includes('*')) {
                    try {
                        compiled.regexPatterns.push({
                            regex: new RegExp(pattern.pattern, 'i'),
                            confidence: pattern.confidence
                        });
                    } catch (e) {
                        console.warn(`Invalid regex pattern: ${pattern.pattern}`);
                    }
                }
            }

            // Compile file patterns
            for (const filePattern of category.filePatterns) {
                compiled.filePatterns.add(filePattern.pattern);
            }
        }

        // Add context keywords from recommendations
        this.patterns.recommendations.highPriorityPatterns.forEach(pattern => {
            compiled.contextKeywords.add(pattern.pattern.toLowerCase());
        });

        return compiled;
    }

    calculatePredictionScore(node, methodName, filePath, context) {
        let score = 0;
        let matchDetails = [];

        // 1. Direct pattern matching
        const methodNameLower = methodName.toLowerCase();
        if (this.compiledPatterns.functionPatterns.has(methodNameLower)) {
            const confidence = this.compiledPatterns.confidenceScores.get(methodNameLower) || 0.5;
            score += this.weights.patternMatch * confidence;
            matchDetails.push(`Direct pattern match: ${methodName} (confidence: ${confidence})`);
        }

        // 2. Regex pattern matching
        for (const {regex, confidence} of this.compiledPatterns.regexPatterns) {
            if (regex.test(methodName)) {
                score += this.weights.patternMatch * confidence;
                matchDetails.push(`Regex pattern match: ${regex} (confidence: ${confidence})`);
            }
        }

        // 3. Context-based scoring
        const contextScore = this.analyzeContext(context);
        score += this.weights.contextMatch * contextScore;
        matchDetails.push(`Context score: ${contextScore}`);

        // 4. File path matching
        const filePathScore = this.analyzeFilePath(filePath);
        score += this.weights.filePathMatch * filePathScore;
        matchDetails.push(`File path score: ${filePathScore}`);

        // 5. Special cases handling
        const specialCaseScore = this.handleSpecialCases(node, methodName, context);
        score += this.weights.specialCase * specialCaseScore;
        matchDetails.push(`Special case score: ${specialCaseScore}`);

        // Normalize final score between 0 and 1
        score = Math.min(1, Math.max(0, score));

        // Log detailed scoring if it's a significant match
        if (score > 0.3) {
            console.log(`\nScoring details for ${methodName} in ${filePath}:`);
            console.log(matchDetails.join('\n'));
            console.log(`Final score: ${score.toFixed(2)}\n`);
        }

        return score;
    }

    analyzeContext(context) {
        let score = 0;
        const contextLower = context.toLowerCase();

        // Check for data sink related keywords
        const keywords = [
            { pattern: /\b(write|save|store|persist|update|create|insert)\b/i, weight: 0.3 },
            { pattern: /\b(database|db|repository|entity)\b/i, weight: 0.25 },
            { pattern: /\b(api|endpoint|controller|route)\b/i, weight: 0.2 },
            { pattern: /\b(mutation|graphql|request|response)\b/i, weight: 0.15 },
            { pattern: /\b(file|stream|buffer|cache)\b/i, weight: 0.1 }
        ];

        for (const {pattern, weight} of keywords) {
            if (pattern.test(contextLower)) {
                score += weight;
            }
        }

        return Math.min(1, score);
    }

    analyzeFilePath(filePath) {
        let score = 0;
        const filePathLower = filePath.toLowerCase();

        // Check against compiled file patterns
        for (const pattern of this.compiledPatterns.filePatterns) {
            const regexPattern = pattern.replace(/\*/g, '.*');
            if (new RegExp(regexPattern, 'i').test(filePathLower)) {
                score += 0.3;
            }
        }

        // Check for common data sink directories
        const dirPatterns = [
            { pattern: /\b(controller|service|repository|dao)\b/i, weight: 0.3 },
            { pattern: /\b(api|endpoint|route)\b/i, weight: 0.25 },
            { pattern: /\b(database|model|entity)\b/i, weight: 0.2 },
            { pattern: /\b(mutation|resolver)\b/i, weight: 0.15 }
        ];

        for (const {pattern, weight} of dirPatterns) {
            if (pattern.test(filePathLower)) {
                score += weight;
            }
        }

        return Math.min(1, score);
    }

    handleSpecialCases(node, methodName, context) {
        let score = 0;

        // Check for GraphQL mutations
        if (/mutation/.test(context) && /\b(create|update|delete|add|remove)\b/i.test(methodName)) {
            score += 0.4;
        }

        // Check for REST API endpoints
        if (/\b(post|put|patch|delete)\b/i.test(methodName) && /\b(controller|route|api)\b/i.test(context)) {
            score += 0.4;
        }

        // Check for database transactions
        if (/transaction/.test(context) && /\b(commit|execute|query)\b/i.test(methodName)) {
            score += 0.3;
        }

        // Check for file operations
        if (/\b(fs|file|stream)\b/i.test(context) && /\b(write|append|create)\b/i.test(methodName)) {
            score += 0.3;
        }

        return Math.min(1, score);
    }

    async analyzeFile(filePath) {
        try {
            console.log(`Analyzing: ${filePath}`);
            const content = fs.readFileSync(filePath, 'utf8');
            let ast;

            // Handle TypeScript files
            if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
                const result = ts.transpileModule(content, {
                    compilerOptions: {
                        target: ts.ScriptTarget.ESNext,
                        module: ts.ModuleKind.CommonJS,
                        jsx: ts.JsxEmit.Preserve,
                        experimentalDecorators: true,
                        emitDecoratorMetadata: true
                    }
                });
                
                try {
                    ast = this.parser.parse(result.outputText, {
                        sourceType: 'module',
                        ecmaVersion: 'latest',
                        locations: true
                    });
                } catch (parseError) {
                    console.warn(`Warning: Could not parse transpiled TS: ${filePath}`);
                    return;
                }
            } else {
                try {
                    ast = this.parser.parse(content, {
                        sourceType: 'module',
                        ecmaVersion: 'latest',
                        locations: true
                    });
                } catch (parseError) {
                    console.warn(`Warning: Could not parse JS: ${filePath}`);
                    return;
                }
            }

            this.findDataSinks(ast, content, filePath);

        } catch (error) {
            console.warn(`Warning: Error processing ${filePath}: ${error.message}`);
        }
    }

    findDataSinks(ast, content, filePath) {
        walk.simple(ast, {
            CallExpression: (node) => {
                if (node.callee.type === 'MemberExpression' && 
                    node.callee.property && 
                    node.callee.property.type === 'Identifier') {
                    
                    const methodName = node.callee.property.name;
                    const context = this.getNodeContext(content, node.loc);
                    const predictionScore = this.calculatePredictionScore(node, methodName, filePath, context);
                    
                    if (predictionScore > 0) {
                        this.results.push({
                            Full_file_path: filePath.replace(this.baseDir, '').replace(/\\/g, '/'),
                            Code_chunk: context,
                            Is_data_sink: predictionScore >= this.threshold ? 1 : 0,
                            Prediction_score: parseFloat(predictionScore.toFixed(2))
                        });
                    }
                }
            }
        });
    }

    getNodeContext(content, loc) {
        if (!loc) return '';
        
        const lines = content.split('\n');
        const startLine = Math.max(0, loc.start.line - 3);
        const endLine = Math.min(lines.length, loc.end.line + 3);
        return lines.slice(startLine - 1, endLine).join('\n');
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

    generateReport(outputPath) {
        const output = {
            Predictions: this.results
        };

        fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
        console.log(`\nAnalysis complete! Results saved to: ${outputPath}`);
        console.log(`Found ${this.results.length} potential data sinks.`);
        console.log(`${this.results.filter(r => r.Is_data_sink === 1).length} classified as data sinks.`);
    }
}

// Run the analysis
const main = async () => {
    const codebasePath = 'd:\\CodeAnalysis\\twenty\\packages\\twenty-server';
    const outputPath = path.join('d:\\CodeAnalysis', 'data-sinks-analysis-ast.json');

    try {
        console.log(`Analyzing codebase: ${codebasePath}`);
        console.log('This may take a while depending on the size of the codebase...');
        console.log('Using combined data sink patterns for enhanced detection...');
        
        const analyzer = new ASTAnalyzer(codebasePath);
        await analyzer.analyzeDirectory();
        analyzer.generateReport(outputPath);
    } catch (error) {
        console.error('Error during analysis:', error);
        process.exit(1);
    }
};

main(); 