const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const walk = require('acorn-walk');
const jsx = require('acorn-jsx');
const ts = require('typescript');

class ASTAnalyzer {
    constructor() {
        this.parser = acorn.Parser.extend(jsx());
        this.results = [];
        
        // Add additional patterns for authentication, network calls, and database operations
        this.patterns = this.createPatterns();
        
        // Compile all patterns for efficient matching
        this.compiledPatterns = this.compilePatterns();
        
        // Lower threshold for determining if something is a data sink
        this.threshold = 0.5;
        
        // Weight configurations for different aspects
        this.weights = {
            patternMatch: 0.35,      // Weight for direct pattern matches
            contextMatch: 0.3,       // Weight for context-based matches
            filePathMatch: 0.15,     // Weight for file path patterns
            specialCase: 0.2         // Increased weight for special cases
        };
    }

    createPatterns() {
        return {
            categories: {
                authentication: {
                    description: "Authentication and token handling operations",
                    patterns: [
                        { pattern: "OAuth2", confidence: 0.8 },
                        { pattern: "setCredentials", confidence: 0.85 },
                        { pattern: "getOAuth2Client", confidence: 0.7 },
                        { pattern: "refreshToken", confidence: 0.9 },
                        { pattern: "accessToken", confidence: 0.8 },
                        { pattern: "refreshTokens", confidence: 0.9 },
                        { pattern: "refreshAccessToken", confidence: 0.9 },
                        { pattern: "client_id", confidence: 0.7 },
                        { pattern: "client_secret", confidence: 0.9 }
                    ],
                    filePatterns: [
                        { pattern: "*oauth*", confidence: 0.7 },
                        { pattern: "*token*", confidence: 0.7 },
                        { pattern: "*auth*", confidence: 0.6 },
                        { pattern: "*refresh*", confidence: 0.6 }
                    ]
                },
                network: {
                    description: "Network and API call operations",
                    patterns: [
                        { pattern: "post", confidence: 0.8 },
                        { pattern: "put", confidence: 0.8 },
                        { pattern: "patch", confidence: 0.8 },
                        { pattern: "delete", confidence: 0.8 },
                        { pattern: "axios", confidence: 0.7 },
                        { pattern: "fetch", confidence: 0.7 },
                        { pattern: "request", confidence: 0.6 }
                    ],
                    filePatterns: []
                },
                database: {
                    description: "Database operations and connections",
                    patterns: [
                        { pattern: "Redis", confidence: 0.8 },
                        { pattern: "IORedis", confidence: 0.8 },
                        { pattern: "getClient", confidence: 0.6 },
                        { pattern: "connect", confidence: 0.7 },
                        { pattern: "createConnection", confidence: 0.8 }
                    ],
                    filePatterns: [
                        { pattern: "*redis*", confidence: 0.7 }
                    ]
                }
            },
            recommendations: {
                highPriorityPatterns: [
                    { pattern: "token", confidence: 0.8 },
                    { pattern: "secret", confidence: 0.9 },
                    { pattern: "password", confidence: 0.9 },
                    { pattern: "credential", confidence: 0.8 },
                    { pattern: "auth", confidence: 0.7 },
                    { pattern: "oauth", confidence: 0.8 }
                ]
            }
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

        // Add additional context keywords
        const additionalContextKeywords = [
            "token", "secret", "password", "credential", "auth", "oauth", 
            "api", "endpoint", "database", "redis", "mongo", "sql", "postgres",
            "environment", "env", "config", "axios", "http", "request"
        ];
        
        additionalContextKeywords.forEach(keyword => {
            compiled.contextKeywords.add(keyword.toLowerCase());
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

        return { score, matchDetails };
    }

    analyzeContext(context) {
        let score = 0;
        const contextLower = context.toLowerCase();

        // Check for data sink related keywords
        const keywords = [
            { pattern: /\b(write|save|store|persist|update|create|insert)\b/i, weight: 0.3 },
            { pattern: /\b(database|db|repository|entity|redis)\b/i, weight: 0.25 },
            { pattern: /\b(api|endpoint|controller|route)\b/i, weight: 0.2 },
            { pattern: /\b(mutation|graphql|request|response)\b/i, weight: 0.15 },
            { pattern: /\b(file|stream|buffer|cache)\b/i, weight: 0.1 },
            // New patterns for environment variables and secrets
            { pattern: /\b(environment|env|config|secret|token|key)\b/i, weight: 0.25 },
            { pattern: /\b(process\.env|environmentService\.get)\b/i, weight: 0.3 },
            { pattern: /\b(client_id|client_secret|auth|oauth)\b/i, weight: 0.3 },
            // Network and HTTP related
            { pattern: /\b(axios|fetch|http|request|post|put)\b/i, weight: 0.25 },
            { pattern: /\b(login|authenticate|authorize|refresh)\b/i, weight: 0.25 }
        ];

        for (const {pattern, weight} of keywords) {
            if (pattern.test(contextLower)) {
                score += weight;
            }
        }

        // Check for URLs in context
        const urlPatterns = [
            { pattern: /https?:\/\/[^\s'"]+/i, weight: 0.3 },
            { pattern: /oauth2?/i, weight: 0.25 },
            { pattern: /api\./i, weight: 0.2 },
            { pattern: /login\./i, weight: 0.2 }
        ];

        for (const {pattern, weight} of urlPatterns) {
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
            { pattern: /\b(mutation|resolver)\b/i, weight: 0.15 },
            // New patterns for auth and token services
            { pattern: /\b(auth|oauth|token|refresh)\b/i, weight: 0.25 },
            { pattern: /\b(client|secret|credential)\b/i, weight: 0.2 }
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

        // Check for axios/fetch network calls
        if (node.callee.type === 'MemberExpression' && 
            node.callee.object && 
            node.callee.object.type === 'Identifier') {
            
            const objectName = node.callee.object.name;
            
            if (objectName === 'axios' && /\b(post|put|patch|delete)\b/i.test(methodName)) {
                score += 0.6;
            }
            
            if (/\b(fetch|request|http)\b/i.test(objectName)) {
                score += 0.5;
            }
        }

        // Check for environment variable access
        if (/\b(environmentService|process\.env)\b/i.test(context) && 
            /\b(get|env)\b/i.test(methodName)) {
            score += 0.3;
        }

        // Check for authentication/token operations
        if (/\b(token|auth|oauth|credential)\b/i.test(context)) {
            score += 0.4;
        }

        // Check for Redis or database client initialization
        if (/\b(new\s+(\w+Redis|IORedis|Sequelize|Mongoose|Client))\b/i.test(context)) {
            score += 0.5;
        }

        return Math.min(1, score);
    }

    analyzeFile(filePath) {
        try {
            console.log(`\nAnalyzing: ${filePath}`);
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
                    return null;
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
                    return null;
                }
            }

            return this.findDataSinks(ast, content, filePath);

        } catch (error) {
            console.warn(`Warning: Error processing ${filePath}: ${error.message}`);
            return null;
        }
    }

    findDataSinks(ast, content, filePath) {
        const results = [];
        // Track environment variable access
        const envVars = new Set();
        
        // First pass: find environment variable access
        walk.simple(ast, {
            CallExpression: (node) => {
                if (node.callee.type === 'MemberExpression' && 
                    node.callee.property && 
                    node.callee.property.type === 'Identifier' &&
                    node.callee.property.name === 'get' &&
                    node.callee.object &&
                    node.callee.object.type === 'MemberExpression' &&
                    node.callee.object.property &&
                    node.callee.object.property.name === 'environmentService') {
                    
                    // Extract the environment variable name if it's a string literal
                    if (node.arguments.length > 0 && node.arguments[0].type === 'Literal') {
                        envVars.add(node.arguments[0].value);
                    }
                }
            }
        });

        // Second pass: find data sinks
        walk.simple(ast, {
            CallExpression: (node) => {
                // Check for method calls (object.method())
                if (node.callee.type === 'MemberExpression' && 
                    node.callee.property && 
                    node.callee.property.type === 'Identifier') {
                    
                    const methodName = node.callee.property.name;
                    const context = this.getNodeContext(content, node.loc);
                    const { score, matchDetails } = this.calculatePredictionScore(node, methodName, filePath, context);
                    
                    if (score > 0) {
                        results.push({
                            methodName,
                            location: `Line ${node.loc.start.line}`,
                            score,
                            isDataSink: score >= this.threshold,
                            matchDetails,
                            context: context.substring(0, 200) + '...' // Truncate for readability
                        });
                    }
                }
                
                // Check for new expressions (new Client())
                else if (node.callee.type === 'Identifier' || 
                         (node.callee.type === 'MemberExpression' && node.callee.property)) {
                    
                    const constructorName = node.callee.type === 'Identifier' ? 
                                           node.callee.name : 
                                           node.callee.property.name;
                    
                    // Check if it's a database or auth client constructor
                    if (/\b(Redis|IORedis|OAuth2|Client|Connection)\b/i.test(constructorName)) {
                        const context = this.getNodeContext(content, node.loc);
                        
                        // Calculate a score for this constructor
                        let score = 0.4; // Base score for constructors
                        let matchDetails = [`Constructor match: ${constructorName} (base score: 0.4)`];
                        
                        // Check context for sensitive keywords
                        if (/\b(token|secret|password|key|credential|auth|oauth)\b/i.test(context)) {
                            score += 0.3;
                            matchDetails.push('Context contains sensitive keywords (+0.3)');
                        }
                        
                        // Check if environment variables are used
                        if (envVars.size > 0) {
                            score += 0.2;
                            matchDetails.push(`Environment variables used: ${Array.from(envVars).join(', ')} (+0.2)`);
                        }
                        
                        results.push({
                            methodName: `new ${constructorName}`,
                            location: `Line ${node.loc.start.line}`,
                            score,
                            isDataSink: score >= this.threshold,
                            matchDetails,
                            context: context.substring(0, 200) + '...' // Truncate for readability
                        });
                    }
                }
            },
            
            // Check for axios/fetch network calls with object literals
            ObjectExpression: (node) => {
                // Look for objects with method: 'POST' or similar
                const hasHttpMethod = node.properties.some(prop => 
                    prop.key && 
                    prop.key.name === 'method' && 
                    prop.value && 
                    prop.value.type === 'Literal' && 
                    /\b(post|put|patch|delete)\b/i.test(prop.value.value)
                );
                
                if (hasHttpMethod) {
                    const context = this.getNodeContext(content, node.loc);
                    const score = 0.6; // High score for explicit HTTP methods
                    
                    results.push({
                        methodName: 'HTTP Request',
                        location: `Line ${node.loc.start.line}`,
                        score,
                        isDataSink: score >= this.threshold,
                        matchDetails: ['Explicit HTTP method in object literal (+0.6)'],
                        context: context.substring(0, 200) + '...' // Truncate for readability
                    });
                }
            }
        });

        return results;
    }

    getNodeContext(content, loc) {
        if (!loc) return '';
        
        const lines = content.split('\n');
        const startLine = Math.max(0, loc.start.line - 3);
        const endLine = Math.min(lines.length, loc.end.line + 3);
        return lines.slice(startLine - 1, endLine).join('\n');
    }
}

// Test the sample files
const testSampleFiles = () => {
    const sinksDirPath = path.join('D:', 'CodeAnalysis', 'Sinks');
    const files = [
        path.join(sinksDirPath, 'gservice.ts'),
        path.join(sinksDirPath, 'ms-refresh-service.ts'),
        path.join(sinksDirPath, 'refresh-service.ts'),
        path.join(sinksDirPath, 'redis-service.ts')
    ];

    console.log('Testing sample files for data sink detection...\n');
    
    const analyzer = new ASTAnalyzer();
    
    for (const filePath of files) {
        const results = analyzer.analyzeFile(filePath);
        
        if (!results || results.length === 0) {
            console.log(`No data sinks found in ${path.basename(filePath)}`);
            continue;
        }
        
        console.log(`\n=== Results for ${path.basename(filePath)} ===`);
        
        // Sort by score descending
        results.sort((a, b) => b.score - a.score);
        
        results.forEach((result, index) => {
            console.log(`\n${index + 1}. ${result.methodName} (${result.location})`);
            console.log(`   Score: ${result.score.toFixed(2)} - ${result.isDataSink ? 'IS' : 'NOT'} a data sink`);
            console.log('   Match details:');
            result.matchDetails.forEach(detail => console.log(`   - ${detail}`));
        });
        
        const dataSinkCount = results.filter(r => r.isDataSink).length;
        console.log(`\nSummary: ${results.length} potential data sinks, ${dataSinkCount} confirmed data sinks`);
    }
};

testSampleFiles(); 