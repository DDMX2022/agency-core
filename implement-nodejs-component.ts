```javascript
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

// Check if the correct number of arguments is provided
if (process.argv.length !== 3) {
  console.error('Usage: csvtojson <csv-file-path>');
  process.exit(1);
}

const csvFilePath = process.argv[2];
const jsonFilePath = path.basename(csvFilePath, path.extname(csvFilePath)) + '.json';

const results = [];

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

```json
{
  "name": "csvtojson-cli",
  "version": "1.0.0",
  "description": "A CLI tool to convert CSV files to JSON",
  "main": "csvtojson.js",
  "bin": {
    "csvtojson": "./csvtojson.js"
  },
  "scripts": {
    "start": "node csvtojson.js"
  },
  "author": "",
  "license": "ISC",
  "dependencies": {
    "csv-parser": "^3.0.0"
  }
}
```