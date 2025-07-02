# MIND Diet Tracker PWA

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Node.js: >=18.0.0](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

A Progressive Web App (PWA) designed to help users track their daily and weekly adherence to the principles of the MIND Diet. Record servings of MIND Diet food groups each day, view weekly summaries, and browse your historical data. The app includes a guided setup wizard to help new users configure their preferences and optional cloud synchronization. All data is stored locally on your device and can be optionally synchronized across multiple devices using cloud storage.

[**Live Demo**](https://mind-pwa-fawn.vercel.app/) | [**View Wiki for Complete Documentation**](../../wiki)

### ⚠️ Cloud Sync Limitations in Demo

The hosted demo app (on Vercel) only supports the client-side functionality so doesn't include cloud sync. However, it is otherwise fully functional with local storage of your data and the ability to backup/restore and exchange data between devices with the export/import features. 

## App Screenshots

<div align="center">
  <p><strong>Main Views & Menu</strong></p>
  <table>
    <tr valign="top">
      <td><img src="./screenshots/daily-tracker.png" width="180" alt="Daily Tracker View"/></td>
      <td><img src="./screenshots/weekly-summary.png" width="180" alt="Weekly Summary View"/></td>
      <td><img src="./screenshots/history-view.png" width="180" alt="History View"/></td>
      <td><img src="./screenshots/menu.png" width="180" alt="Menu"/></td>
    </tr>
  </table>

  <p><strong>Modal Dialogs</strong></p>
  <table>
    <tr valign="top">
      <td><img src="./screenshots/food-info-modal.png" width="180" alt="Food Information Modal"/></td>
      <td><img src="./screenshots/edit-totals-modal.png" width="180" alt="Edit Weekly Totals"/></td>
      <td><img src="./screenshots/settings-modal.png" width="180" alt="Settings Modal"/></td>
      <td><img src="./screenshots/import-modal.png" width="180" alt="Import Modal"/></td>
    </tr>
  </table>
</div>

## Core Features

- **MIND Diet Tracking**: Date-specific tracking of MIND Diet food groups with daily and weekly targets
- **Guided Setup**: First-time user wizard for preferences and cloud sync configuration
- **Historical Data**: Complete data archiving with the ability to edit past entries
- **Visual Feedback**: Color coding to highlight when targets are met or limits exceeded
- **Food Information**: Detailed tooltips with serving size examples and guidelines
- **Data Management**: Import/export capabilities for data backup and migration
- **Cloud Sync**: Optional synchronization with Google Drive or Dropbox (server-enabled mode)
- **PWA Features**: Offline functionality, home screen installation, responsive design
- **Privacy-Focused**: Local-first data storage with optional cloud features

## Quick Start

1. **Open the app** in any modern web browser or install it to your home screen as a PWA.
2. **Complete the setup wizard** on first use to configure your week start day and optional cloud sync.
3. Use the **Daily** view to record servings for each food group for a given day. Use the date navigation to select a different date, as needed.
4. Check the **Weekly** view to monitor your progress toward targets.
5. Browse past weeks in the **History** view, and use the *Edit* button to modify daily entries for a past week.

## Architecture Overview

The MIND Diet Tracker is built with a flexible architecture to support different deployment scenarios and user needs:

- **Monorepo Structure**: Organized with separate `client/` and `server/` directories for clear separation of concerns
- **Dual Deployment Modes**: Choose between a client-only deployment or server-enabled deployment
- **Server-Side OAuth**: Secure token management resolves PWA limitations with cloud provider authentication
- **Local-First Design**: All data is stored locally by default, with optional cloud synchronization

### Deployment Modes

**Client-Only Mode** - Perfect for simple hosting:
- Local data storage with import/export capabilities
- Static file hosting (Vercel, Netlify, home servers)
- No server-side components
- Lightweight and fast deployment

**Server-Enabled Mode** - Full feature set:
- Cloud synchronization with Google Drive and Dropbox
- Secure OAuth token management
- Cross-device data synchronization
- Automatic conflict resolution

## Technology Stack

### Client Application
- **Frontend**: HTML5, CSS3, Modern JavaScript (ES6+ Modules)
- **Build System**: Vite for fast development and optimized production builds
- **Data Storage**: IndexedDB for historical data, localStorage for current state
- **PWA Features**: Service Workers for offline caching, Web App Manifest for installation
- **UI Framework**: Vanilla JavaScript with modular component architecture
- **Icons**: Material Design Icons

### Server Component (Optional)
- **Runtime**: Node.js Express server
- **Authentication**: OAuth 2.0 integration for Google Drive and Dropbox
- **APIs**: Google Drive API v3, Dropbox API v2
- **Containerization**: Docker support for easy deployment

### Architecture Pattern
- **Modular Design**: Clear separation between core logic, UI components, cloud providers, and utilities
- **State Management**: Centralized state management with subscription-based UI updates
- **Error Handling**: Comprehensive logging system for debugging and troubleshooting
- **Security**: Server-side token management, no sensitive data in client code

## Installation & Deployment

### Which Deployment Should I Choose?

**Choose Client-Only if:**
- You don't need cloud synchronization between devices
- You prefer not to work with cloud API configuration and OAuth setup
- You want simple static hosting (Vercel, Netlify, NAS devices)

**Choose Server-Enabled if:**
- You want cross-device synchronization (Google Drive or Dropbox)
- You're comfortable with cloud API setup
- You can provide HTTPS hosting (required for OAuth)

### Option 1: Client-Only Deployment

Perfect for static hosting platforms and home servers:

```bash
# Clone and build
git clone https://github.com/NateEaton/mind-pwa.git
cd mind-pwa

# Build client-only version
./deploy-client.sh
```

**Included Features:**
- ✅ Complete MIND Diet tracking
- ✅ Theme selection (light/dark/auto)
- ✅ Local data storage and history
- ✅ Import/export functionality
- ✅ PWA installation and offline use
- ❌ Cloud synchronization (disabled)

**Deployment Methods:**

**Static Hosting Platforms:**
- **Vercel/Netlify**: Build Command: `npm run build`, Output Directory: `client/dist`, Root Directory: `client`
- Files are automatically served from the built `client/dist` directory

**Container Deployment (NAS/Home Server):**
```bash
# Start nginx container serving the built files
./start-client-only.sh
# Access at http://your-server-ip:8080
```

**Traditional Web Server:**
```bash
# The deployment script has already built and copied files to /volume1/web/mind-pwa-deploy/
# Configure your web server to serve files from this directory
# Note: Domain name and HTTPS support required for PWA installation features
```

### Option 2: Server-Enabled Deployment

For full-featured deployment with cloud synchronization:

#### Prerequisites
- Domain name with HTTPS support (required for OAuth callbacks)
- Google and/or Dropbox developer accounts for API credentials
- For container deployment: Docker and Docker Compose
- For traditional deployment: Node.js ≥18.0.0 and web server

#### Environment Configuration
Create a `.env` file in the project root with your domain and OAuth credentials. See the [Installation Guide](../../wiki/Installation-Guide) for detailed setup instructions.

#### Container Deployment (Recommended)

```bash
# Build the application with server features
./deploy-server.sh

# Start containers (nginx + Node.js server)
./start-server.sh
# Access at https://yourdomain.com
```

This sets up:
- Nginx serving client files and proxying OAuth requests
- Node.js server handling OAuth authentication
- Automatic container orchestration

#### Traditional Server Deployment

```bash
# Build the application
./deploy-server.sh

# Install and start the OAuth server
cd server
npm install
npm start &

# Serve client files with your web server
# (The deployment script has already built and copied files to /volume1/web/mind-pwa-deploy/)
```

**Web Server Configuration:** Configure your web server to serve files from `/volume1/web/mind-pwa-deploy/` and proxy OAuth requests to `localhost:3000`. See the [Installation Guide](../../wiki/Installation-Guide) for detailed configuration examples.

For detailed setup instructions including OAuth configuration, see the [Installation Guide](../../wiki/Installation-Guide) in the wiki.

## Cloud Synchronization

Cloud sync allows you to access your MIND Diet data across multiple devices with automatic synchronization and conflict resolution.

### Supported Providers
- **Google Drive**: Data stored in app's private folder (not visible in your Drive)
- **Dropbox**: Data stored in dedicated app folder

### Setting Up Cloud Sync

**During Initial Setup:**
1. Complete the setup wizard when first opening the app
2. Choose "Yes, enable cloud sync" when prompted
3. Select your preferred provider (Google Drive or Dropbox)
4. Complete the OAuth authentication process

**For Existing Users:**
1. Open **Settings** from the app menu
2. Enable "Cloud sync"
3. Select your preferred provider
4. Click "Connect" and complete authentication
5. Your data will automatically sync across devices

### How It Works
- Data is automatically synchronized when the app loads and when changes are made
- Conflicts are resolved using a "last write wins" strategy with user notification
- All synchronization happens in the background with visual status indicators
- You can disconnect cloud sync at any time while keeping your local data

For complete cloud sync documentation, see the [Cloud Sync Guide](../../wiki/Cloud-Sync-Guide) in the wiki.

## Data Privacy & Security

- **Local-First**: All data is stored locally on your device by default
- **Optional Cloud Sync**: Cloud features are entirely optional and user-controlled
- **No Third-Party Data Sharing**: The app never sends data to third parties
- **Secure Authentication**: OAuth tokens are managed server-side, never stored in the client
- **Open Source**: Complete source code is available for review under GPL v3
- **Data Export**: Full data export capability ensures you always control your information

## Development

This project follows modern web development practices with a focus on maintainability and extensibility:

- **Modular Architecture**: Clear separation of concerns across core, UI, cloud, and utility modules
- **Modern JavaScript**: ES6+ features with native module system
- **Build Optimization**: Vite-based build system for fast development and optimized production
- **Container Support**: Docker configuration for consistent deployment environments
- **Comprehensive Documentation**: Detailed wiki covering all aspects of installation and usage

### Contributing

This project is open source and welcomes contributions. See the wiki for development setup instructions and coding guidelines.

### Development Acknowledgments

This project was developed with assistance from AI tools following best practices in modern web development. The underlying concept, architecture decisions, implementation and testing were performed by the developer.

## License

This project is licensed under the GNU General Public License v3.0 - ensuring the software remains free and open for all users.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)