# Contributing to `leaflet-threaded`

Thank you for your interest in contributing to this project. We welcome all forms of contributions, including code, bug reports, performance patches, documentation improvements, and feature proposals.

This guide outlines how to get involved.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Reporting Issues](#reporting-issues)
- [Submitting Changes](#submitting-changes)
- [Development Setup](#development-setup)
- [Style Guidelines](#style-guidelines)
- [Additional Notes](#additional-notes)

## Code of Conduct

All contributors must adhere to the project's [Code of Conduct](./CODE_OF_CONDUCT.md). Be respectful, honest, and constructive.

## Reporting Issues

Before opening a new issue, please:

1. Check the existing issues at  
   https://github.com/TuanTayHo/leaflet-threaded/issues
2. Clearly describe the problem or feature request.
3. Include a reproducible example if the issue is a bug.
4. Mention your browser, operating system, and Leaflet version.

## Submitting Changes

To contribute code:

1. Fork the repository:  
   https://github.com/TuanTayHo/leaflet-threaded
2. Create a new branch:  
   `git checkout -b feature/my-new-feature`
3. Make your changes.
4. Commit with a clear message:  
   `git commit -m "Add: description of the change"`
5. Push to your fork and open a Pull Request.

**Pull Request Guidelines:**

- Focus on a single logical change.
- Keep the PR minimal and easy to review.
- Explain the motivation behind your change.
- Link to the issue if applicable (e.g., `Fixes #12`).

## Development Setup

To clone and set up the project locally:

```bash
git clone https://github.com/TuanTayHo/leaflet-threaded.git
cd leaflet-threaded
npm install
npm run build
```

You can test changes using the included demos:

- `demo/` uses `L.tileLayer.viqy` (worker + canvas + WebP)
- `demo2/` uses internal threaded `GridLayer` and `TileLayer`

Run a local server to preview the demos:

```bash
npx serve demo
```

or with Python:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## Style Guidelines

- Use consistent formatting and indentation.
- Prefer clear, descriptive variable names.
- Keep contributions minimal and readable.
- Avoid adding unnecessary dependencies.
- Do not commit `node_modules` or built files (`dist/`).

## Additional Notes

- This project focuses on performance, simplicity, and threading. It favors real-world use over experimental visuals.
- If you're contributing changes to tile rendering logic, OffscreenCanvas usage, or fallback behavior, please test on multiple browsers.
- You are encouraged to profile your code using Chrome DevTools or similar before submitting performance-related PRs.

We appreciate your effort. Let's make mapping better, faster, and more maintainable.
