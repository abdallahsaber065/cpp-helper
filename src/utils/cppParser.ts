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
    fullSignature: string;
    returnType: string;
    name: string;
    parameters: string;
    qualifiers: string;
    isTemplated: boolean;
    className?: string;
    classTemplate?: string;
    templateParams?: string; // Full template parameters (e.g., "typename T")
    templateArgs?: string;   // Just the template argument names (e.g., "T")
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
    const line = document.lineAt(position).text.trim();
    
    // Skip if this is not a function declaration (no semicolon at the end)
    if (!line.endsWith(';')) {
        return undefined;
    }
    
    // Basic pattern to match function prototypes
    // This regex identifies typical C++ function declarations with various modifiers
    const functionRegex = /(?:(inline|static|virtual|explicit)\s+)?(?:([\w:]+(?:<[^>]*>)?)\s+)?([\w~:<>]+)\s*\((.*?)\)(\s*(?:const|noexcept|override|final|\s)*)\s*;$/;
    const match = line.match(functionRegex);
    
    if (!match) {
        return undefined;
    }
    
    // Extract matched parts
    const specifier = match[1] || '';
    const returnType = match[2] || '';
    const nameWithClass = match[3];
    const parameters = match[4] || '';
    const qualifiers = match[5] ? match[5].trim() : '';
    
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
    const isStatic = specifier.includes('static');
    const isInline = specifier.includes('inline');
    
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
        qualifiers,
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
export function generateImplementation(prototype: FunctionPrototype, inSourceFile: boolean): string {
    const { returnType, name, parameters, qualifiers, className, templateParams, templateArgs } = prototype;
    
    // Build the function header
    let implementation = '';
    
    // Add template declaration if the class is templated
    if (className && templateParams) {
        implementation += `template<${templateParams}>\n`;
    }
    
    // Generate the function signature
    if (className) {
        if (templateArgs) {
            implementation += `${returnType} ${className}<${templateArgs}>::${name}(${parameters})${qualifiers}\n{\n`;
        } else {
            implementation += `${returnType} ${className}::${name}(${parameters})${qualifiers}\n{\n`;
        }
    } else {
        implementation += `${returnType} ${name}(${parameters})${qualifiers}\n{\n`;
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