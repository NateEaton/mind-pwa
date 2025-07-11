/*
 * MIND Diet Tracker PWA
 * Copyright (C) 2025 Nathan A. Eaton Jr.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import dataService from "./dataService.js";
import stateManager from "./stateManager.js";
import { createLogger } from "./logger.js";
import { PocketbaseAuthModal } from "../auth/pocketbaseAuthModal.js";
import CloudSyncManager from "../cloudSync/cloudSync.js";

// Check if PocketBase is enabled at build time
const POCKETBASE_ENABLED = typeof __POCKETBASE_ENABLED__ !== 'undefined' ? __POCKETBASE_ENABLED__ : false;

const logger = createLogger("setupWizard");

// Wizard step definitions
const WIZARD_STEPS = {
  WELCOME: "welcome",
  FIRST_DAY: "first_day",
  APPEARANCE: "appearance",
  CLOUD_SYNC: "cloud_sync",
  CLOUD_PROVIDER: "cloud_provider",
  COMPLETE: "complete",
};

class SetupWizard {
  constructor() {
    this.currentStep = WIZARD_STEPS.WELCOME;
    this.selections = {
      firstDayOfWeek: "Sunday", // Default value
      theme: "auto", // Default to auto theme
      enableCloudSync: false, // Default to false
      cloudSyncProvider: null, // New field for provider selection
    };
    this.modalElement = null;
    this.contentElement = null;
    this.initialized = false;
    this.resumeState = null; // For handling OAuth redirect state
  }

  async initialize() {
    if (this.initialized) return;

    // Create modal container if it doesn't exist
    this.modalElement = document.createElement("div");
    this.modalElement.id = "setup-wizard-modal";
    this.modalElement.className = "modal setup-wizard-modal";

    // Create modal content container
    this.contentElement = document.createElement("div");
    this.contentElement.className = "modal-content setup-wizard-content";
    this.modalElement.appendChild(this.contentElement);

    // Add modal to document
    document.body.appendChild(this.modalElement);

    // Add keyboard navigation
    this.setupKeyboardNavigation();

    this.initialized = true;
  }

  async initiatePocketbaseAuth() {
    // Store wizard state so we can resume after authentication
    localStorage.setItem(
      "setupWizardState",
      JSON.stringify({
        isActive: true,
        selections: this.selections,
      })
    );

    // Initialize cloud sync with PocketBase provider
    const cloudSync = new CloudSyncManager(
      dataService,
      stateManager,
      null, // uiRenderer not needed for basic auth
      () => {}, // onSyncComplete
      (error) => logger.error("Sync error:", error) // onSyncError
    );

    try {
      const initResult = await cloudSync.initialize("pocketbase");

      if (!initResult) {
        this.showError("Failed to initialize PocketBase connection");
        return;
      }

      // Show PocketBase authentication modal
      const authModal = new PocketbaseAuthModal(
        cloudSync,
        async (authResult) => {
          // Success callback
          logger.info(
            "PocketBase authentication successful in wizard:",
            authResult
          );

          // Save authentication state
          this.selections.cloudSyncAuthenticated = true;
          this.selections.cloudSyncUserInfo = {
            email: authResult.email,
            provider: "PocketBase",
            type: authResult.type,
          };

          // Store cloud sync instance for the rest of the app
          if (typeof setCloudSyncState === "function") {
            setCloudSyncState(cloudSync);
          }

          // Continue to completion step
          this.currentStep = WIZARD_STEPS.COMPLETE;
          this.renderCurrentStep();
        },
        () => {
          // Cancel callback
          logger.info("PocketBase authentication cancelled in wizard");
          // Stay on current step, user can try again
        }
      );

      authModal.show("signin");
    } catch (error) {
      logger.error("Failed to initialize PocketBase in wizard:", error);
      this.showError("Failed to connect to PocketBase: " + error.message);
    }
  }

  async start() {
    await this.initialize();

    // Check for OAuth return state
    if (localStorage.getItem("pendingWizardContinuation")) {
      logger.info(
        "Setup wizard: Detected pendingWizardContinuation, resuming from OAuth redirect"
      );
      localStorage.removeItem("pendingWizardContinuation");
      this.currentStep = WIZARD_STEPS.COMPLETE;

      // Restore selections if needed
      const savedState = localStorage.getItem("setupWizardState");
      if (savedState) {
        const state = JSON.parse(savedState);
        this.selections = state.selections;
        localStorage.removeItem("setupWizardState");
        logger.info(
          "Setup wizard: Restored selections from saved state",
          this.selections
        );
      } else {
        logger.warn(
          "Setup wizard: No saved state found for OAuth continuation"
        );
      }
    } else {
      logger.info("Setup wizard: Starting fresh wizard flow");
      this.currentStep = WIZARD_STEPS.WELCOME;
    }

    await this.renderCurrentStep();
    this.show();
  }

  show() {
    if (this.modalElement) {
      this.modalElement.classList.add("modal-open");
      // Focus the modal to capture keyboard events
      this.modalElement.focus();
    }
  }

  hide() {
    if (this.modalElement) {
      this.modalElement.classList.remove("modal-open");
    }
  }

  async renderCurrentStep() {
    if (!this.contentElement) return;

    let content = "";
    switch (this.currentStep) {
      case WIZARD_STEPS.WELCOME:
        content = this.renderWelcomeStep();
        break;
      case WIZARD_STEPS.FIRST_DAY:
        content = this.renderFirstDayStep();
        break;
      case WIZARD_STEPS.APPEARANCE:
        content = this.renderAppearanceStep();
        break;
      case WIZARD_STEPS.CLOUD_SYNC:
        if (POCKETBASE_ENABLED) {
          content = this.renderCloudSyncStep();
        } else {
          // Skip to complete if PocketBase is disabled
          this.currentStep = WIZARD_STEPS.COMPLETE;
          content = await this.renderCompleteStep();
        }
        break;
      case WIZARD_STEPS.CLOUD_PROVIDER:
        if (POCKETBASE_ENABLED) {
          content = this.renderCloudProviderStep();
        } else {
          // Skip to complete if PocketBase is disabled
          this.currentStep = WIZARD_STEPS.COMPLETE;
          content = await this.renderCompleteStep();
        }
        break;
      case WIZARD_STEPS.COMPLETE:
        content = await this.renderCompleteStep();
        break;
    }

    if (content) {
      this.contentElement.innerHTML = content;
      await this.setupStepEventListeners();
    }
  }

  renderWelcomeStep() {
    return `
      <div class="wizard-header">
        <h2>Welcome to MIND Diet Tracker</h2>
      </div>
      <div class="wizard-content">
        <div class="wizard-step">
          <p>Let's take a moment to set up your preferences for the best experience.</p>
        </div>
      </div>
      <div class="wizard-footer">
        <div class="wizard-buttons">
          <div></div>
          <button id="welcome-next-btn" class="primary-btn">Get Started</button>
        </div>
      </div>
    `;
  }

  renderFirstDayStep() {
    const totalSteps = POCKETBASE_ENABLED ? 3 : 2;
    return `
      <div class="wizard-header">
        <h2>First Day of Week</h2>
      </div>
      <div class="wizard-content">
        <div class="wizard-step">
          <p>Choose which day you'd like your week to start on. This affects how your weekly tracking is organized.</p>
          <div class="wizard-form">
            <div class="radio-group">
              <label>
                <input type="radio" name="firstDay" value="Sunday" 
                  ${
                    this.selections.firstDayOfWeek === "Sunday" ? "checked" : ""
                  }>
                <span>Sunday</span>
              </label>
              <label>
                <input type="radio" name="firstDay" value="Monday"
                  ${
                    this.selections.firstDayOfWeek === "Monday" ? "checked" : ""
                  }>
                <span>Monday</span>
              </label>
            </div>
          </div>
          <div class="wizard-warning">
            <p><strong>Important:</strong> If you've used this app on other devices, ensure this setting matches. 
            Mismatches can affect how historical data is interpreted.</p>
          </div>
        </div>
      </div>
      <div class="wizard-footer">
        <div class="wizard-progress">Step 1 of ${totalSteps}</div>
        <div class="wizard-buttons">
          <button id="first-day-back-btn" class="secondary-btn">Back</button>
          <button id="first-day-next-btn" class="primary-btn">Continue</button>
        </div>
      </div>
    `;
  }

  renderAppearanceStep() {
    const totalSteps = POCKETBASE_ENABLED ? 3 : 2;
    const nextStep = POCKETBASE_ENABLED ? "Continue" : "Finish";
    return `
      <div class="wizard-header">
        <h2>Appearance</h2>
      </div>
      <div class="wizard-content">
        <div class="wizard-step">
          <p>Choose your preferred theme for the app.</p>
          
          <div class="wizard-form">
            <div class="radio-group">
              <label>
                <input type="radio" name="theme" value="light" 
                  ${this.selections.theme === "light" ? "checked" : ""}>
                <span>Light Theme</span>
              </label>
              <label>
                <input type="radio" name="theme" value="dark" 
                  ${this.selections.theme === "dark" ? "checked" : ""}>
                <span>Dark Theme</span>
              </label>
              <label>
                <input type="radio" name="theme" value="auto" 
                  ${this.selections.theme === "auto" ? "checked" : ""}>
                <span>Auto (Follow System)</span>
              </label>
            </div>
          </div>

          <div class="wizard-note">
            <p>You can change this setting anytime from the settings menu.</p>
          </div>
        </div>
      </div>
      <div class="wizard-footer">
        <div class="wizard-progress">Step 2 of ${totalSteps}</div>
        <div class="wizard-buttons">
          <button id="appearance-back-btn" class="secondary-btn">Back</button>
          <button id="appearance-next-btn" class="primary-btn">${nextStep}</button>
        </div>
      </div>
    `;
  }

  renderCloudSyncStep() {
    return `
      <div class="wizard-header">
        <h2>Cloud Sync</h2>
      </div>
      <div class="wizard-content">
        <div class="wizard-step">
          <p>Would you like to enable cloud sync? This allows you to:</p>
          <ul class="wizard-list">
            <li>Access your data across multiple devices</li>
            <li>Keep your data backed up securely</li>
          </ul>
          <div class="wizard-form">
            <div class="radio-group">
              <label>
                <input type="radio" name="cloudSync" value="true"
                  ${this.selections.enableCloudSync ? "checked" : ""}>
                <span>Yes, enable cloud sync</span>
              </label>
              <label>
                <input type="radio" name="cloudSync" value="false"
                  ${!this.selections.enableCloudSync ? "checked" : ""}>
                <span>No, keep my data local only</span>
              </label>
            </div>
          </div>
          <div class="wizard-note">
            <p>You can always enable cloud sync later from the settings menu.</p>
          </div>
        </div>
      </div>
      <div class="wizard-footer">
        <div class="wizard-progress">Step 3 of ${
          this.selections.enableCloudSync ? "4" : "3"
        }</div>
        <div class="wizard-buttons">
          <button id="cloud-sync-back-btn" class="secondary-btn">Back</button>
          <button id="cloud-sync-next-btn" class="primary-btn">Continue</button>
        </div>
      </div>
    `;
  }

  renderCloudProviderStep() {
    return `
    <div class="wizard-step" id="cloud-provider-step">
      <div class="step-header">
        <h2>Choose Cloud Provider</h2>
        <p>Select your preferred cloud storage provider for syncing your data across devices.</p>
      </div>
      
      <div class="provider-options">
        <div class="provider-option">
          <input type="radio" id="provider-gdrive" name="cloudProvider" value="gdrive">
          <label for="provider-gdrive" class="provider-card">
            <div class="provider-icon">📗</div>
            <div class="provider-details">
              <h3>Google Drive</h3>
              <p>Sync with your Google Drive account. Data is stored in a private app folder.</p>
              <ul class="provider-features">
                <li>✓ Automatic OAuth authentication</li>
                <li>✓ Data stored securely in Google Drive</li>
                <li>✓ Works across all your devices</li>
              </ul>
            </div>
          </label>
        </div>

        <div class="provider-option">
          <input type="radio" id="provider-dropbox" name="cloudProvider" value="dropbox">
          <label for="provider-dropbox" class="provider-card">
            <div class="provider-icon">📘</div>
            <div class="provider-details">
              <h3>Dropbox</h3>
              <p>Sync with your Dropbox account. Data is stored in a dedicated app folder.</p>
              <ul class="provider-features">
                <li>✓ Automatic OAuth authentication</li>
                <li>✓ Data stored securely in Dropbox</li>
                <li>✓ Works across all your devices</li>
              </ul>
            </div>
          </label>
        </div>

        ${
          import.meta.env.VITE_POCKETBASE_ENABLED === "true"
            ? `
        <div class="provider-option">
          <input type="radio" id="provider-pocketbase" name="cloudProvider" value="pocketbase">
          <label for="provider-pocketbase" class="provider-card">
            <div class="provider-icon">🗄️</div>
            <div class="provider-details">
              <h3>PocketBase</h3>
              <p>Real-time sync with your own PocketBase server. Fast and private.</p>
              <ul class="provider-features">
                <li>✓ Real-time synchronization</li>
                <li>✓ Offline support with auto-sync</li>
                <li>✓ Email/password authentication</li>
                <li>✓ Self-hosted privacy</li>
              </ul>
            </div>
          </label>
        </div>
        `
            : ""
        }
      </div>

      <div class="step-actions">
        <button class="btn-secondary" id="cloud-provider-back-btn">Back</button>
        <button class="btn-primary" id="cloud-provider-connect-btn" disabled>Connect</button>
      </div>
    </div>
  `;
  }

  renderCompleteStep() {
    const cloudSyncEnabled = this.selections.enableCloudSync;
    const cloudSyncAuthenticated = this.selections.cloudSyncAuthenticated;
    const userInfo = this.selections.cloudSyncUserInfo;

    let cloudSyncStatus = "";
    if (cloudSyncEnabled) {
      if (cloudSyncAuthenticated && userInfo) {
        cloudSyncStatus = `
        <div class="setup-success">
          <span class="success-icon">✅</span>
          <div class="success-details">
            <strong>Successfully connected to ${userInfo.provider}!</strong>
            <br><small>Account: ${userInfo.email}</small>
            ${
              userInfo.type === "register"
                ? "<br><small>New account created</small>"
                : ""
            }
          </div>
        </div>
      `;
      } else {
        cloudSyncStatus = `
        <div class="setup-warning">
          <span class="warning-icon">⚠️</span>
          <div class="warning-details">
            <strong>Cloud sync setup was not completed</strong>
            <br><small>You can finish setup later from Settings</small>
          </div>
        </div>
      `;
      }
    } else {
      cloudSyncStatus = `
      <div class="setup-info">
        <span class="info-icon">ℹ️</span>
        <div class="info-details">
          <strong>Cloud sync disabled</strong>
          <br><small>Your data will be stored locally only</small>
        </div>
      </div>
    `;
    }

    return `
    <div class="wizard-step" id="complete-step">
      <div class="step-header">
        <h2>Setup Complete!</h2>
        <p>Your MIND Diet Tracker is ready to use.</p>
      </div>
      
      <div class="setup-summary">
        <div class="summary-item">
          <strong>Week starts on:</strong> ${
            this.selections.firstDayOfWeek === "Monday" ? "Monday" : "Sunday"
          }
        </div>
        
        <div class="summary-item">
          <strong>Theme:</strong> ${this.capitalizeFirst(this.selections.theme)}
        </div>
        
        <div class="summary-item">
          <strong>Cloud sync:</strong>
          ${cloudSyncStatus}
        </div>
      </div>

      ${
        cloudSyncEnabled && cloudSyncAuthenticated
          ? `
        <div class="next-steps">
          <h3>What happens next?</h3>
          <ul>
            <li>Your data will automatically sync across all your devices</li>
            <li>Changes are saved in real-time</li>
            <li>You can manage sync settings anytime from the Settings menu</li>
          </ul>
        </div>
      `
          : ""
      }

      <div class="step-actions">
        <button class="btn-primary" id="complete-finish-btn">Start Using App</button>
      </div>
    </div>
  `;
  }

  async verifyCloudConnection() {
    // If we reach this point, the OAuth flow was successful
    // The actual connection verification happens during app initialization
    return true;
  }

  setupStepEventListeners() {
    switch (this.currentStep) {
      case WIZARD_STEPS.WELCOME:
        document
          .getElementById("welcome-next-btn")
          ?.addEventListener("click", () => {
            this.currentStep = WIZARD_STEPS.FIRST_DAY;
            this.renderCurrentStep();
          });
        break;

      case WIZARD_STEPS.FIRST_DAY:
        document
          .getElementById("first-day-back-btn")
          ?.addEventListener("click", () => {
            this.currentStep = WIZARD_STEPS.WELCOME;
            this.renderCurrentStep();
          });

        document
          .getElementById("first-day-next-btn")
          ?.addEventListener("click", () => {
            const selectedDay = document.querySelector(
              'input[name="firstDay"]:checked'
            )?.value;
            if (selectedDay) {
              this.selections.firstDayOfWeek = selectedDay;
              this.currentStep = WIZARD_STEPS.APPEARANCE;
              this.renderCurrentStep();
            }
          });
        break;

      case WIZARD_STEPS.APPEARANCE:
        document
          .getElementById("appearance-back-btn")
          ?.addEventListener("click", () => {
            this.currentStep = WIZARD_STEPS.FIRST_DAY;
            this.renderCurrentStep();
          });

        document
          .getElementById("appearance-next-btn")
          ?.addEventListener("click", () => {
            const selectedTheme = document.querySelector(
              'input[name="theme"]:checked'
            )?.value;
            if (selectedTheme) {
              this.selections.theme = selectedTheme;
              if (POCKETBASE_ENABLED) {
                this.currentStep = WIZARD_STEPS.CLOUD_SYNC;
              } else {
                this.selections.enableCloudSync = false;
                this.currentStep = WIZARD_STEPS.COMPLETE;
              }
              this.renderCurrentStep();
            }
          });
        break;

      case WIZARD_STEPS.CLOUD_SYNC:
        document
          .getElementById("cloud-sync-back-btn")
          ?.addEventListener("click", () => {
            this.currentStep = WIZARD_STEPS.APPEARANCE;
            this.renderCurrentStep();
          });

        document
          .getElementById("cloud-sync-next-btn")
          ?.addEventListener("click", async () => {
            const enableSync =
              document.querySelector('input[name="cloudSync"]:checked')
                ?.value === "true";
            this.selections.enableCloudSync = enableSync;
            if (enableSync) {
              // Skip provider selection - go directly to PocketBase auth
              this.selections.cloudSyncProvider = "pocketbase";
              await dataService.savePreference("cloudSyncProvider", "pocketbase");
              await this.initiatePocketbaseAuth();
            } else {
              this.currentStep = WIZARD_STEPS.COMPLETE;
              this.renderCurrentStep();
            }
          });
        break;

      case WIZARD_STEPS.CLOUD_PROVIDER:
        document
          .getElementById("cloud-provider-back-btn")
          ?.addEventListener("click", () => {
            this.currentStep = WIZARD_STEPS.CLOUD_SYNC;
            this.renderCurrentStep();
          });

        document
          .getElementById("cloud-provider-connect-btn")
          ?.addEventListener("click", async () => {
            const provider = document.querySelector(
              'input[name="cloudProvider"]:checked'
            )?.value;
            if (provider) {
              this.selections.cloudSyncProvider = provider;
              await dataService.savePreference("cloudSyncProvider", provider);

              if (provider === "pocketbase") {
                await this.initiatePocketbaseAuth();
              } else {
                await this.initiateOAuthFlow(provider);
              }
            }
          });

        // Radio button change
        document
          .querySelectorAll('input[name="cloudProvider"]')
          .forEach((radio) => {
            radio.addEventListener("change", (e) => {
              this.selections.cloudSyncProvider = e.target.value;
              const connectBtn = document.getElementById(
                "cloud-provider-connect-btn"
              );
              if (connectBtn) {
                connectBtn.disabled = false;

                // Update button text based on provider
                if (e.target.value === "pocketbase") {
                  connectBtn.textContent = "Sign In";
                } else {
                  connectBtn.textContent = "Connect";
                }
              }
            });
          });
        break;

      case WIZARD_STEPS.COMPLETE:
        document
          .getElementById("complete-finish-btn")
          ?.addEventListener("click", async () => {
            await this.finish();
          });
        break;
    }
  }

  async initiateOAuthFlow(provider) {
    const state = {
      wizardContext: "cloudProviderConnect",
      originalStep: "cloud_provider",
    };
    // Store wizard state so we can resume after the redirect
    localStorage.setItem(
      "setupWizardState",
      JSON.stringify({
        isActive: true,
        selections: this.selections,
      })
    );

    const stateParam = btoa(JSON.stringify(state));
    // Pass state parameter to server for proper OAuth flow identification

    if (provider === "dropbox") {
      window.location.href = `/api/dropbox/auth?state=${encodeURIComponent(
        stateParam
      )}`;
    } else if (provider === "gdrive") {
      window.location.href = `/api/gdrive/auth?state=${encodeURIComponent(
        stateParam
      )}`;
    }
  }

  async finish() {
    try {
      // Save all preferences
      await dataService.savePreference(
        "firstDayOfWeek",
        this.selections.firstDayOfWeek
      );
      await dataService.savePreference("appearanceTheme", this.selections.theme);
      await dataService.savePreference(
        "cloudSyncEnabled",
        this.selections.enableCloudSync
      );

      if (this.selections.enableCloudSync) {
        await dataService.savePreference(
          "cloudSyncProvider",
          this.selections.cloudSyncProvider
        );
      }

      // Mark setup as completed
      await dataService.savePreference("initialSetupCompleted", true);

      // Clear wizard state
      localStorage.removeItem("setupWizardState");

      // Hide wizard
      this.hide();

      // Dispatch an event to notify app.js that the wizard is complete.
      // This will trigger the event listener in app.js to call completeAppInitialization.
      window.dispatchEvent(
        new CustomEvent("setupWizardComplete", {
          detail: { selections: this.selections },
        })
      );

      logger.info("Setup wizard completed successfully", this.selections);
    } catch (error) {
      logger.error("Error completing setup wizard:", error);
      this.showError("Failed to save settings. Please try again.");
    }
  }

  setupKeyboardNavigation() {
    // Add keyboard event listener to the modal
    this.modalElement.addEventListener("keydown", (event) => {
      // Only handle keyboard navigation when the modal is open
      if (!this.modalElement.classList.contains("modal-open")) {
        return;
      }

      // Prevent default behavior for navigation keys
      if (event.key === "Enter" || event.key === "Backspace") {
        event.preventDefault();
      }

      // Handle Enter key to advance
      if (event.key === "Enter") {
        this.handleNextStep();
      }

      // Handle Backspace key to go back
      if (event.key === "Backspace") {
        this.handlePreviousStep();
      }
    });

    // Make the modal focusable for keyboard events
    this.modalElement.setAttribute("tabindex", "-1");
  }

  handleNextStep() {
    switch (this.currentStep) {
      case WIZARD_STEPS.WELCOME:
        this.currentStep = WIZARD_STEPS.FIRST_DAY;
        this.renderCurrentStep();
        break;

      case WIZARD_STEPS.FIRST_DAY:
        const selectedDay = document.querySelector(
          'input[name="firstDay"]:checked'
        )?.value;
        if (selectedDay) {
          this.selections.firstDayOfWeek = selectedDay;
          dataService.savePreference("weekStartDay", selectedDay).then(() => {
            this.currentStep = WIZARD_STEPS.APPEARANCE;
            this.renderCurrentStep();
          });
        }
        break;

      case WIZARD_STEPS.APPEARANCE:
        const selectedTheme = document.querySelector(
          'input[name="theme"]:checked'
        )?.value;
        if (selectedTheme) {
          this.selections.theme = selectedTheme;
          dataService.savePreference("theme", selectedTheme).then(() => {
            if (POCKETBASE_ENABLED) {
              this.currentStep = WIZARD_STEPS.CLOUD_SYNC;
            } else {
              this.selections.enableCloudSync = false;
              this.currentStep = WIZARD_STEPS.COMPLETE;
            }
            this.renderCurrentStep();
          });
        }
        break;

      case WIZARD_STEPS.CLOUD_SYNC:
        const enableSync =
          document.querySelector('input[name="cloudSync"]:checked')?.value ===
          "true";
        this.selections.enableCloudSync = enableSync;
        dataService
          .savePreference("cloudSyncEnabled", enableSync)
          .then(async () => {
            if (enableSync) {
              // Skip provider selection - go directly to PocketBase auth
              this.selections.cloudSyncProvider = "pocketbase";
              await dataService.savePreference("cloudSyncProvider", "pocketbase");
              await this.initiatePocketbaseAuth();
            } else {
              this.currentStep = WIZARD_STEPS.COMPLETE;
              this.renderCurrentStep();
            }
          });
        break;

      case WIZARD_STEPS.CLOUD_PROVIDER:
        const provider = document.querySelector(
          'input[name="cloudProvider"]:checked'
        )?.value;
        if (provider) {
          this.selections.cloudSyncProvider = provider;
          dataService
            .savePreference("cloudSyncProvider", provider)
            .then(() => {
              if (provider === "pocketbase") {
                this.initiatePocketbaseAuth();
              } else {
                this.initiateOAuthFlow(provider);
              }
            });
        }
        break;

      case WIZARD_STEPS.COMPLETE:
        this.finish();
        break;
    }
  }

  handlePreviousStep() {
    switch (this.currentStep) {
      case WIZARD_STEPS.FIRST_DAY:
        this.currentStep = WIZARD_STEPS.WELCOME;
        this.renderCurrentStep();
        break;

      case WIZARD_STEPS.APPEARANCE:
        this.currentStep = WIZARD_STEPS.FIRST_DAY;
        this.renderCurrentStep();
        break;

      case WIZARD_STEPS.CLOUD_SYNC:
        this.currentStep = WIZARD_STEPS.APPEARANCE;
        this.renderCurrentStep();
        break;

      case WIZARD_STEPS.CLOUD_PROVIDER:
        this.currentStep = WIZARD_STEPS.CLOUD_SYNC;
        this.renderCurrentStep();
        break;

      // No back action for WELCOME and COMPLETE steps
      case WIZARD_STEPS.WELCOME:
      case WIZARD_STEPS.COMPLETE:
        break;
    }
  }

  /**
   * Show error message in wizard
   */
  showError(message) {
    // Remove any existing error
    const existingError = document.querySelector(".wizard-error");
    if (existingError) {
      existingError.remove();
    }

    // Add new error message
    const stepContent = document.querySelector(".wizard-step");
    if (stepContent) {
      const errorHtml = `
      <div class="wizard-error">
        <span class="error-icon">❌</span>
        <span class="error-message">${message}</span>
      </div>
    `;
      stepContent.insertAdjacentHTML("afterbegin", errorHtml);
    }
  }

  /**
   * Helper method to capitalize first letter
   */
  capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

export default new SetupWizard();
