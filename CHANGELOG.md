# Change Log

All notable changes to the "C++ Function Generator" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-04-23

### Added
- Initial release of C++ Function Generator
- Generate function implementations directly in header files
- Generate function implementations in corresponding source files
- Smart detection of function prototypes in header files
- Automatic source file detection and creation if needed
- Support for templated functions with appropriate warnings
- Support for member functions with class scope resolution
- Support for static and inline functions with appropriate warnings
- Support for function qualifiers (const, noexcept, etc.)
- Header guard checking and automatic #pragma once insertion
- Automatic header file inclusion in source files
- TODO comments in generated function bodies
- Context menu integration for C++ files
- Keyboard shortcut: Ctrl+Shift+I (Windows/Linux) or Cmd+Shift+I (Mac)
- Configuration options for implementation location and TODO comments