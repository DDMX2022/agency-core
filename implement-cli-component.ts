```typescript
#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import * as csv from 'csv-parser';

// Check if the correct number of arguments is provided
if (process.argv.length !== 3) {
  console.error('Usage: csvtojson <csv-file-path>');
  process.exit(1);
}

const csvFilePath = process.argv[2];
const jsonFilePath = path.basename(csvFilePath, path.extname(csvFilePath)) + '.json';

const results: any[] = [];

// Read and parse the CSV file
fs.createReadStream(csvFilePath)
  .pipe(csv())
  .on('data', (data) => results.push(data))
  .on('end', () => {
    // Write the JSON file
    fs.writeFile(jsonFilePath, JSON.stringify(results, null, 2), (err) => {
      if (err) {
        console.error('Error writing JSON file:', err);
        process.exit(1);
      }
      console.log(`Successfully converted ${csvFilePath} to ${jsonFilePath}`);
    });
  })
  .on('error', (err) => {
    console.error('Error reading CSV file:', err);
    process.exit(1);
  });
```