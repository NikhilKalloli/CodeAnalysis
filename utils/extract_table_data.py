import os
import csv
import json
from bs4 import BeautifulSoup

# Configuration
HTML_FILE = 'code_reasoning_results.html'
OUTPUT_CSV = 'extracted_results.csv'
OUTPUT_JSON = 'extracted_results.json'

# Fields to extract
TARGET_FIELDS = [
    'filepath',
    'token_count',
    'reasoning',
    'summary',
    'data_source_presence',
    'data_source_reasoning',
    'data_model_presence',
    'data_model_reasoning',
    'data_sink_presence',
    'data_sink_reasoning',
    'sensitive_data_presence',
    'sensitive_data_reasoning'
]

def extract_table_data():
    print(f"Processing {HTML_FILE}...")
    
    # Check if file exists
    if not os.path.exists(HTML_FILE):
        print(f"Error: {HTML_FILE} not found.")
        return None
    
    # Parse HTML
    with open(HTML_FILE, 'r', encoding='utf-8') as file:
        soup = BeautifulSoup(file, 'html.parser')
    
    # Find the table - assuming it's the main table in the document
    table = soup.find('table', {'class': 'wide-table'})
    if not table:
        print("Error: Could not find the main table.")
        return None
    
    # Extract headers
    headers = []
    header_row = table.find('thead').find('tr')
    if header_row:
        headers = [th.get_text().strip() for th in header_row.find_all('th')]
    else:
        print("Error: Could not find table headers.")
        return None
    
    # Verify that all target fields are in the headers
    missing_fields = [field for field in TARGET_FIELDS if field not in headers]
    if missing_fields:
        print(f"Warning: The following fields were not found in the table: {', '.join(missing_fields)}")
    
    # Create field indices mapping
    field_indices = {field: headers.index(field) for field in TARGET_FIELDS if field in headers}
    
    # Extract data from each row
    results = []
    rows = table.find('tbody').find_all('tr')
    print(f"Found {len(rows)} rows to process.")
    
    for i, row in enumerate(rows):
        try:
            cells = row.find_all(['td', 'th'])
            if len(cells) < len(headers):
                print(f"Warning: Row {i+1} has fewer cells than headers. Skipping.")
                continue
            
            # Extract data for each target field
            row_data = {}
            for field, index in field_indices.items():
                if index < len(cells):
                    row_data[field] = cells[index].get_text().strip()
                else:
                    row_data[field] = ""
            
            results.append(row_data)
            
            # Progress indicator
            if (i+1) % 100 == 0:
                print(f"Processed {i+1} rows...")
                
        except Exception as e:
            print(f"Error processing row {i+1}: {str(e)}")
    
    print(f"Successfully extracted data from {len(results)} rows.")
    return results

def save_as_csv(data, filename=OUTPUT_CSV):
    """Save the extracted data as CSV"""
    if not data:
        print("No data to save as CSV.")
        return
    
    with open(filename, 'w', newline='', encoding='utf-8') as csvfile:
        if not data[0].keys():
            print("Error: No fields to write to CSV.")
            return
            
        writer = csv.DictWriter(csvfile, fieldnames=data[0].keys())
        writer.writeheader()
        writer.writerows(data)
    
    print(f"Data saved to {filename}")

def save_as_json(data, filename=OUTPUT_JSON):
    """Save the extracted data as JSON"""
    if not data:
        print("No data to save as JSON.")
        return
        
    with open(filename, 'w', encoding='utf-8') as jsonfile:
        json.dump(data, jsonfile, indent=2)
    
    print(f"Data saved to {filename}")

if __name__ == "__main__":
    # Extract data
    extracted_data = extract_table_data()
    
    if extracted_data:
        # Save as CSV
        save_as_csv(extracted_data)
        
        # Save as JSON
        save_as_json(extracted_data)
        
        print("Extraction completed successfully!")
    else:
        print("Extraction failed.") 