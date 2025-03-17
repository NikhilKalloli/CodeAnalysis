const fs = require('fs');
const path = require('path');

// Paths to the pattern files
const originalPatternsPath = path.join(__dirname, 'utils', 'data-sink-patterns.json');
const newPatternsPath = path.join(__dirname, 'utils', 'new-data-sink-patterns.json');
const outputPath = path.join(__dirname, 'utils', 'combined-data-sink-patterns.json');

// Function to merge patterns from two arrays, avoiding duplicates
function mergePatterns(originalPatterns, newPatterns) {
    // Create a map of patterns from the original array for quick lookup
    const patternMap = new Map();
    originalPatterns.forEach(pattern => {
        patternMap.set(pattern.pattern, pattern);
    });

    // Add all patterns from the new array, overriding duplicates
    newPatterns.forEach(pattern => {
        patternMap.set(pattern.pattern, pattern);
    });

    // Convert the map back to an array
    return Array.from(patternMap.values());
}

// Function to merge file patterns from two arrays, avoiding duplicates
function mergeFilePatterns(originalPatterns, newPatterns) {
    // Create a map of patterns from the original array for quick lookup
    const patternMap = new Map();
    originalPatterns.forEach(pattern => {
        patternMap.set(pattern.pattern, pattern);
    });

    // Add all patterns from the new array, overriding duplicates
    newPatterns.forEach(pattern => {
        patternMap.set(pattern.pattern, pattern);
    });

    // Convert the map back to an array
    return Array.from(patternMap.values());
}

// Function to merge categories from two objects
function mergeCategories(originalCategories, newCategories) {
    const mergedCategories = { ...originalCategories };

    // Iterate through the new categories
    for (const [categoryName, newCategory] of Object.entries(newCategories)) {
        if (mergedCategories[categoryName]) {
            // If the category exists in the original, merge the patterns
            mergedCategories[categoryName] = {
                ...newCategory,
                patterns: mergePatterns(
                    originalCategories[categoryName].patterns || [],
                    newCategory.patterns || []
                ),
                filePatterns: mergeFilePatterns(
                    originalCategories[categoryName].filePatterns || [],
                    newCategory.filePatterns || []
                )
            };
        } else {
            // If the category doesn't exist in the original, add it
            mergedCategories[categoryName] = newCategory;
        }
    }

    return mergedCategories;
}

// Function to merge recommendations from two objects
function mergeRecommendations(originalRecommendations, newRecommendations) {
    const mergedRecommendations = { ...originalRecommendations };

    // Iterate through the new recommendations
    for (const [recommendationType, newRecommendation] of Object.entries(newRecommendations)) {
        if (mergedRecommendations[recommendationType]) {
            // If the recommendation type exists in the original, merge the patterns
            mergedRecommendations[recommendationType] = mergePatterns(
                originalRecommendations[recommendationType] || [],
                newRecommendation || []
            );
        } else {
            // If the recommendation type doesn't exist in the original, add it
            mergedRecommendations[recommendationType] = newRecommendation;
        }
    }

    return mergedRecommendations;
}

// Main function to merge the pattern files
function mergePatternFiles() {
    console.log('Starting pattern file merge...');

    try {
        // Read the pattern files
        const originalPatterns = JSON.parse(fs.readFileSync(originalPatternsPath, 'utf8'));
        const newPatterns = JSON.parse(fs.readFileSync(newPatternsPath, 'utf8'));

        // Create the merged pattern object
        const mergedPatterns = {
            categories: mergeCategories(originalPatterns.categories, newPatterns.categories),
            recommendations: mergeRecommendations(originalPatterns.recommendations, newPatterns.recommendations)
        };

        // Write the merged patterns to the output file
        fs.writeFileSync(outputPath, JSON.stringify(mergedPatterns, null, 2));

        // Count the number of patterns in each file
        const originalPatternCount = countPatterns(originalPatterns);
        const newPatternCount = countPatterns(newPatterns);
        const mergedPatternCount = countPatterns(mergedPatterns);

        console.log('Pattern file merge complete!');
        console.log(`Original patterns file: ${originalPatternCount.total} patterns (${originalPatternCount.categories} categories)`);
        console.log(`New patterns file: ${newPatternCount.total} patterns (${newPatternCount.categories} categories)`);
        console.log(`Merged patterns file: ${mergedPatternCount.total} patterns (${mergedPatternCount.categories} categories)`);
        console.log(`Output file: ${outputPath}`);
    } catch (error) {
        console.error('Error merging pattern files:', error);
    }
}

// Function to count the number of patterns in a pattern object
function countPatterns(patternObj) {
    let totalPatterns = 0;
    let totalFilePatterns = 0;
    const categoryCount = Object.keys(patternObj.categories).length;

    // Count patterns in each category
    for (const category of Object.values(patternObj.categories)) {
        totalPatterns += (category.patterns || []).length;
        totalFilePatterns += (category.filePatterns || []).length;
    }

    // Count recommendation patterns
    let recommendationPatterns = 0;
    for (const recommendations of Object.values(patternObj.recommendations)) {
        recommendationPatterns += recommendations.length;
    }

    return {
        total: totalPatterns + totalFilePatterns + recommendationPatterns,
        categories: categoryCount
    };
}

// Run the merge function
mergePatternFiles();
