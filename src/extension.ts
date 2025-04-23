import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
	parseFunctionPrototype,
	findCorrespondingSourceFile,
	checkHeaderGuards,
	generateImplementation,
	functionAlreadyImplemented,
	FunctionPrototype,
	getClassNameAtCursor,
	findClassMethodPrototypes
} from './utils/cppParser';
import {
	ensureSourceFileExists,
	checkHeaderIncluded,
	findInsertPosition,
	addHeaderInclude
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

	// Process all selections (multi-cursor support)
	const selections = editor.selections;
	if (selections.length === 0) {
		return;
	}

	// Check for header guards only once
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

	// Collection of implementations to add
	const implementationsToAdd: { position: vscode.Position, implementation: string }[] = [];

	// Check if cursor is on a class name - if so, handle all methods at once
	const className = getClassNameAtCursor(editor.document, selections[0].active);
	
	if (className) {
		// Find all method prototypes in the class
		const methodPositions = findClassMethodPrototypes(editor.document, className);
		
		if (methodPositions.length === 0) {
			vscode.window.showInformationMessage(`No function prototypes found in class ${className}`);
			return;
		}
		
		const documentText = editor.document.getText();
		let implementedCount = 0;
		let skippedCount = 0;
		
		// Process each method prototype
		for (const position of methodPositions) {
			const prototype = parseFunctionPrototype(editor.document, position);
			if (!prototype) {
				continue;
			}
			
			// Check if already implemented
			if (functionAlreadyImplemented(prototype.name, prototype.className, documentText)) {
				skippedCount++;
				continue;
			}
			
			// Generate the implementation
			const implementation = generateImplementation(prototype);
			const isStandalone = prototype.className === '' || prototype.className === undefined;
			const insertPosition = findInsertPosition(editor.document, false, isStandalone);
			
			// Add to the collection
			implementationsToAdd.push({ position: insertPosition, implementation: '\n' + implementation + '\n' });
			implementedCount++;
		}
		
		// Show summary message
		if (skippedCount > 0) {
			vscode.window.showInformationMessage(
				`Generated ${implementedCount} implementations. Skipped ${skippedCount} already implemented function(s).`
			);
		}
	} else {
		// Process each selection individually (original behavior)
		for (const selection of selections) {
			// Get the function prototype at the current position
			const prototype = parseFunctionPrototype(editor.document, selection.active);
			if (!prototype) {
				continue; // Skip invalid selections
			}

			// Check if the function is already implemented in this file
			const documentText = editor.document.getText();
			if (functionAlreadyImplemented(prototype.name, prototype.className, documentText)) {
				vscode.window.showWarningMessage(`Function '${prototype.name}' is already implemented in this file`);
				continue;
			}

			// Generate the implementation
			const implementation = generateImplementation(prototype);

			const isStandalone = prototype.className === '' || prototype.className === undefined;

			// Find the position to insert the implementation
			const insertPosition = findInsertPosition(editor.document, false, isStandalone);

			// Add to the collection
			implementationsToAdd.push({ position: insertPosition, implementation: '\n' + implementation + '\n' });
		}
	}

	// Apply all implementations in a single edit
	if (implementationsToAdd.length > 0) {
		await editor.edit(editBuilder => {
			for (const item of implementationsToAdd) {
				editBuilder.insert(item.position, item.implementation);
			}
		});
	}
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

	// Process all selections (multi-cursor support)
	const selections = editor.selections;
	if (selections.length === 0) {
		return;
	}

	// Find or create the source file (do this only once)
	const headerFilePath = editor.document.uri.fsPath;
	let sourceFilePath = findCorrespondingSourceFile(headerFilePath);

	if (!sourceFilePath) {
		sourceFilePath = await ensureSourceFileExists(headerFilePath);
		if (!sourceFilePath) {
			vscode.window.showErrorMessage('Failed to create or find a corresponding source file');
			return;
		}
	}

	// Open the source file
	const sourceDocument = await vscode.workspace.openTextDocument(sourceFilePath);
	const sourceEditor = await vscode.window.showTextDocument(sourceDocument);

	// Check if the header is included and prepare content with include if needed
	let sourceText = sourceDocument.getText();
	let needsInclude = !checkHeaderIncluded(sourceFilePath, headerFilePath);
	let includedSourceText = sourceText;

	if (needsInclude) {
		includedSourceText = addHeaderInclude(sourceText, headerFilePath);
	}

	// Apply the include if needed
	if (needsInclude) {
		await sourceEditor.edit(editBuilder => {
			const fullRange = new vscode.Range(
				new vscode.Position(0, 0),
				new vscode.Position(sourceDocument.lineCount, 0)
			);
			editBuilder.replace(fullRange, includedSourceText);
			sourceText = includedSourceText;
		});
	}

	// Check if cursor is on a class name - if so, handle all methods at once
	const className = getClassNameAtCursor(editor.document, selections[0].active);
	
	if (className) {
		// Find all method prototypes in the class
		const methodPositions = findClassMethodPrototypes(editor.document, className);
		
		if (methodPositions.length === 0) {
			vscode.window.showInformationMessage(`No function prototypes found in class ${className}`);
			return;
		}
		
		let implementedCount = 0;
		let skippedCount = 0;
		let templatedCount = 0;
		let staticOrInlineCount = 0;
		
		// Process each method prototype
		for (const position of methodPositions) {
			const prototype = parseFunctionPrototype(editor.document, position);
			if (!prototype) {
				continue;
			}
			
			// Check if already implemented
			if (functionAlreadyImplemented(prototype.name, prototype.className, sourceText)) {
				skippedCount++;
				continue;
			}
			
			// Check if templated (should be implemented in header)
			if (prototype.isTemplated) {
				templatedCount++;
				continue;
			}
			
			// Check if static or inline (should be implemented in header)
			if (prototype.isStatic || prototype.isInline) {
				staticOrInlineCount++;
				continue;
			}
			
			// Generate the implementation
			const implementation = generateImplementation(prototype);
			const insertPosition = new vscode.Position(sourceDocument.lineCount, 0);
			
			// Apply the edit
			await sourceEditor.edit(editBuilder => {
				editBuilder.insert(insertPosition, '\n' + implementation + '\n');
			});
			implementedCount++;
		}
		
		// Show summary message with appropriate details
		let message = `Generated ${implementedCount} implementations.`;
		
		if (skippedCount > 0) {
			message += ` Skipped ${skippedCount} already implemented function(s).`;
		}
		
		if (templatedCount > 0) {
			message += ` ${templatedCount} templated function(s) should be implemented in the header.`;
		}
		
		if (staticOrInlineCount > 0) {
			message += ` ${staticOrInlineCount} static/inline function(s) should be implemented in the header.`;
		}
		
		vscode.window.showInformationMessage(message);
	} else {
		// Process each selection individually (original behavior)
		for (const selection of selections) {
			const prototype = parseFunctionPrototype(editor.document, selection.active);
			if (!prototype) {
				continue; // Skip invalid selections
			}

			if (prototype.isTemplated) {
				const implementInHeader = await vscode.window.showWarningMessage(
					'Template function implementations should typically be in the header file. Continue anyway?',
					'Continue', 'Implement in Header'
				);

				if (implementInHeader === 'Implement in Header') {
					continue;
				} else if (!implementInHeader) {
					continue;
				}
			}

			if (prototype.isStatic || prototype.isInline) {
				const warning = prototype.isStatic
					? 'Static functions should be implemented in the header file.'
					: 'Inline functions should be implemented in the header file.';

				const proceed = await vscode.window.showWarningMessage(
					`${warning} Continue anyway?`,
					'Continue', 'Cancel'
				);

				if (!proceed || proceed === 'Cancel') {
					continue;
				}
			}

			if (functionAlreadyImplemented(prototype.name, prototype.className, sourceText)) {
				vscode.window.showWarningMessage(`Function '${prototype.name}' is already implemented in the source file`);
				continue;
			}

			const implementation = generateImplementation(prototype);
			const insertPosition = new vscode.Position(sourceDocument.lineCount, 0);

			await sourceEditor.edit(editBuilder => {
				editBuilder.insert(insertPosition, '\n' + implementation + '\n');
			});
		}
	}
}

export function deactivate() { }
