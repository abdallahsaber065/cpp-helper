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

- **Class-Aware Implementation**:
  - Select a class name to generate implementations for all methods at once
  - Detects templated classes and properly handles template parameters

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
  - Context menu integration for C++ files
  - Keyboard shortcut: `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Shift+I` (Mac)

![Feature Demo](https://raw.githubusercontent.com/abdallahsaber065/cpp-helper/main/images/demo.gif)

## Usage

1. Place your cursor on a function prototype or class name in a C++ header file (ending in `.h`, `.hpp`, or `.hxx`)
2. Right-click and select either:
   - **Generate Implementation Here**
   - **Generate Implementation in Source**
3. The implementation will be generated in the selected location

## Bulk Implementation

When you select a class name before invoking the extension commands:
1. All methods in the class will be processed at once
2. A summary will show how many implementations were generated
3. Already implemented methods will be skipped automatically
4. Special functions (templated, static, inline) will be handled appropriately

## Example

**Header File (Processor.h):**
```cpp
#pragma once
#include <string>

class Processor {
public:
    void process(int id, const std::string& data) noexcept;
    int calculate(double value) const;
};
```

**Generated Implementation (Processor.cpp):**
```cpp
void Processor::process(int id, const std::string& data) noexcept
{
    // TODO: Implement
}

int Processor::calculate(double value) const
{
    // TODO: Implement
    return 0;
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

See [CHANGELOG.md](CHANGELOG.md) for release details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This extension is licensed under the MIT License.
