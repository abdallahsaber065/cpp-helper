import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Represents a parsed C++ function prototype
 */
export interface FunctionPrototype {
    fullSignature: string;
    returnType: string;
    name: string;
    parameters: string;
    qualifiers: string;
    isTemplated: boolean;
    className?: string;
    isStatic: boolean;
    isInline: boolean;
}

/**
 * Parse a C++ function prototype from the current selection or line
 * @param document The current document
 * @param position The current cursor position
 * @returns The parsed function prototype or undefined if no valid prototype found
 */
export function parseFunctionPrototype(document: vscode.TextDocument, position: vscode.Position): FunctionPrototype | undefined {
    // Get the line at the current position
    const line = document.lineAt(position).text;
    
    // Regex pattern to match function prototypes
    // This should handle most common C++ function declarations
    const functionRegex = /(?:(inline|static|virtual|explicit)\s+)?(?:([\w:]+(?:<[^>]*>)?)\s+)?([\w~:<>]+)\s*\((.*?)\)(\s*(?:const|noexcept|override|final|\s)*)\s*;$/;
    const match = line.match(functionRegex);
    
    if (!match) {
        return undefined;
    }
    
    // Extract matched parts
    const specifier = match[1] || '';
    const returnType = match[2] || '';
    const nameWithClass = match[3];
    const parameters = match[4];
    const qualifiers = match[5] ? match[5].trim() : '';
    
    // Check if this is a member function
    const classSeparatorIndex = nameWithClass.lastIndexOf('::');
    let className: string | undefined;
    let name: string = nameWithClass;
    
    if (classSeparatorIndex > 0) {
        className = nameWithClass.substring(0, classSeparatorIndex);
        name = nameWithClass.substring(classSeparatorIndex + 2);
    }
    
    // Check if the function is templated
    const isTemplated = name.includes('<') || returnType.includes('<');
    
    // Check if the function is static or inline
    const isStatic = specifier.includes('static');
    const isInline = specifier.includes('inline');
    
    return {
        fullSignature: line.trim(),
        returnType,
        name,
        parameters,
        qualifiers,
        isTemplated,
        className,
        isStatic,
        isInline
    };
}

/**
 * Search for a corresponding cpp file for a header file
 */
export function findCorrespondingSourceFile(headerFilePath: string): string | undefined {
    // Get the directory, file name and extension
    const dirName = path.dirname(headerFilePath);
    const baseName = path.basename(headerFilePath, path.extname(headerFilePath));
    
    // Search patterns in priority order
    const searchPatterns = [
        // 1. Same directory
        path.join(dirName, `${baseName}.cpp`),
        // 2. "src" folder at the same level
        path.join(dirName, 'src', `${baseName}.cpp`),
        // 3. Parent directory
        path.join(path.dirname(dirName), `${baseName}.cpp`),
        // 4. "src" folder in parent directory
        path.join(path.dirname(dirName), 'src', `${baseName}.cpp`),
        // 5. src/subdirectory matching the header's directory structure
        path.join(path.resolve(dirName, '..'), 'src', path.basename(dirName), `${baseName}.cpp`)
    ];
    
    // Try each pattern in order
    for (const pattern of searchPatterns) {
        if (fs.existsSync(pattern)) {
            return pattern;
        }
    }
    
    return undefined;
}

/**
 * Check if the header file has proper include guards
 */
export function checkHeaderGuards(document: vscode.TextDocument): boolean {
    const text = document.getText();
    
    // Check for #pragma once
    if (text.includes('#pragma once')) {
        return true;
    }
    
    // Check for include guards (#ifndef / #define)
    const guardRegex = /#ifndef\s+\w+\s+#define\s+\w+/;
    return guardRegex.test(text);
}

/**
 * Generate a function implementation from its prototype
 */
export function generateImplementation(prototype: FunctionPrototype, inSourceFile: boolean): string {
    const { returnType, name, parameters, qualifiers, className } = prototype;
    
    // Build the function header
    let implementation = '';
    
    if (inSourceFile && className) {
        implementation += `${returnType} ${className}::${name}(${parameters})${qualifiers}\n{\n`;
    } else {
        implementation += `${returnType} ${name}(${parameters})${qualifiers}\n{\n`;
    }
    
    // Add TODO comment
    implementation += '    // TODO: Implement\n';
    
    // Add return statement if needed
    if (returnType && returnType !== 'void') {
        implementation += '    return {};\n';
    }
    
    implementation += '}\n';
    
    return implementation;
}

/**
 * Check if the function is already implemented in the given text
 */
export function functionAlreadyImplemented(functionName: string, className: string | undefined, text: string): boolean {
    const fullName = className ? `${className}::${functionName}` : functionName;
    const implementationRegex = new RegExp(`${fullName}\\s*\\([^)]*\\)(?:\\s*[\\w\\s]*)?\\s*{`);
    
    return implementationRegex.test(text);
}