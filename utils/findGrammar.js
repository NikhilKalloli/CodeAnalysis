const fs = require('fs');
const path = require('path');
require('dotenv').config();
const axios = require('axios');

class GrammarAnalyzer {
    constructor() {
        // Fireworks.ai configuration
        this.fireworksConfig = {
            apiKey: process.env.FIREWORKS_API_KEY,
            baseURL: 'https://api.fireworks.ai/inference/v1',
            model: "accounts/fireworks/models/deepseek-r1",
        };

        if (!this.fireworksConfig.apiKey) {
            throw new Error('FIREWORKS_API_KEY not found in .env file');
        }

        // Supported file extensions
        this.supportedExtensions = {
            context: ['.txt', '.md'],  // Context files
            source: ['.ts', '.js'],    // Source files
            config: ['.json', '.yaml', '.yml'] // Configuration files
        };

        // File size limits (in bytes)
        this.fileSizeLimits = {
            context: 20 * 1024 * 1024,  // 20MB for context files
            source: 5 * 1024 * 1024,    // 5MB for source files
            config: 1 * 1024 * 1024     // 1MB for config files
        };

        // Initialize categories for pattern analysis
        this.categories = {
            fileSystem: {
                description: "File system write operations",
                patterns: [],
                filePatterns: []
            },
            database: {
                description: "Database write operations",
                patterns: [],
                filePatterns: []
            },
            network: {
                description: "Network request functions and API calls",
                patterns: [],
                filePatterns: []
            },
            apiEndpoints: {
                description: "API endpoints and response handling",
                patterns: [],
                filePatterns: []
            },
            clientServer: {
                description: "Client-server interactions and data transfers",
                patterns: [
                    "resolver\\.(ts|js)$",
                    "controller\\.(ts|js)$",
                    "\\.service\\.(ts|js)$",
                    "webhook.*handler",
                    "worker\\.ts$"
                ],
                filePatterns: [
                    "src/.+/resolver\\.ts$",
                    "src/.+/controller\\.ts$",
                    "src/.+/service\\.ts$",
                    "src/.+/webhook/.+",
                    "src/.+/worker/.+"
                ]
            },
            cloudStorage: {
                description: "Cloud storage write operations (S3, GCS, Azure Blob)",
                patterns: [
                    "storage.*service",
                    "upload.*service",
                    "file.*service",
                    "bucket.*operation",
                    "blob.*storage"
                ],
                filePatterns: [
                    "src/.+/storage/.+",
                    "src/.+/upload/.+",
                    "src/.+/file-service/.+"
                ]
            },
            messageQueues: {
                description: "Message queue producers (Kafka, RabbitMQ, SQS)",
                patterns: [
                    "queue.*service",
                    "message.*producer",
                    "event.*publisher",
                    "kafka.*producer",
                    "rabbitmq.*channel"
                ],
                filePatterns: [
                    "src/.+/queue/.+",
                    "src/.+/messaging/.+",
                    "src/.+/events/.+"
                ]
            },
            loggingServices: {
                description: "Logging service integrations (Splunk, Datadog, ELK)",
                patterns: [
                    "logger.*service",
                    "logging.*handler",
                    "audit.*log",
                    "telemetry.*service",
                    "monitoring.*service"
                ],
                filePatterns: [
                    "src/.+/logger/.+",
                    "src/.+/logging/.+",
                    "src/.+/audit/.+",
                    "src/.+/telemetry/.+"
                ]
            },
            cicdPipelines: {
                description: "CI/CD pipeline artifacts and deployments",
                patterns: [
                    "deploy.*service",
                    "pipeline.*handler",
                    "build.*artifact",
                    "release.*manager"
                ],
                filePatterns: [
                    "scripts/.+\\.sh$",
                    "src/.+/deploy/.+",
                    "src/.+/pipeline/.+"
                ]
            }
        };

        // Initialize weights for sink criticality
        this.sinkWeights = {
            database: 1.0,
            cloudStorage: 0.9,
            messageQueues: 0.8,
            loggingServices: 0.7,
            cicdPipelines: 0.6
        };

        // Validation rules for pattern matches
        this.validationRules = {
            minConfidence: 0.6,
            requireFileMatch: true,
            maxDepth: 5
        };
        
        // API timeout and retry settings
        this.apiSettings = {
            timeout: 45000,      // Increased timeout to 45 seconds
            maxRetries: 3,       // Maximum number of retries for API calls
            retryDelay: 3000,    // Initial delay between retries in ms
            backoffFactor: 1.5   // Exponential backoff factor
        };
    }

    isFileSupported(file) {
        const ext = path.extname(file).toLowerCase();
        return Object.values(this.supportedExtensions).some(exts => exts.includes(ext));
    }

    getFileType(file) {
        const ext = path.extname(file).toLowerCase();
        for (const [type, extensions] of Object.entries(this.supportedExtensions)) {
            if (extensions.includes(ext)) return type;
        }
        return null;
    }

    async analyzeContext(contextDir) {
        console.log('Reading context files...');
        const files = await this.recursivelyFindFiles(contextDir);
        let contextContent = '';
        let endpoints = new Map();

        for (const file of files) {
            if (!this.isFileSupported(file)) {
                console.log(`Skipping unsupported file: ${file}`);
                continue;
            }

            const stats = fs.statSync(file);
            const fileType = this.getFileType(file);
            const sizeLimit = this.fileSizeLimits[fileType];

            if (stats.size > sizeLimit) {
                console.log(`Skipping large file ${file} (${stats.size} bytes > ${sizeLimit} bytes limit)`);
                continue;
            }

            console.log(`Reading file: ${file} (${fileType})`);
            const content = fs.readFileSync(file, 'utf8');
            
            // Add file type marker for better context
            contextContent += `\n=== ${fileType.toUpperCase()}: ${file} ===\n${content}\n`;
            
            // Only map endpoints from source files
            if (fileType === 'source') {
                const fileEndpoints = await this.mapEndpoints(file, content);
                endpoints.set(file, fileEndpoints);
            }
        }

        // Process categories in parallel with a concurrency limit
        const categories = Object.keys(this.categories);
        const concurrencyLimit = 2; // Process 2 categories at a time to avoid overwhelming the API
        const results = [];

        for (let i = 0; i < categories.length; i += concurrencyLimit) {
            const batch = categories.slice(i, i + concurrencyLimit);
            const promises = batch.map(category => 
                this.analyzeCategoryWithRetry(category, this.categories[category].description, contextContent)
                    .catch(err => {
                        console.error(`Failed to analyze ${category} after retries:`, err.message);
                        return this.getDefaultPatterns(category);
                    })
            );
            
            const batchResults = await Promise.all(promises);
            results.push(...batchResults);
            
            // Add delay between batches to avoid rate limiting
            if (i + concurrencyLimit < categories.length) {
                console.log(`Waiting between batch processing...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        // Then proceed with the rest of the analysis
        const patternResults = await this.analyzePatternsWithWeights(contextContent, endpoints);
        const validatedResults = this.validateResults(patternResults);
        await this.generateFinalRecommendations(contextContent);
        
        return validatedResults;
    }

    async recursivelyFindFiles(dir, depth = 0) {
        if (depth > this.validationRules.maxDepth) return [];
        
        const files = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                files.push(...await this.recursivelyFindFiles(fullPath, depth + 1));
            } else {
                files.push(fullPath);
            }
        }

        return files;
    }

    async mapEndpoints(file, content) {
        const endpoints = [];
        
        // Detect GraphQL resolvers
        const resolverMatches = content.match(/@Resolver\([^)]*\)/g) || [];
        resolverMatches.forEach(match => {
            endpoints.push({
                type: 'graphql',
                pattern: match,
                criticality: this.sinkWeights.database
            });
        });

        // Detect REST endpoints
        const restMatches = content.match(/@(Get|Post|Put|Delete|Patch)\([^)]*\)/g) || [];
        restMatches.forEach(match => {
            endpoints.push({
                type: 'rest',
                pattern: match,
                criticality: this.sinkWeights.database
            });
        });

        return endpoints;
    }

    async analyzePatternsWithWeights(content, endpoints) {
        const results = {};

        for (const [category, info] of Object.entries(this.categories)) {
            const weight = this.sinkWeights[category] || 0.5;
            const matches = await this.findPatternMatches(content, info.patterns);
            
            results[category] = {
                matches: matches.map(match => ({
                    ...match,
                    score: match.confidence * weight
                })),
                endpoints: this.findRelatedEndpoints(endpoints, category)
            };
        }

        return results;
    }

    async findPatternMatches(content, patterns) {
        const matches = [];
        
        for (const pattern of patterns) {
            try {
                const regex = new RegExp(pattern, 'gi');
                let match;
                
                while ((match = regex.exec(content)) !== null) {
                    matches.push({
                        pattern,
                        match: match[0],
                        confidence: this.calculateConfidence(match[0], pattern)
                    });
                }
            } catch (err) {
                console.warn(`Invalid regex pattern: ${pattern}`);
                continue;
            }
        }

        return matches;
    }

    calculateConfidence(match, pattern) {
        // Basic confidence calculation
        const baseConfidence = 0.7;
        
        // Increase confidence for exact matches
        if (match.toLowerCase() === pattern.toLowerCase()) {
            return Math.min(baseConfidence + 0.2, 1.0);
        }
        
        // Decrease confidence for partial matches
        return baseConfidence;
    }

    findRelatedEndpoints(endpoints, category) {
        const related = [];
        
        for (const [file, fileEndpoints] of endpoints) {
            for (const endpoint of fileEndpoints) {
                if (this.isEndpointRelatedToCategory(endpoint, category)) {
                    related.push({
                        file,
                        ...endpoint
                    });
                }
            }
        }

        return related;
    }

    isEndpointRelatedToCategory(endpoint, category) {
        const categoryPatterns = this.categories[category].patterns;
        return categoryPatterns.some(pattern => {
            try {
                return new RegExp(pattern, 'i').test(endpoint.pattern);
            } catch (err) {
                return false;
            }
        });
    }

    validateResults(results) {
        const validated = {};

        for (const [category, data] of Object.entries(results)) {
            validated[category] = {
                matches: data.matches.filter(match => 
                    this.isValidMatch(match, category)
                ),
                endpoints: data.endpoints.filter(endpoint =>
                    endpoint.criticality >= this.validationRules.minConfidence
                )
            };
        }

        return validated;
    }

    isValidMatch(match, category) {
        return (
            match.score >= this.validationRules.minConfidence &&
            (!this.validationRules.requireFileMatch || 
             this.categories[category].filePatterns.some(pattern => {
                try {
                    return new RegExp(pattern).test(match.match);
                } catch (err) {
                    return false;
                }
             }))
        );
    }

    // New method with retry functionality
    async analyzeCategoryWithRetry(category, description, context) {
        let retries = 0;
        let delay = this.apiSettings.retryDelay;
        
        while (retries <= this.apiSettings.maxRetries) {
            try {
                console.log(`Analyzing patterns for ${category}... (attempt ${retries + 1})`);
                // Use a smaller context for API calls to reduce chances of timeout
                const reducedContext = this.reduceContextSize(context, category, 1500);
                
                return await this.analyzeCategoryPatterns(category, description, reducedContext);
            } catch (error) {
                retries++;
                
                if (retries > this.apiSettings.maxRetries) {
                    console.error(`Maximum retries reached for ${category}`);
                    throw error;
                }
                
                console.warn(`Retry ${retries}/${this.apiSettings.maxRetries} for ${category} after error: ${error.message}`);
                
                // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, delay));
                delay = Math.floor(delay * this.apiSettings.backoffFactor);
            }
        }
    }

    // Helper method to reduce context size for API calls
    reduceContextSize(context, category, maxSize) {
        // Find the most relevant portions of context for this category
        const categoryDescription = this.categories[category].description.toLowerCase();
        const lines = context.split('\n');
        const scoredLines = lines.map(line => ({
            line,
            score: this.calculateRelevanceScore(line.toLowerCase(), categoryDescription)
        }));
        
        // Sort by relevance score and keep most relevant
        scoredLines.sort((a, b) => b.score - a.score);
        
        // Take top relevant lines up to maxSize characters
        let result = '';
        let totalSize = 0;
        
        for (const {line} of scoredLines) {
            if (totalSize + line.length + 1 <= maxSize) {
                result += line + '\n';
                totalSize += line.length + 1;
            } else {
                break;
            }
        }
        
        return result;
    }

    // Helper to calculate relevance score for context reduction
    calculateRelevanceScore(line, categoryDescription) {
        // Simple method to score lines based on relevance to category
        if (line.includes(categoryDescription)) return 10;
        
        // Score based on category-related keywords
        let score = 0;
        const words = categoryDescription.split(' ');
        words.forEach(word => {
            if (line.includes(word) && word.length > 3) score += 3;
        });
        
        // Prioritize code patterns over text
        if (line.includes('function') || line.includes('class') || 
            line.includes('const') || line.includes('import')) {
            score += 2;
        }
        
        return score;
    }

    async analyzeCategoryPatterns(category, description, context) {
        console.log(`Analyzing patterns for ${category}...`);
        
        const messages = [{
            "role": "user",
            "content": `Analyze the following code context and return patterns for ${description}.
Return ONLY a JSON object in this exact format (no other text):
{
    "patterns": [
        {
            "pattern": "regex pattern here",
            "confidence": 0.8,
            "explanation": "why this pattern indicates a data sink"
        }
    ],
    "filePatterns": [
        {
            "pattern": "file pattern here",
            "explanation": "why these files contain data sinks"
        }
    ]
}

Context:
${context}`
        }];

        try {
            const response = await axios.post(`${this.fireworksConfig.baseURL}/chat/completions`, {
                model: "accounts/fireworks/models/deepseek-r1",
                messages: messages,
                max_tokens: 1000,  // Reduced from 2000 to improve response time
                temperature: 0.1,
                top_p: 0.9,
                response_format: { "type": "json_object" },
                reasoning_effort: "low"  // Use low reasoning effort for faster responses
            }, {
                headers: {
                    'Authorization': `Bearer ${this.fireworksConfig.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: this.apiSettings.timeout  // Use configurable timeout
            });

            if (!response.data?.choices?.[0]?.message?.content) {
                throw new Error(`Empty or invalid response from API for ${category}`);
            }

            let responseText = response.data.choices[0].message.content.trim();
            
            // If no valid JSON found, use default patterns
            if (!responseText || !responseText.includes('{')) {
                console.warn(`Using default patterns for ${category}`);
                return this.getDefaultPatterns(category);
            }

            // Extract JSON from response (in case there's any extra text)
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error(`No valid JSON found in response for ${category}`);
            }

            try {
                const analysis = JSON.parse(jsonMatch[0]);
                
                // Validate and sanitize the patterns
                const sanitizedPatterns = this.sanitizePatterns(analysis.patterns || []);
                const sanitizedFilePatterns = this.sanitizeFilePatterns(analysis.filePatterns || []);

                this.categories[category].patterns = sanitizedPatterns;
                this.categories[category].filePatterns = sanitizedFilePatterns;

                console.log(`Successfully analyzed ${category} patterns:`);
                console.log(`- ${sanitizedPatterns.length} patterns`);
                console.log(`- ${sanitizedFilePatterns.length} file patterns`);
                
                return { patterns: sanitizedPatterns, filePatterns: sanitizedFilePatterns };
            } catch (parseError) {
                console.error(`JSON parsing error for ${category}:`, parseError.message);
                throw new Error(`Invalid JSON response: ${parseError.message}`);
            }

        } catch (error) {
            console.error(`Error analyzing ${category}:`, error.message);
            throw error;
        }
    }

    getDefaultPatterns(category) {
        // Return predefined patterns from data-sink-patterns.json
        const defaults = {
            fileSystem: {
                patterns: [
                    { pattern: "fs\\.write\\w+", confidence: 0.9, explanation: "Node.js file system write operations" },
                    { pattern: "createWriteStream", confidence: 0.8, explanation: "File stream write operations" },
                    { pattern: "fs\\.append\\w+", confidence: 0.9, explanation: "Node.js file append operations" },
                    { pattern: "fs\\.open\\([^)]*'w'", confidence: 0.8, explanation: "File open in write mode" }
                ],
                filePatterns: [
                    { pattern: ".*\\.service\\.ts$", explanation: "Service files often contain file operations" },
                    { pattern: ".*file.*\\.ts$", explanation: "File-related modules" },
                    { pattern: ".*storage.*\\.ts$", explanation: "Storage-related modules" }
                ]
            },
            database: {
                patterns: [
                    { pattern: "repository\\.save", confidence: 0.9, explanation: "TypeORM save operation" },
                    { pattern: "repository\\.update", confidence: 0.8, explanation: "TypeORM update operation" },
                    { pattern: "\\.(insert|update|delete)\\(", confidence: 0.9, explanation: "SQL operations" },
                    { pattern: "db\\.query", confidence: 0.8, explanation: "Database query execution" }
                ],
                filePatterns: [
                    { pattern: ".*\\.repository\\.ts$", explanation: "Repository files contain database operations" },
                    { pattern: ".*\\.dao\\.ts$", explanation: "Data Access Object files" },
                    { pattern: ".*\\.entity\\.ts$", explanation: "Entity files related to database" }
                ]
            },
            network: {
                patterns: [
                    { pattern: "axios\\.(post|put|patch|delete)", confidence: 0.9, explanation: "Axios HTTP requests that modify data" },
                    { pattern: "fetch\\([^)]*method:\\s*['\"](POST|PUT|DELETE)", confidence: 0.8, explanation: "Fetch API calls with mutation methods" },
                    { pattern: "http\\.request", confidence: 0.7, explanation: "Node.js HTTP requests" }
                ],
                filePatterns: [
                    { pattern: ".*\\.client\\.ts$", explanation: "API client files" },
                    { pattern: ".*\\.api\\.ts$", explanation: "API integration files" },
                    { pattern: ".*\\.http\\.ts$", explanation: "HTTP request files" }
                ]
            },
            apiEndpoints: {
                patterns: [
                    { pattern: "@(Post|Put|Delete|Patch)\\(", confidence: 0.9, explanation: "NestJS/Express REST endpoints for data mutation" },
                    { pattern: "@Mutation\\(", confidence: 0.9, explanation: "GraphQL mutation endpoints" },
                    { pattern: "router\\.(post|put|delete|patch)", confidence: 0.8, explanation: "Express router endpoints for data mutation" }
                ],
                filePatterns: [
                    { pattern: ".*\\.controller\\.ts$", explanation: "Controller files defining API endpoints" },
                    { pattern: ".*\\.resolver\\.ts$", explanation: "GraphQL resolver files" },
                    { pattern: ".*\\.routes\\.ts$", explanation: "Route definition files" }
                ]
            }
            // Additional defaults for other categories could be added
        };

        return defaults[category] || { patterns: [], filePatterns: [] };
    }

    sanitizePatterns(patterns) {
        return patterns.map(p => ({
            pattern: this.sanitizeRegex(p.pattern),
            confidence: Math.min(Math.max(parseFloat(p.confidence) || 0.5, 0), 1),
            explanation: String(p.explanation || '')
        })).filter(p => p.pattern && p.explanation);
    }

    sanitizeFilePatterns(patterns) {
        return patterns.map(p => ({
            pattern: this.sanitizeRegex(p.pattern),
            explanation: String(p.explanation || '')
        })).filter(p => p.pattern && p.explanation);
    }

    sanitizeRegex(pattern) {
        try {
            // Test if it's a valid regex
            new RegExp(pattern);
            return pattern;
        } catch (e) {
            // If invalid regex, escape it as a literal string
            return pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }
    }

    async generateFinalRecommendations(contextContent) {
        // Reduce context size for final recommendations
        const reducedContext = contextContent.slice(0, 2500);
        
        const messages = [{
            "role": "user",
            "content": `You are a code analysis expert. Based on the provided context, provide recommendations for AST-based data sink analysis.
Your response must be valid JSON. Consider:
1. Most important patterns to look for
2. Priority files/directories to analyze
3. Special cases to handle
4. Potential false positives to avoid

Context excerpt (directory structure and intro):
${reducedContext}... (truncated)

Return ONLY a JSON object in this exact format (no other text):
{
    "highPriorityPatterns": [
        {
            "pattern": "pattern here",
            "reason": "why this is important"
        }
    ],
    "priorityFiles": [
        {
            "pattern": "file/directory pattern",
            "reason": "why this should be prioritized"
        }
    ],
    "specialCases": [
        {
            "case": "special case description",
            "handling": "how to handle it"
        }
    ],
    "falsePositives": [
        {
            "pattern": "pattern to be careful with",
            "reason": "why it might be a false positive"
        }
    ]
}`
        }];

        try {
            const response = await axios.post(`${this.fireworksConfig.baseURL}/chat/completions`, {
                model: "accounts/fireworks/models/deepseek-r1",
                messages: messages,
                max_tokens: 1000,  // Reduced for faster response
                temperature: 0.1,
                top_p: 0.9,
                response_format: { "type": "json_object" },
                reasoning_effort: "low"
            }, {
                headers: {
                    'Authorization': `Bearer ${this.fireworksConfig.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: this.apiSettings.timeout
            });

            if (!response.data?.choices?.[0]?.message?.content) {
                throw new Error('Empty or invalid response from API');
            }

            let responseText = response.data.choices[0].message.content.trim();
            
            // Clean up the response text to ensure valid JSON
            if (!responseText.startsWith('{')) {
                responseText = responseText.substring(responseText.indexOf('{'));
            }
            if (!responseText.endsWith('}')) {
                responseText = responseText.substring(0, responseText.lastIndexOf('}') + 1);
            }

            try {
                const recommendations = JSON.parse(responseText);
                this.generateReport(recommendations);
                console.log('Successfully generated recommendations');
            } catch (parseError) {
                console.error('JSON parsing error for recommendations:', parseError.message);
                // Generate report with empty recommendations if parsing fails
                this.generateReport({
                    highPriorityPatterns: [],
                    priorityFiles: [],
                    specialCases: [],
                    falsePositives: []
                });
            }

        } catch (error) {
            console.error('Error generating recommendations:', error.message);
            // Don't throw, just generate a report with empty recommendations
            this.generateReport({
                highPriorityPatterns: [],
                priorityFiles: [],
                specialCases: [],
                falsePositives: []
            });
        }
    }

    generateReport(recommendations) {
        const report = {
            categories: this.categories,
            recommendations: recommendations,
            timestamp: new Date().toISOString()
        };

        // Write detailed JSON report
        const jsonFile = `data-sink-patterns_v2.json`;
        const mdFile = `data-sink-patterns_v2.md`;
        fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2));

        // Generate human-readable summary
        let summary = '# Data Sink Pattern Analysis Summary\n\n';
        
        // Add categories
        for (const [category, info] of Object.entries(this.categories)) {
            summary += `\n## ${category}\n`;
            summary += `\n### Function Patterns:\n`;
            info.patterns.forEach(p => {
                summary += `- ${p.pattern} (Confidence: ${p.confidence})\n  ${p.explanation}\n`;
            });
            summary += `\n### File Patterns:\n`;
            info.filePatterns.forEach(p => {
                summary += `- ${p.pattern}\n  ${p.explanation}\n`;
            });
        }

        // Add recommendations
        summary += '\n## High Priority Patterns\n';
        recommendations.highPriorityPatterns.forEach(p => {
            summary += `- ${p.pattern}\n  Reason: ${p.reason}\n`;
        });

        summary += '\n## Priority Files/Directories\n';
        recommendations.priorityFiles.forEach(p => {
            summary += `- ${p.pattern}\n  Reason: ${p.reason}\n`;
        });

        summary += '\n## Special Cases to Handle\n';
        recommendations.specialCases.forEach(c => {
            summary += `- ${c.case}\n  Handling: ${c.handling}\n`;
        });

        summary += '\n## Potential False Positives\n';
        recommendations.falsePositives.forEach(p => {
            summary += `- ${p.pattern}\n  Reason: ${p.reason}\n`;
        });

        fs.writeFileSync(mdFile, summary);
        
        console.log('\nAnalysis complete!');
        console.log(`Detailed report saved to: ${jsonFile}`);
        console.log(`Summary report saved to: ${mdFile}`);
    }
}

// Run the analysis
const main = async () => {
    try {
        const contextDir = path.join('D:', 'CodeAnalysis', 'server-context');
        console.log('Starting pattern analysis...');
        const analyzer = new GrammarAnalyzer();
        await analyzer.analyzeContext(contextDir);
        console.log('Analysis completed successfully');
    } catch (error) {
        console.error('Error during analysis:', error);
        process.exit(1);
    }
};

main();