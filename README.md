# Overnote Frontend

The **Overnote Frontend** is an Electron-based application designed to provide a seamless user interface for a contextual note-taking and annotation tool. This project offers an overlay for dynamic annotations and notes tied to specific contexts, such as active windows or pages, with integration into a Django-based backend.

---

## Features

1. **Context-Aware Note Taking**:  
   Notes are linked to specific contexts (e.g., applications, web pages, or documents).  
   - Automatically fetches and displays relevant notes for the current context.  
   - Updates context dynamically when switching between active windows.

2. **Real-Time Notes Updates**:  
   - Save notes instantly to the backend when the content is updated.  
   - Supports both inline annotations and context-specific notes.

3. **Tray Integration**:  
   - Access the app from the system tray.  
   - Quick toggling of the notes overlay window.  
   - Open a full view of all notes from the tray menu.

4. **Resizable Overlay**:  
   - Users can resize the overlay window for a better viewing experience.

5. **Cross-Platform Compatibility**:  
   - Designed to work on Windows, macOS, and Linux.

---

## Tech Stack

### **Frontend Technology**:
- **[Electron.js](https://www.electronjs.org/)**: Core framework for creating cross-platform desktop applications.
- **HTML5 & CSS3**: For building the UI layout and styles.
- **JavaScript (ES6)**: Handles user interactions and dynamic functionalities.

### **Libraries Used**:
1. **Electron**:  
   - `app`, `BrowserWindow`, `Tray`, and `Menu` modules for window and tray management.
2. **Node.js**:  
   - Used for IPC communication between main and renderer processes.
3. **Fetch API**:  
   - Communicates with the Django backend to fetch and update notes.

### **Backend Integration**:
- **Django (Backend)**: RESTful APIs for fetching and updating notes are integrated via the Fetch API.
- **PostgreSQL**: Database for storing notes and their contexts.

---

## Setup & Installation

### Prerequisites:
1. **Node.js** (v16 or above) and **npm** installed on your machine.  
   Download: [Node.js](https://nodejs.org/)

2. The backend server for Overnote (`overnote_back`) must be running on `http://127.0.0.1:8000`.  

---

### Steps:

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/your-repository/overnote_front.git
   cd overnote_front
   ```
2. **Start the Applicatoin**:
   ```bash
   npm start
   ```
3. **Access the Tray**:

    The application will start minimized to the menu bar. Click the menu bar icon to toggle the notes window.

## Future Functionality


- [x] **Always-on-Top Window**:  
   - The notes overlay remains visible above other windows when enabled.
   - Allow for a toggle to have the notes window either always on top or to make it so it will go behind active windows

- [ ] **Have Multiple Editors During Locking**: 
   - When in Locked mode, have an Editor for the locked context notes and bring up a second editor that is for the context as you change it normally