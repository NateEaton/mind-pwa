# MIND Diet Tracker PWA

A simple Progressive Web App (PWA) designed to help users track their daily and weekly adherence to the principles of the MIND Diet. Track servings of key food groups, view summaries, and browse your history, all stored locally in your browser.

## Features

*   **Daily Tracking:** Input servings for food groups with daily or weekly targets.
*   **Weekly Summary:** View your progress towards weekly goals for the current week.
*   **History View:** Browse archived summaries of previous weeks.
*   **Goal Visualization:** Easily see if weekly goals were met, missed, or approached limits using color-coded indicators.
*   **Automatic Resets:** Daily counters reset automatically at midnight (local time).
*   **Weekly Archiving:** Completed weeks are automatically saved to local browser storage (IndexedDB).
*   **PWA Functionality:**
    *   Installable to your device's home screen (requires HTTPS connection).
    *   Offline access to cached application files via Service Worker.
*   **Responsive Design:** Basic styling adjustments for use on mobile and desktop devices.
*   **Data Management:**
    *   Export all current tracking data and history to a JSON file.
    *   Import data from a previously exported JSON file (replaces existing data).



## Technology Stack

*   HTML5
*   CSS3 (including CSS Variables)
*   Modern JavaScript (ES6+ Modules, Async/Await)
*   IndexedDB (for storing weekly history)
*   localStorage (for storing current daily/weekly state)
*   Service Workers (for PWA offline caching)
*   Manifest.json (for PWA installability)

## Installation / Deployment (Self-Hosting)

This application is designed to be hosted as a static website. You can run this version deployed on Vercel using link under About or follow the directions below. 

1.  **Prerequisites:** You need a web server capable of serving static files (e.g., Apache, Nginx, Caddy, Synology Web Station, Netlify, Vercel, GitHub Pages).
2.  **Get the Code:** Clone this repository or download the source code files.
3.  **Deploy Files:** Place all the files and folders (`index.html`, `app.js`, `db.js`, `style.css`, `sw.js`, `manifest.json`, `icons/` folder, etc.) into a web-accessible directory on your server.
4.  **Configure Server (if needed):** Ensure your web server is configured to correctly serve files with standard MIME types (e.g., `.js` as `application/javascript`, `.webmanifest` or `.json` as `application/manifest+json`). Most servers handle this automatically.
5.  **Access via HTTPS:** To use the PWA installation features ("Add to Home Screen") and Service Worker capabilities reliably, you **must** access the deployed application using an **HTTPS** connection. Accessing via `http://localhost` during development is usually exempt from this requirement.

## Usage

Once deployed, simply navigate to the URL where you hosted the application in a modern web browser (like Chrome, Edge, Firefox, Safari). Use the navigation buttons or the menu to switch between views and track your food servings.

## Future Enhancements (Potential Ideas)

*   Pop-up description of foods and serving sizes for each food group. 
*   Settings including the ability to set starting day of week (currently Monday).
*   A more automated sync between devices/clients.
*   UI/UX refinements and potentially more visual charts/graphs.
*   Ability to customize food groups and target servings via a settings interface.

## License

This project is licensed under the GNU General Public License v3.0.

The core principles of the GPLv3 ensure that users have the freedom to run, study, share, and modify the software. If you distribute modified versions of this software, you must also license your modifications under GPLv3 and provide the source code. This ensures the software remains free for all its users.

See the [LICENSE](LICENSE) file for the full license text.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)