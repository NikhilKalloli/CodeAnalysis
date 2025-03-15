const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const walk = require('acorn-walk');
const jsx = require('acorn-jsx');
const ts = require('typescript');
const ASTPrinter = require('./utils/print_ast');

class FileAnalyzer {
    constructor() {
        this.parser = acorn.Parser.extend(jsx());
        this.astPrinter = new ASTPrinter();
        
        // Load patterns from data-sink-patterns.json
        const patternsFile = fs.readFileSync('utils/data-sink-patterns.json', 'utf8');
        this.patterns = JSON.parse(patternsFile);
        
        // Compile patterns
        this.compiledPatterns = this.compilePatterns();
        
        // Same threshold and weights as ast.js
        this.threshold = 0.5;
        this.weights = {
            patternMatch: 0.4,
            contextMatch: 0.3,
            filePathMatch: 0.2,
            specialCase: 0.1
        };

        // Create output directory if it doesn't exist
        if (!fs.existsSync('output')) {
            fs.mkdirSync('output');
        }
    }

    compilePatterns() {
        const compiled = {
            functionPatterns: new Set(),
            filePatterns: new Set(),
            contextKeywords: new Set(),
            confidenceScores: new Map(),
            regexPatterns: []
        };

        for (const category of Object.values(this.patterns.categories)) {
            for (const pattern of category.patterns) {
                compiled.functionPatterns.add(pattern.pattern.toLowerCase());
                compiled.confidenceScores.set(pattern.pattern.toLowerCase(), pattern.confidence);
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

            for (const filePattern of category.filePatterns) {
                compiled.filePatterns.add(filePattern.pattern);
            }
        }

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

        score = Math.min(1, Math.max(0, score));

        return { score, matchDetails };
    }

    analyzeContext(context) {
        let score = 0;
        const contextLower = context.toLowerCase();
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

        for (const pattern of this.compiledPatterns.filePatterns) {
            const regexPattern = pattern.replace(/\*/g, '.*');
            if (new RegExp(regexPattern, 'i').test(filePathLower)) {
                score += 0.3;
            }
        }

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

        if (/mutation/.test(context) && /\b(create|update|delete|add|remove)\b/i.test(methodName)) {
            score += 0.4;
        }
        if (/\b(post|put|patch|delete)\b/i.test(methodName) && /\b(controller|route|api)\b/i.test(context)) {
            score += 0.4;
        }
        if (/transaction/.test(context) && /\b(commit|execute|query)\b/i.test(methodName)) {
            score += 0.3;
        }
        if (/\b(fs|file|stream)\b/i.test(context) && /\b(write|append|create)\b/i.test(methodName)) {
            score += 0.3;
        }

        return Math.min(1, score);
    }

    getNodeContext(content, loc) {
        if (!loc) return '';
        const lines = content.split('\n');
        const startLine = Math.max(0, loc.start.line - 3);
        const endLine = Math.min(lines.length, loc.end.line + 3);
        return lines.slice(startLine - 1, endLine).join('\n');
    }

    analyzeFile(filePath) {
        try {
            console.log(`\nAnalyzing file: ${filePath}`);
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
                
                ast = this.parser.parse(result.outputText, {
                    sourceType: 'module',
                    ecmaVersion: 'latest',
                    locations: true
                });
            } else {
                ast = this.parser.parse(content, {
                    sourceType: 'module',
                    ecmaVersion: 'latest',
                    locations: true
                });
            }

            const dataSinks = [];
            
            // Find data sinks
            walk.simple(ast, {
                CallExpression: (node) => {
                    if (node.callee.type === 'MemberExpression' && 
                        node.callee.property && 
                        node.callee.property.type === 'Identifier') {
                        
                        const methodName = node.callee.property.name;
                        const context = this.getNodeContext(content, node.loc);
                        const { score, matchDetails } = this.calculatePredictionScore(node, methodName, filePath, context);
                        
                        if (score > 0) {
                            dataSinks.push({
                                methodName,
                                context,
                                score,
                                isDataSink: score >= this.threshold,
                                matchDetails,
                                location: `Line ${node.loc.start.line}`
                            });
                        }
                    }
                }
            });

            // Log results
            console.log('\nAnalysis Results:');
            console.log('================');
            
            if (dataSinks.length === 0) {
                console.log('No potential data sinks found.');
                return;
            }

            dataSinks.sort((a, b) => b.score - a.score);
            
            // Console output
            dataSinks.forEach((sink, index) => {
                console.log(`\n${index + 1}. Method: ${sink.methodName}`);
                console.log(`   Location: ${sink.location}`);
                console.log(`   Score: ${sink.score.toFixed(2)} (${sink.isDataSink ? 'IS' : 'NOT'} a data sink)`);
                console.log('   Match Details:');
                sink.matchDetails.forEach(detail => console.log(`   - ${detail}`));
                console.log('\n   Context:');
                console.log('   ' + sink.context.replace(/\n/g, '\n   '));
            });

            console.log('\nSummary:');
            console.log(`Total potential data sinks found: ${dataSinks.length}`);
            console.log(`Confirmed data sinks: ${dataSinks.filter(s => s.isDataSink).length}`);

            // Save output to JSON file
            const outputData = {
                filePath,
                analysis: {
                    dataSinks: dataSinks.map(sink => ({
                        methodName: sink.methodName,
                        location: sink.location,
                        score: sink.score,
                        isDataSink: sink.isDataSink,
                        matchDetails: sink.matchDetails,
                        context: sink.context
                    })),
                    summary: {
                        totalFound: dataSinks.length,
                        confirmedDataSinks: dataSinks.filter(s => s.isDataSink).length
                    }
                }
            };

            // Create filename for output
            const fileName = path.basename(filePath, path.extname(filePath));
            const outputPath = path.join('output', `${fileName}_analysis.json`);
            
            fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
            console.log(`\nDetailed analysis saved to: ${outputPath}`);

        } catch (error) {
            console.error(`Error analyzing file: ${error.message}`);
        }
    }
}

// Check if file path is provided
if (process.argv.length < 3) {
    console.error('Please provide a file path to analyze');
    console.error('Usage: node analyze_file.js <file_path>');
    process.exit(1);
}

const analyzer = new FileAnalyzer();
analyzer.analyzeFile(process.argv[2]); 