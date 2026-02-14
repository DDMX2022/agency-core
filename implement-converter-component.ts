```typescript
import * as fs from 'fs';
import * as marked from 'marked';
import * as hljs from 'highlight.js';

// Configure marked to use highlight.js
marked.setOptions({
  highlight: (code: string, language: string) => {
    const validLanguage = hljs.getLanguage(language) ? language : 'plaintext';
    return hljs.highlight(validLanguage, code).value;
  }
});

// Function to convert markdown to HTML
function convertMarkdownToHtml(inputFile: string, outputFile: string): void {
  fs.readFile(inputFile, 'utf8', (err, data) => {
    if (err) {
      console.error(`Error reading file: ${err}`);
      return;
    }

    const htmlContent = marked(data);

    fs.writeFile(outputFile, htmlContent, (err) => {
      if (err) {
        console.error(`Error writing file: ${err}`);
        return;
      }
      console.log(`Converted ${inputFile} to ${outputFile}`);
    });
  });
}

// Example usage
const inputFile = 'example.md'; // Replace with your markdown file
const outputFile = 'output.html'; // Replace with your desired output HTML file
convertMarkdownToHtml(inputFile, outputFile);
```