const { createClient } = require("@libsql/client");
const fs = require('fs');
const csv = require('csv-parse');
const path = require('path');
const dotenv = require('dotenv');

// Configure dotenv to look for .env file in the correct location
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

// Verify environment variables are loaded
if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    console.error('Error: Missing required environment variables');
    console.error('Please ensure your .env file exists and contains:');
    console.error('TURSO_DATABASE_URL=your_database_url');
    console.error('TURSO_AUTH_TOKEN=your_auth_token');
    console.error(`Looking for .env file at: ${envPath}`);
    process.exit(1);
}

const turso = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

async function createTable() {
  try {
    // Drop table if exists
    await turso.execute(`
      DROP TABLE IF EXISTS repo_classification_embedding;
    `);

    // Create table
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS repo_classification_embedding (
        file_path TEXT PRIMARY KEY,
        embedding_is_data_sink INTEGER NOT NULL
      );
    `);

    console.log('Table created successfully');
  } catch (error) {
    console.error('Error creating table:', error);
    throw error;
  }
}

async function insertData() {
  try {
    const fileContent = fs.readFileSync('embedding_data-sinks.csv', 'utf-8');
    
    // Parse CSV
    const records = await new Promise((resolve, reject) => {
      csv.parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        quote: '"',
        delimiter: ',',
      }, (err, records) => {
        if (err) reject(err);
        else resolve(records);
      });
    });

    console.log('First record from CSV:', records[0]); // Debug log

    // Batch insert data
    const batchSize = 50; // Reduced batch size
    let inserted = 0;
    
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      // Build the query differently
      const values = [];
      const placeholders = [];
      
      batch.forEach((record, idx) => {
        placeholders.push(`(?, ?)`); // Use ? instead of $n
        values.push(record.file_path);
        values.push(parseInt(record.embedding_is_data_sink));
      });

      const query = `
        INSERT INTO repo_classification_embedding (file_path, embedding_is_data_sink)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (file_path) DO UPDATE 
        SET embedding_is_data_sink = EXCLUDED.embedding_is_data_sink;
      `;

      // Debug log for first batch
      if (i === 0) {
        console.log('Sample query:', query);
        console.log('Sample values:', values.slice(0, 4));
      }

      await turso.execute({
        sql: query,
        args: values
      });

      inserted += batch.length;
      console.log(`Inserted ${inserted}/${records.length} records`);
    }

    // Verify data
    const result = await turso.execute('SELECT COUNT(*) as count FROM repo_classification_embedding');
    console.log('\nVerification:');
    console.log(`Total records in database: ${result.rows[0].count}`);
    
    const dataSinks = await turso.execute('SELECT COUNT(*) as count FROM repo_classification_embedding WHERE embedding_is_data_sink = 1');
    console.log(`Data sinks found: ${dataSinks.rows[0].count}`);

    // Show some sample data
    const samples = await turso.execute('SELECT * FROM repo_classification_embedding LIMIT 5');
    console.log('\nSample entries:');
    console.table(samples.rows);

  } catch (error) {
    if (error.code === 'ARGS_INVALID') {
      console.error('\nDetailed error information:');
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      if (error.cause) {
        console.error('Cause:', error.cause.message);
      }
    }
    console.error('Error inserting data:', error);
    throw error;
  }
}

async function main() {
  try {
    console.log('Starting database operations...');
    
    // Create table
    await createTable();
    
    // Insert data
    await insertData();
    
    console.log('\nAll operations completed successfully!');
  } catch (error) {
    console.error('Failed to complete operations:', error);
    process.exit(1);
  }
}

main(); 