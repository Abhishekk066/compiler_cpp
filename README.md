# C++ Compiler

A web-based C++ compiler and editor built with Node.js, Express, WebSocket, CodeMirror, and GCC.  
It lets users write C++ code in the browser, compile it on the server, provide input interactively, and view output in real time.

## Features

- Write and edit C++ code in a browser-based CodeMirror editor
- Compile and run C++ code using `g++`
- Real-time compiler output through WebSocket
- Supports basic interactive input using `cin` and `getline`
- Shows compilation errors and runtime output
- Execution timer after successful runs
- Copy code to clipboard
- Generate shareable code links
- Generate QR codes for shared code
- Light and dark editor themes
- Responsive layout for desktop and mobile
- Docker support for easier deployment

## Tech Stack

- **Backend:** Node.js, Express.js
- **Realtime Communication:** WebSocket (`ws`)
- **Compiler:** GCC / `g++`
- **Frontend:** HTML, CSS, JavaScript
- **Editor:** CodeMirror
- **Styling:** Tailwind CSS
- **Utilities:** QRCode, NodeCache, CORS

## Project Structure

```text
compiler_cpp/
├── editor/             # Shared-code editor page
├── public/             # Main frontend files
├── 404.html            # Error page for dark mode
├── 404_day.html        # Error page for light mode
├── Dockerfile          # Docker configuration
├── index.js            # Express server and compiler logic
├── package.json        # Project metadata and dependencies
└── package-lock.json
