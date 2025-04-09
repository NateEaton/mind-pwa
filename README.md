# MIND Diet Tracker PWA

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
<!-- Add Vercel badge if you have one: [![Vercel Status](...)](...) -->
[**Live Demo**](https://mind-pwa.vercel.app/) deployed via Vercel.

A simple Progressive Web App (PWA) designed to help users track their daily and weekly adherence to the principles of the MIND Diet. Track servings of key food groups, view summaries, and browse your history, all stored locally in your browser.

## Features

*   **Daily Tracking:** Input servings for food groups with daily or weekly targets.
*   **Weekly Summary:** View your progress towards weekly goals for the current week.
*   **History View:** Browse archived summaries of previous weeks.
*   **Food Group Information:** Clickable info icons (`ⓘ`) next to each food group name display detailed serving size information and examples in a pop-up dialog.
*   **Goal Visualization:** Easily see if weekly goals were met, missed, or approached limits using color-coded indicators in summary and history views.
*   **Automatic Resets:** Daily counters reset automatically at midnight (local time).
*   **Weekly Archiving:** Completed weeks (defaulting to a Sunday start) are automatically saved to local browser storage (IndexedDB).
*   **Data Management:**
    *   **Edit Weekly Totals:** Directly modify weekly serving totals for the *current* week or *any previously completed week* via a pop-up editor accessible from the "Current Week" and "History" views.
    *   **Export Data:** Export all current tracking data and history to a JSON file via the menu.
    *   **Import Data:** Import data from a previously exported JSON file (replaces existing data) via the menu.
*   **PWA Functionality:**
    *   Installable to your device's home screen (requires HTTPS connection).
    *   Offline access to cached application files via Service Worker.
*   **Responsive Design:** Styling adjustments for use on mobile and desktop devices.
*   **About Dialog:** Provides application details, version information (based on Git commit), and environment details via the menu.

## Technology Stack

*   HTML5
*   CSS3 (including CSS Variables)
*   Modern JavaScript (ES6+ Modules, Async/Await)
*   IndexedDB (for storing weekly history)
*   localStorage (for storing current daily/weekly state)
*   Service Workers (for PWA offline caching)
*   Manifest.json (for PWA installability)
*   Node.js (for Git hook version generation during development)

## Installation / Deployment (Self-Hosting)

This application is designed to be hosted as a static website. You can run the version deployed on Vercel using the link above or follow the directions below.

1.  **Prerequisites:** You need a web server capable of serving static files (e.g., Apache, Nginx, Caddy, Synology Web Station, Netlify, Vercel, GitHub Pages) and Node.js if using the Git hook for versioning.
2.  **Get the Code:** Clone this repository or download the source code files. If cloning, you may need to set up the `pre-commit` hook manually (see Option 2 in [this discussion](<link-or-reference-to-versioning-discussion>)).
3.  **(If using Git hook):** Run `npm run generate-version` (or `node update-version.js`) once initially if `version.json` doesn't exist.
4.  **Deploy Files:** Place all the files and folders (`index.html`, `app.js`, `db.js`, `style.css`, `sw.js`, `manifest.json`, `version.json`, `icons/` folder, etc.) into a web-accessible directory on your server.
5.  **Configure Server (if needed):** Ensure your web server is configured to correctly serve files with standard MIME types.
6.  **Access via HTTPS:** To use PWA installation features and Service Workers reliably, access the deployed application using an **HTTPS** connection.

## Usage

Once deployed, navigate to the application URL in a modern web browser.
*   Use the navigation buttons (`Daily Tracker`, `Current Week`, `History`) to switch views.
*   Use the `+` / `-` buttons or type in the input fields on the "Daily Tracker" view to record servings.
*   Click the `ⓘ` icon next to a food group name for serving size details.
*   Use the menu (☰ icon) for Import/Export, About, and Settings options.
*   Use the "Edit Weekly Totals" buttons on the "Current Week" or "History" views to adjust recorded totals after the fact.

## Future Enhancements (Potential Ideas)

*   **Settings:**
    *   Add ability to set starting day of week (currently defaulting to Sunday).
    *   Ability to customize food groups and target servings.
*   **Synchronization:** More automated sync options between devices/clients.
*   **UI/UX:**
    *   Haptic feedback on mobile interactions.
    *   Potentially more visual charts/graphs for history or progress.
    *   Refinements to layout and styling.

## License

This project is licensed under the GNU General Public License v3.0.

The core principles of the GPLv3 ensure that users have the freedom to run, study, share, and modify the software. If you distribute modified versions of this software, you must also license your modifications under GPLv3 and provide the source code. This ensures the software remains free for all its users.

See the [LICENSE](LICENSE) file for the full license text.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

