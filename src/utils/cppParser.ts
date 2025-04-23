import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Helper utility functions for C++ parsing
 */
class Helpers {
    /**
     * Convert template complete string to parameter names only.
     * @example template<typename T1, typename T2>  --->  T1, T2
     * @param template The template string to process
     */
    static templateNames(template: string): string[] {
        return this.templateParameters(this.removeArgumentDefault(template)).map(function (templ) {
            let match: any;
            if (match = /^(([\w_][\w\d_]*\s+)+)([\w_][\w\d_]*)$/g.exec(templ)) {
                return match[3];
            }
            return templ;
        });
    }

    /**
     * Convert template complete string to parameter names with types only.
     * @example template<typename T1, typename T2>  --->  typename T1, typename T2
     * @param template The template string to process
     */
    static templateParameters(template: string): string[] {
        template = template.replace(/^\s*template\s*</, '');
        template = template.replace(/>$/, '');
        if (template.length === 0) {
            return [];
        }
        return template.split(',').map((templ) => templ.trim());
    }

    /**
     * Remove default value from arguments.
     * @param args The arguments string
     */
    static removeArgumentDefault(args: string): string {
        return args.replace(/([^=^,]+)(\s+=\s*[^\,^>]*)/g, '$1').replace(/([^=^,]+)(=\s*[^\,]*)/g, '$1').trim();
    }
}

/**
 * Represents a parsed C++ function prototype
 */
export interface FunctionPrototype {
    fullSignature: string; // e.g., "int MyClass::foo(int a, int b) const noexcept;"
    returnType: string; // e.g., "int"
    name: string; // e.g., "foo"
    parameters: string; // e.g., "int a, int b"
    qualifiers: string; // e.g., "const noexcept"
    preQualifiers: string[]; // e.g., ["inline", "static"]
    isTemplated: boolean; // true if the function is templated
    postQualifiers: string; // Qualifiers after the parameter list (e.g., "const noexcept")
    className?: string; // e.g., "MyClass"
    classTemplate?: string; // e.g., "MyClass<T>"
    templateParams?: string; // Full template parameters (e.g., "typename T")
    templateArgs?: string;   // Just the template argument names (e.g., "T")
    isStatic: boolean; // true if the function is static
    isInline: boolean; // true if the function is inline
}

/**
 * Check if the cursor is positioned on a class name
 * @param document The current document
 * @param position The current cursor position
 * @returns The class name if cursor is on a class name, undefined otherwise
 */
export function getClassNameAtCursor(document: vscode.TextDocument, position: vscode.Position): string | undefined {
    // Get the current line text
    const line = document.lineAt(position.line).text;
    
    // Get the word at the current position
    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) {
        return undefined;
    }
    
    const word = document.getText(wordRange);
    
    // Check if the word is preceded by "class" or "struct" keyword on the same line
    const linePrefix = line.substring(0, wordRange.start.character).trim();
    if (linePrefix.endsWith('class') || linePrefix.endsWith('struct')) {
        return word;
    }
    
    // Sometimes cursor might be on the class name in a different context
    // Check if this word is defined as a class/struct elsewhere in the document
    const fullText = document.getText();
    const classDefinitionRegex = new RegExp(`\\b(class|struct)\\s+${word}\\s*[:{]`);
    
    if (classDefinitionRegex.test(fullText)) {
        return word;
    }
    
    return undefined;
}

/**
 * Find all unimplemented method prototypes in a class
 * @param document The current document
 * @param className The name of the class to extract methods from
 * @returns Array of positions where method prototypes are found
 */
export function findClassMethodPrototypes(document: vscode.TextDocument, className: string): vscode.Position[] {
    const positions: vscode.Position[] = [];
    const documentText = document.getText();
    
    // First find the class definition
    const classRegex = new RegExp(`\\b(class|struct)\\s+${className}\\s*(?:<[^>]*>)?\\s*(?::[^{]*)?\\s*\\{`, 'g');
    const classMatch = classRegex.exec(documentText);
    
    if (!classMatch) {
        return positions;
    }
    
    // Find the opening brace position
    const classStartIndex = classMatch.index;
    let openBracePos = documentText.indexOf('{', classStartIndex);
    
    if (openBracePos === -1) {
        return positions;
    }
    
    // Now find the matching closing brace by counting braces
    let braceCount = 1;
    let closeBracePos = -1;
    
    for (let i = openBracePos + 1; i < documentText.length; i++) {
        if (documentText[i] === '{') {
            braceCount++;
        } else if (documentText[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
                closeBracePos = i;
                break;
            }
        }
    }
    
    if (closeBracePos === -1) {
        return positions;
    }
    
    // Extract the class content
    const classContent = documentText.substring(openBracePos + 1, closeBracePos);
    
    // Find all method prototypes (ending with semicolon)
    // This regex finds function declarations but avoids matching variable declarations
    const methodRegex = /([^;{}]*?\b\w+\s*\([^)]*\)(?:\s*(?:const|noexcept|override|final|\s*)*)?);/g;
    let methodMatch;
    
    while ((methodMatch = methodRegex.exec(classContent)) !== null) {
        // Convert string index to position in document
        const methodEndPos = documentText.indexOf(methodMatch[0], openBracePos) + methodMatch[0].length;
        const pos = document.positionAt(methodEndPos);
        
        // Only add if it looks like a real method (has parentheses)
        if (methodMatch[0].includes('(') && methodMatch[0].includes(')')) {
            positions.push(pos);
        }
    }
    
    return positions;
}

/**
 * Parse a C++ function prototype from the current selection or line
 * @param document The current document
 * @param position The current cursor position
 * @returns The parsed function prototype or undefined if no valid prototype found
 */
export function parseFunctionPrototype(document: vscode.TextDocument, position: vscode.Position): FunctionPrototype | undefined {
    // Get the line at the current position
    const line = document.lineAt(position).text.trim();

    // Skip if this is not a function declaration (no semicolon at the end)
    if (!line.endsWith(';')) {
        return undefined;
    }

    // Updated regex to correctly capture pre-qualifiers, return type, name, parameters, and post-qualifiers
    const functionRegex = /(?:(inline|static|virtual|explicit|const)\s+)*([\w:]+(?:<[^>]*>)?)\s+([\w~:<>]+)\s*\((.*?)\)(\s*(?:const|noexcept|override|final|\s)*)?;/;
    const match = line.match(functionRegex);

    if (!match) {
        return undefined;
    }

    // Extract matched parts
    const preQualifiers = match[1] ? match[1].split(/\s+/) : [];
    const returnType = match[2] || '';
    const nameWithClass = match[3];
    const parameters = match[4] || '';
    const postQualifiers = match[5] ? match[5].trim() : '';

    // Check if this is a member function
    const classSeparatorIndex = nameWithClass.lastIndexOf('::');
    let className: string | undefined;
    let name: string = nameWithClass;

    if (classSeparatorIndex > 0) {
        className = nameWithClass.substring(0, classSeparatorIndex);
        name = nameWithClass.substring(classSeparatorIndex + 2);
    } else {
        // If this is in a class context, we need to check previous lines
        className = extractClassNameFromContext(document, position);
    }

    // Check if the function is templated
    const isTemplated = name.includes('<') || returnType.includes('<');

    // Check if the function is static or inline
    const isStatic = preQualifiers.includes('static');
    const isInline = preQualifiers.includes('inline');

    // Extract template info for the class
    const templateInfo = extractTemplateInfo(document, position);
    const classTemplate = templateInfo.template;
    const templateParams = templateInfo.templateParams;
    const templateArgs = templateInfo.templateArgs;

    return {
        fullSignature: line,
        returnType,
        name,
        parameters,
        preQualifiers,          // Specifiers before the return type
        qualifiers: postQualifiers,  // For backward compatibility
        postQualifiers,      // Qualifiers after the parameter list
        isTemplated,
        className,
        classTemplate,
        templateParams,
        templateArgs,
        isStatic,
        isInline
    };
}

/**
 * Extract class name from context (for functions defined inside a class)
 */
function extractClassNameFromContext(document: vscode.TextDocument, position: vscode.Position): string | undefined {
    // Look up to 100 lines back for class/struct definition
    const startLine = Math.max(0, position.line - 100);
    const textBeforeCursor = document.getText(new vscode.Range(
        new vscode.Position(startLine, 0),
        position
    ));
    
    // Find the closest class/struct definition
    const lines = textBeforeCursor.split('\n');
    
    // Start from the current line and move backward
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        const classMatch = /\b(class|struct)\s+(\w+)(?:<[^>]*>)?/.exec(line);
        
        if (classMatch) {
            return classMatch[2]; // Return the class name
        }
        
        // If we find a closing brace, it might end the class scope
        // But we need to be careful about nested scopes
        if (line.includes('}')) {
            // Check for a complete scope ending
            if (line.includes('};')) {
                // This is likely the end of a class/struct/namespace definition
                // We need to find a corresponding opening brace
                let braceCounter = 1;
                
                // Continue searching backwards for the opening brace
                for (let j = i - 1; j >= 0; j--) {
                    const openBraces = (lines[j].match(/{/g) || []).length;
                    const closeBraces = (lines[j].match(/}/g) || []).length;
                    braceCounter += closeBraces - openBraces;
                    
                    if (braceCounter === 0) {
                        // We found the matching opening brace, so skip back to before this entire block
                        i = j;
                        break;
                    }
                }
            }
        }
    }
    
    return undefined;
}

/**
 * Extract template information from the document
 */
function extractTemplateInfo(document: vscode.TextDocument, position: vscode.Position): { 
    template?: string; 
    templateParams?: string;
    templateArgs?: string;
} {
    // Look up to 100 lines back for template definition
    const startLine = Math.max(0, position.line - 100);
    const textBeforeCursor = document.getText(new vscode.Range(
        new vscode.Position(startLine, 0),
        position
    ));
    
    // Find template declaration before class
    const lines = textBeforeCursor.split('\n');
    let templateLine: string | undefined;
    let templateParams: string | undefined;
    let templateArgs: string | undefined;
    let classLine: string | undefined;
    let classFound = false;
    let braceBalance = 0;
    
    // Traverse backwards to find the class and its template
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        
        // Count braces to track scope
        braceBalance += (line.match(/\}/g) || []).length;
        braceBalance -= (line.match(/\{/g) || []).length;
        
        if (braceBalance > 0) {
            // We've moved outside of our current scope
            continue;
        }
        
        if (!classFound && (line.includes('class') || line.includes('struct'))) {
            const classMatch = /\b(class|struct)\s+(\w+)(?:<[^>]*>)?/.exec(line);
            if (classMatch) {
                classLine = line;
                classFound = true;
            }
        } else if (classFound && line.startsWith('template')) {
            templateLine = line.trim();
            
            // Extract template parameters 
            const paramMatch = templateLine.match(/template\s*<([^>]*)>/);
            if (paramMatch && paramMatch[1]) {
                templateParams = paramMatch[1].trim();
                
                // Extract just the parameter names (T, U, etc.)
                const templateNames = Helpers.templateNames(templateLine);
                if (templateNames && templateNames.length > 0) {
                    templateArgs = templateNames.join(', ');
                }
            }
            break;
        }
    }
    
    return { template: templateLine, templateParams, templateArgs };
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
export function generateImplementation(prototype: FunctionPrototype): string {
    const { returnType, name, parameters, preQualifiers, postQualifiers, className, templateParams, templateArgs } = prototype;

    // Build the function header
    let implementation = '';

    // Add template declaration if the class or function is templated
    if (templateParams) {
        implementation += `template<${templateParams}>\n`;
    }

    // Add pre-qualifiers (e.g., inline, static, const return type)
    if (preQualifiers.length > 0) {
        implementation += `${preQualifiers.join(' ')} `;
    }

    // Generate the function signature
    if (className) {
        // Templated class case
        if (templateArgs) {
            implementation += `${returnType} ${className}<${templateArgs}>::${name}(${parameters}) ${postQualifiers}\n{\n`;
        }
        // Non-templated class case
        else {
            implementation += `${returnType} ${className}::${name}(${parameters}) ${postQualifiers}\n{\n`;
        }
    }
    // Standalone function case
    else {
        implementation += `${returnType} ${name}(${parameters}) ${postQualifiers}\n{\n`;
    }

    // Add only the TODO comment, no return statement
    implementation += '    // TODO: Implement\n';

    implementation += '}\n';

    return implementation;
}

/**
 * Check if the function is already implemented in the given text
 */
export function functionAlreadyImplemented(functionName: string, className: string | undefined, text: string): boolean {
    if (!className) {
        // For non-member functions
        const pattern = new RegExp(`\\b${functionName}\\s*\\([^)]*\\)(?:\\s*[\\w\\s]*)?\\s*{`);
        return pattern.test(text);
    }
    
    // For member functions, check both with and without template arguments
    const fullNamePattern = new RegExp(`\\b${className}(?:<[^>]*>)?::${functionName}\\s*\\([^)]*\\)(?:\\s*[\\w\\s]*)?\\s*{`);
    return fullNamePattern.test(text);
}