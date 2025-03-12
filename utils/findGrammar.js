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
            model: "accounts/fireworks/models/llama-v3p3-70b-instruct",
        };

        if (!this.fireworksConfig.apiKey) {
            throw new Error('FIREWORKS_API_KEY not found in .env file');
        }

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
                patterns: [],
                filePatterns: []
            }
        };
    }

    async analyzeContext(contextDir) {
        console.log('Reading context files...');
        const files = fs.readdirSync(contextDir);
        let contextContent = '';

        for (const file of files) {
            if (file.endsWith('.txt')) {
                console.log(`Reading file: ${file}`);
                const content = fs.readFileSync(path.join(contextDir, file), 'utf8');
                contextContent += `\n=== ${file} ===\n${content}\n`;
            }
        }

        if (!contextContent.trim()) {
            throw new Error('No content found in context files');
        }

        console.log(`Total context length: ${contextContent.length} characters`);

        // Analyze patterns for each category
        for (const [category, info] of Object.entries(this.categories)) {
            console.log(`\nAnalyzing patterns for ${category}...`);
            await this.analyzeCategoryPatterns(category, info.description, contextContent);
        }

        // Generate final analysis
        console.log('\nGenerating final recommendations...');
        await this.generateFinalRecommendations(contextContent);
    }

    async analyzeCategoryPatterns(category, description, context) {
        const prompt = `You are a code analysis expert. Your task is to analyze the provided context and identify patterns for ${description}.
Your response must be valid JSON. Focus on:
1. Function names and patterns that indicate data sinks
2. File naming patterns where such operations are likely to be found
3. Code patterns that suggest data being written or sent

Context excerpt (directory structure and intro):
${context.slice(0, 3000)}... (truncated)

Return ONLY a JSON object in this exact format (no other text):
{
    "patterns": [
        {
            "pattern": "pattern here",
            "confidence": 0.8,
            "explanation": "why this is a data sink pattern"
        }
    ],
    "filePatterns": [
        {
            "pattern": "file pattern here",
            "explanation": "why these files are likely to contain data sinks"
        }
    ]
}`;

        try {
            const response = await axios.post(`${this.fireworksConfig.baseURL}/completions`, {
                model: this.fireworksConfig.model,
                prompt: prompt,
                max_tokens: 1000,
                temperature: 0.2,
                top_p: 0.9,
                stop: ["\n\n", "```"],
                response_format: { "type": "json_object" }
            }, {
                headers: {
                    'Authorization': `Bearer ${this.fireworksConfig.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            let responseText = response.data.choices[0].text.trim();
            
            // Clean up the response text to ensure valid JSON
            if (!responseText.startsWith('{')) {
                responseText = responseText.substring(responseText.indexOf('{'));
            }
            if (!responseText.endsWith('}')) {
                responseText = responseText.substring(0, responseText.lastIndexOf('}') + 1);
            }

            try {
                const analysis = JSON.parse(responseText);
                this.categories[category].patterns = analysis.patterns || [];
                this.categories[category].filePatterns = analysis.filePatterns || [];
                console.log(`Successfully analyzed ${category} patterns`);
            } catch (parseError) {
                console.error(`JSON parsing error for ${category}:`, parseError.message);
                console.error('Response text:', responseText);
                // Set default empty arrays if parsing fails
                this.categories[category].patterns = [];
                this.categories[category].filePatterns = [];
            }

        } catch (error) {
            console.error(`Error analyzing ${category}:`, error.message);
            if (error.response) {
                console.error('API Response:', error.response.data);
            }
        }
    }

    async generateFinalRecommendations(context) {
        const prompt = `You are a code analysis expert. Based on the provided context, provide recommendations for AST-based data sink analysis.
Your response must be valid JSON. Consider:
1. Most important patterns to look for
2. Priority files/directories to analyze
3. Special cases to handle
4. Potential false positives to avoid

Context excerpt (directory structure and intro):
${context.slice(0, 3000)}... (truncated)

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
}`;

        try {
            const response = await axios.post(`${this.fireworksConfig.baseURL}/completions`, {
                model: this.fireworksConfig.model,
                prompt: prompt,
                max_tokens: 1000,
                temperature: 0.2,
                top_p: 0.9,
                stop: ["\n\n", "```"],
                response_format: { "type": "json_object" }
            }, {
                headers: {
                    'Authorization': `Bearer ${this.fireworksConfig.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            let responseText = response.data.choices[0].text.trim();
            
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
                console.error('Response text:', responseText);
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
            if (error.response) {
                console.error('API Response:', error.response.data);
            }
        }
    }

    generateReport(recommendations) {
        const report = {
            categories: this.categories,
            recommendations: recommendations,
            timestamp: new Date().toISOString()
        };

        // Write detailed JSON report
        fs.writeFileSync('data-sink-patterns.json', JSON.stringify(report, null, 2));

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

        fs.writeFileSync('data-sink-patterns.md', summary);
        
        console.log('\nAnalysis complete!');
        console.log('Detailed report saved to: data-sink-patterns.json');
        console.log('Summary report saved to: data-sink-patterns.md');
    }
}

// Run the analysis
const main = async () => {
    try {
        const contextDir = path.join('D:', 'CodeAnalysis', 'Context');
        console.log('Starting pattern analysis...');
        const analyzer = new GrammarAnalyzer();
        await analyzer.analyzeContext(contextDir);
    } catch (error) {
        console.error('Error during analysis:', error);
        process.exit(1);
    }
};

main(); 