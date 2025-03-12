const fs = require('fs');

function convertJsonToCsv() {
    try {
        // Read JSON file
        const jsonData = JSON.parse(fs.readFileSync('privado_data_sinks.json', 'utf8'));
        
        // CSV header
        const csvRows = ['file_path,ast_is_data_sink'];
        
        // Convert each JSON object to CSV row
        jsonData.forEach(item => {
            // Wrap file_path in quotes to handle commas in path
            const filePath = `"${item.file_path}"`;
            csvRows.push(`${filePath},${item.is_data_sink}`);
        });
        
        // Write to CSV file
        fs.writeFileSync('privado_data-sinks.csv', csvRows.join('\n'));
        
        // Print statistics
        console.log('\nConversion completed successfully!');
        console.log(`Total records converted: ${jsonData.length}`);
        console.log(`Data sinks found: ${jsonData.filter(item => item.is_data_sink === 1).length}`);
        console.log('\nSample of converted data:');
        console.log(csvRows.slice(0, 6).join('\n'));
        
        console.log('\nOutput saved to: privado_data-sinks.csv');
        
    } catch (error) {
        console.error('Error converting JSON to CSV:', error);
        process.exit(1);
    }
}

convertJsonToCsv(); 