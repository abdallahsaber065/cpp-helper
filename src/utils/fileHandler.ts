import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Ensures that a corresponding source file exists for the given header file
 * @param headerFilePath The path to the header file
 * @returns The path to the source file (existing or newly created)
 */
export async function ensureSourceFileExists(headerFilePath: string): Promise<string | undefined> {
    const dirName = path.dirname(headerFilePath);
    const baseName = path.basename(headerFilePath, path.extname(headerFilePath));
    
    // Default location is in the same directory
    const defaultSourcePath = path.join(dirName, `${baseName}.cpp`);
    
    if (fs.existsSync(defaultSourcePath)) {
        return defaultSourcePath;
    }
    
    // Check if src folder exists 
    const srcFolderPath = path.join(dirName, 'src');
    const srcSourcePath = path.join(srcFolderPath, `${baseName}.cpp`);
    
    if (fs.existsSync(srcSourcePath)) {
        return srcSourcePath;
    }
    
    // No source file exists, ask user where to create it
    const options = [
        `Same directory (${dirName})`,
        fs.existsSync(srcFolderPath) ? `src directory (${srcFolderPath})` : undefined
    ].filter(Boolean) as string[];
    
    const selectedOption = await vscode.window.showQuickPick(options, {
        title: 'Create Source File',
        placeHolder: 'Select where to create the source file'
    });
    
    if (!selectedOption) {
        return undefined; // User cancelled
    }
    
    // Create the source file based on selection
    let sourceFilePath = defaultSourcePath;
    
    if (selectedOption.includes('src directory')) {
        // Ensure src folder exists
        if (!fs.existsSync(srcFolderPath)) {
            fs.mkdirSync(srcFolderPath, { recursive: true });
        }
        sourceFilePath = srcSourcePath;
    }
    
    // Create the source file with include statement
    const headerRelPath = path.basename(headerFilePath);
    const sourceContent = `#include "${headerRelPath}"\n\n// Source file for ${baseName}\n`;
    
    try {
        fs.writeFileSync(sourceFilePath, sourceContent);
        return sourceFilePath;
    } catch (err) {
        vscode.window.showErrorMessage(`Failed to create source file: ${err}`);
        return undefined;
    }
}

/**
 * Check if the source file includes the correct header
 * @param sourceFilePath The source file path
 * @param headerFilePath The header file path
 */
export function checkHeaderIncluded(sourceFilePath: string, headerFilePath: string): boolean {
    try {
        const sourceContent = fs.readFileSync(sourceFilePath, 'utf8');
        const headerFileName = path.basename(headerFilePath);
        
        // Check for include with quotes or angle brackets
        const includeRegex = new RegExp(`#include\\s+["<]${path.basename(headerFilePath)}[">]`);
        return includeRegex.test(sourceContent);
    } catch (err) {
        return false;
    }
}

/**
 * Add an include statement for the header at the beginning of the source file
 */
export function addHeaderInclude(sourceContent: string, headerFilePath: string): string {
    const headerRelPath = path.basename(headerFilePath);
    const includeStatement = `#include "${headerRelPath}"\n\n`;
    
    // Check if file already has includes
    const hasIncludes = /#include/.test(sourceContent);
    
    if (hasIncludes) {
        // Find the last include statement
        const lines = sourceContent.split('\n');
        let lastIncludeIndex = -1;
        
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith('#include')) {
                lastIncludeIndex = i;
            }
        }
        
        if (lastIncludeIndex >= 0) {
            // Insert after the last include
            lines.splice(lastIncludeIndex + 1, 0, `#include "${headerRelPath}"`);
            return lines.join('\n');
        }
    }
    
    // No existing includes, add at the beginning
    return includeStatement + sourceContent;
}

/**
 * Find the proper position to insert a function implementation
 * @param document The document to insert into
 * @param isSourceFile Whether this is a source file or header file
 */
export function findInsertPosition(document: vscode.TextDocument, isSourceFile: boolean): vscode.Position {
    // For source files, always insert at the end to maintain arrangement
    if (isSourceFile) {
        return new vscode.Position(document.lineCount, 0);
    }
    
    // For header files, try to find the end of class or namespace declarations
    const text = document.getText();
    const lines = text.split('\n');
    
    // Look for closing braces of classes or namespaces
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        
        if (line === '};') {
            // Found the end of a class or namespace
            return new vscode.Position(i + 1, 0);
        }
    }
    
    // Default to the end of the file
    return new vscode.Position(document.lineCount, 0);
}