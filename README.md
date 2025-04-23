# C++ Function Generator

A VS Code extension that automatically generates C++ function implementations from prototypes in header files, streamlining your C++ development workflow.

## Features

- **Two Implementation Options**:
  - **Generate Implementation Here**: Create function implementation directly in the header file (ideal for templated functions)
  - **Generate Implementation in Source**: Find or create a corresponding `.cpp` file and add the implementation there

- **Smart Function Detection**:
  - Automatically recognizes function prototypes in header files
  - Preserves parameter names, return types, and qualifiers (`const`, `noexcept`, etc.)
  - Full support for member functions with class scope resolution

- **Intelligent Source File Finding**:
  - Searches for matching source files in common locations:
    - Same directory as the header
    - `src/` subdirectory
    - Parent directory
    - Various other common C++ project structures
  - Prompts to create a new source file if none exists

- **Safety Features**:
  - Warns about implementing templated functions in source files
  - Detects static/inline functions that should stay in headers
  - Checks for proper header guards and offers to add them
  - Ensures source file includes the header file

- **User Experience**:
  - Preview implementation before insertion
  - Configurable settings
  - Keyboard shortcut: `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Shift+I` (Mac)

![Feature Demo](images/demo.gif)

## Usage

1. Place your cursor on a function prototype in a C++ header file (ending in `.h`, `.hpp`, or `.hxx`)
2. Right-click and select either:
   - **Generate Implementation Here**
   - **Generate Implementation in Source**
3. Preview the generated code
4. Click "Insert" to add the implementation

## Example

**Header File (Processor.h):**
```cpp
#pragma once
#include <string>

class Processor {
public:
    void process(int id, const std::string& data) noexcept;
};
```

**Generated Implementation (Processor.cpp):**
```cpp
void Processor::process(int id, const std::string& data) noexcept
{
    // TODO: Implement
}
```

## Extension Settings

This extension contributes the following settings:

* `cppHelper.defaultImplementationLocation`: Choose the default location for generating function implementations (`"here"` or `"source"`)
* `cppHelper.addTodoComment`: Add TODO comment to generated function bodies (boolean)

## Requirements

- Visual Studio Code 1.99.0 or higher

## Known Issues

- Complex template functions with nested angle brackets may not parse correctly in all cases
- Multi-line function declarations are not supported yet

## Release Notes

### 1.0.0

- Initial release with core functionality
- Support for generating implementations in header or source files
- Smart file search and creation logic
- Safety checks for common C++ issues

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This extension is licensed under the MIT License.
