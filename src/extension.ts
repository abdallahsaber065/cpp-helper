import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { 
  parseFunctionPrototype, 
  findCorrespondingSourceFile, 
  checkHeaderGuards, 
  generateImplementation,
  functionAlreadyImplemented,
  FunctionPrototype 
} from './utils/cppParser';
import {
  ensureSourceFileExists,
  checkHeaderIncluded,
  findInsertPosition
} from './utils/fileHandler';

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
  console.log('C++ Function Generator extension is now active');

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('cpp-helper.generateHere', generateImplementationHere),
    vscode.commands.registerCommand('cpp-helper.generateInSource', generateImplementationInSource)
  );
}

// Command to generate function implementation in the current file
async function generateImplementationHere() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage('No active editor');
    return;
  }

  // Make sure we're working with a C/C++ file
  if (!editor.document.fileName.endsWith('.h') && 
      !editor.document.fileName.endsWith('.hpp') && 
      !editor.document.fileName.endsWith('.hxx')) {
    vscode.window.showWarningMessage('This command only works in C++ header files');
    return;
  }

  // Get the function prototype at the current position
  const prototype = parseFunctionPrototype(editor.document, editor.selection.active);
  if (!prototype) {
    vscode.window.showWarningMessage('No function prototype found at the current position');
    return;
  }

  // Check if the function is already implemented in this file
  const documentText = editor.document.getText();
  if (functionAlreadyImplemented(prototype.name, prototype.className, documentText)) {
    vscode.window.showWarningMessage(`Function '${prototype.name}' is already implemented in this file`);
    return;
  }

  // Check for header guards
  if (!checkHeaderGuards(editor.document)) {
    const addGuards = await vscode.window.showWarningMessage(
      'This header file lacks proper include guards. Would you like to add #pragma once?',
      'Yes', 'No'
    );
    
    if (addGuards === 'Yes') {
      // Add #pragma once at the top of the file
      await editor.edit(editBuilder => {
        editBuilder.insert(new vscode.Position(0, 0), '#pragma once\n\n');
      });
    }
  }

  // Generate the implementation
  const implementation = generateImplementation(prototype, false);
  
  // Find the position to insert the implementation
  const insertPosition = findInsertPosition(editor.document, false);
  
  // Insert the implementation directly without confirmation
  await editor.edit(editBuilder => {
    editBuilder.insert(insertPosition, '\n' + implementation + '\n');
  });
  
  vscode.window.showInformationMessage(`Successfully added implementation for '${prototype.name}'`);
}

// Command to generate function implementation in the corresponding source file
async function generateImplementationInSource() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage('No active editor');
    return;
  }

  // Make sure we're working with a C/C++ header file
  if (!editor.document.fileName.endsWith('.h') && 
      !editor.document.fileName.endsWith('.hpp') && 
      !editor.document.fileName.endsWith('.hxx')) {
    vscode.window.showWarningMessage('This command only works in C++ header files');
    return;
  }

  // Get the function prototype at the current position
  const prototype = parseFunctionPrototype(editor.document, editor.selection.active);
  if (!prototype) {
    vscode.window.showWarningMessage('No function prototype found at the current position');
    return;
  }

  // Special handling for template functions
  if (prototype.isTemplated) {
    const implementInHeader = await vscode.window.showWarningMessage(
      'Template function implementations should typically be in the header file. Continue anyway?',
      'Continue', 'Implement in Header'
    );
    
    if (implementInHeader === 'Implement in Header') {
      return generateImplementationHere();
    } else if (!implementInHeader) {
      return; // User cancelled
    }
  }

  // Warning for static/inline functions
  if (prototype.isStatic || prototype.isInline) {
    const warning = prototype.isStatic 
      ? 'Static functions should be implemented in the header file.'
      : 'Inline functions should be implemented in the header file.';
      
    const proceed = await vscode.window.showWarningMessage(
      `${warning} Continue anyway?`,
      'Continue', 'Cancel'
    );
    
    if (!proceed || proceed === 'Cancel') {
      return;
    }
  }

  // Find or create the source file
  const headerFilePath = editor.document.uri.fsPath;
  let sourceFilePath = findCorrespondingSourceFile(headerFilePath);
  
  if (!sourceFilePath) {
    sourceFilePath = await ensureSourceFileExists(headerFilePath);
    if (!sourceFilePath) {
      vscode.window.showErrorMessage('Failed to create or find a corresponding source file');
      return;
    }
  }
  
  // Check if the source file includes the header
  if (!checkHeaderIncluded(sourceFilePath, headerFilePath)) {
    const addInclude = await vscode.window.showWarningMessage(
      `The source file does not include the header "${path.basename(headerFilePath)}". Add it?`,
      'Yes', 'No'
    );
    
    if (addInclude === 'Yes') {
      const headerRelPath = path.basename(headerFilePath);
      const includeStatement = `#include "${headerRelPath}"\n\n`;
      
      try {
        const sourceContent = fs.readFileSync(sourceFilePath, 'utf8');
        fs.writeFileSync(sourceFilePath, includeStatement + sourceContent);
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to update source file: ${err}`);
        return;
      }
    }
  }

  // Open the source file
  const sourceDocument = await vscode.workspace.openTextDocument(sourceFilePath);
  
  // Check if the function is already implemented in the source file
  if (functionAlreadyImplemented(prototype.name, prototype.className, sourceDocument.getText())) {
    vscode.window.showWarningMessage(`Function '${prototype.name}' is already implemented in the source file`);
    return;
  }

  // Generate the implementation
  const implementation = generateImplementation(prototype, true);
  
  // Find the position to insert (end of the file for source file)
  const insertPosition = findInsertPosition(sourceDocument, true);
  
  // Show the source file and insert the implementation directly without confirmation
  const sourceEditor = await vscode.window.showTextDocument(sourceDocument);
  await sourceEditor.edit(editBuilder => {
    editBuilder.insert(insertPosition, '\n' + implementation + '\n');
  });
  
  vscode.window.showInformationMessage(`Successfully added implementation for '${prototype.name}'`);
}

export function deactivate() {}
