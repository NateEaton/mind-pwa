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
  CLOUD_AUTH: "cloud_auth",
  COMPLETE: "complete",
};

class SetupWizard {
  constructor() {
    this.currentStep = WIZARD_STEPS.WELCOME;
    this.selections = {
      firstDayOfWeek: "Sunday", // Default value
      theme: "auto", // Default to auto theme
      enableCloudSync: false, // Default to false
      cloudSyncCredentials: null, // Store email/password for PocketBase
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

  /**
   * Handle authentication in the wizard
   */
  async handleWizardAuth(action) {
    const email = document.getElementById("wizard-email")?.value?.trim();
    const password = document.getElementById("wizard-password")?.value;
    
    if (!email || !password) {
      this.showWizardAuthError("Please fill in all fields");
      return;
    }
    
    this.setWizardAuthLoading(true);
    this.clearWizardAuthError();
    
    try {
      // Initialize cloud sync if not already done
      if (!this.cloudSync) {
        this.cloudSync = new CloudSyncManager(
          dataService,
          stateManager,
          null, // uiRenderer not needed for basic auth
          () => {}, // onSyncComplete
          (error) => logger.error("Sync error:", error) // onSyncError
        );
        await this.cloudSync.initialize("pocketbase");
      }
      
      let success = false;
      if (action === "signin") {
        success = await this.cloudSync.authenticatePocketbase(email, password);
      } else if (action === "register") {
        // For register, we need a username - use email prefix
        const username = email.split('@')[0];
        success = await this.cloudSync.registerPocketbase(username, email, password);
      }
      
      if (success) {
        this.selections.cloudSyncCredentials = {
          email: email,
          authenticated: true
        };
        this.selections.cloudSyncUserInfo = {
          email: email,
          provider: "PocketBase",
          type: action
        };
        
        this.showWizardAuthSuccess(`Successfully ${action === 'signin' ? 'signed in' : 'registered'}!`);
        
        // Auto-advance to completion step after successful auth
        setTimeout(() => {
          this.currentStep = WIZARD_STEPS.COMPLETE;
          this.renderCurrentStep();
        }, 1500);
      }
    } catch (error) {
      logger.error(`PocketBase ${action} error:`, error);
      let errorMessage = error.message || `${action} failed. Please try again.`;
      
      // Handle specific error types
      if (error?.data?.data) {
        const fieldErrors = Object.entries(error.data.data);
        if (fieldErrors.length > 0) {
          const [field, details] = fieldErrors[0];
          errorMessage = `${field.charAt(0).toUpperCase() + field.slice(1)}: ${details.message}`;
        }
      }
      
      this.showWizardAuthError(errorMessage);
    } finally {
      this.setWizardAuthLoading(false);
    }
  }
  
  /**
   * Show authentication error in wizard
   */
  showWizardAuthError(message) {
    const statusElement = document.getElementById("wizard-auth-status");
    const messageElement = statusElement?.querySelector(".status-message");
    
    if (statusElement && messageElement) {
      messageElement.textContent = message;
      statusElement.className = "auth-status error";
      statusElement.classList.remove("hidden");
    }
  }
  
  /**
   * Show authentication success in wizard
   */
  showWizardAuthSuccess(message) {
    const statusElement = document.getElementById("wizard-auth-status");
    const messageElement = statusElement?.querySelector(".status-message");
    
    if (statusElement && messageElement) {
      messageElement.textContent = message;
      statusElement.className = "auth-status success";
      statusElement.classList.remove("hidden");
    }
  }
  
  /**
   * Clear authentication error in wizard
   */
  clearWizardAuthError() {
    const statusElement = document.getElementById("wizard-auth-status");
    if (statusElement) {
      statusElement.classList.add("hidden");
    }
  }
  
  /**
   * Set loading state for authentication buttons
   */
  setWizardAuthLoading(loading) {
    const signinBtn = document.getElementById("wizard-signin-btn");
    const registerBtn = document.getElementById("wizard-register-btn");
    
    [signinBtn, registerBtn].forEach(btn => {
      if (btn) {
        btn.disabled = loading;
        btn.textContent = loading ? "..." : (btn.id.includes("signin") ? "Sign In" : "Create Account");
      }
    });
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
      case WIZARD_STEPS.CLOUD_AUTH:
        content = this.renderCloudAuthStep();
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
            <li>Real-time synchronization</li>
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
        <div class="wizard-progress">Step 3 of ${this.selections.enableCloudSync ? '4' : '3'}</div>
        <div class="wizard-buttons">
          <button id="cloud-sync-back-btn" class="secondary-btn">Back</button>
          <button id="cloud-sync-next-btn" class="primary-btn">Continue</button>
        </div>
      </div>
    `;
  }

  renderCloudAuthStep() {
    return `
      <div class="wizard-header">
        <h2>Sign In to Cloud Sync</h2>
      </div>
      <div class="wizard-content">
        <div class="wizard-step">
          <p>Sign in to your account to start syncing your data across devices.</p>
          
          <div class="auth-form">
            <div class="form-group">
              <label for="wizard-email">Email</label>
              <input type="email" id="wizard-email" name="email" required autocomplete="username"
                value="${this.selections.cloudSyncCredentials?.email || ''}">
            </div>
            <div class="form-group">
              <label for="wizard-password">Password</label>
              <input type="password" id="wizard-password" name="password" required autocomplete="current-password"
                value="${this.selections.cloudSyncCredentials?.password || ''}">
            </div>
            <div class="auth-actions">
              <button type="button" id="wizard-signin-btn" class="auth-btn primary">Sign In</button>
            </div>
            <div class="auth-actions secondary">
              <button type="button" id="wizard-register-btn" class="auth-btn secondary">Create Account</button>
            </div>
            <div class="auth-status hidden" id="wizard-auth-status">
              <span class="status-message"></span>
            </div>
          </div>
          
          <div class="wizard-note">
            <p>Don't have an account? Click "Create Account" to register a new account.</p>
          </div>
        </div>
      </div>
      <div class="wizard-footer">
        <div class="wizard-progress">Step 4 of 4</div>
        <div class="wizard-buttons">
          <button id="cloud-auth-back-btn" class="secondary-btn">Back</button>
        </div>
      </div>
    `;
  }

  renderCompleteStep() {
    const cloudSyncEnabled = this.selections.enableCloudSync;
    const cloudSyncAuthenticated = this.selections.cloudSyncCredentials?.authenticated;
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
        <div class="setup-info">
          <span class="info-icon">ℹ️</span>
          <div class="info-details">
            <strong>Cloud sync enabled</strong>
            <br><small>Sign in from Settings to start syncing your data</small>
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
              // Save the provider preference
              await dataService.savePreference("cloudSyncProvider", "pocketbase");
              // Move to authentication step
              this.currentStep = WIZARD_STEPS.CLOUD_AUTH;
            } else {
              // Skip to complete if cloud sync disabled
              this.currentStep = WIZARD_STEPS.COMPLETE;
            }
            this.renderCurrentStep();
          });
        break;

      case WIZARD_STEPS.CLOUD_AUTH:
        document
          .getElementById("cloud-auth-back-btn")
          ?.addEventListener("click", () => {
            this.currentStep = WIZARD_STEPS.CLOUD_SYNC;
            this.renderCurrentStep();
          });

        
        // Handle sign in button
        document.getElementById("wizard-signin-btn")?.addEventListener("click", async () => {
          await this.handleWizardAuth("signin");
        });
        
        // Handle register button  
        document.getElementById("wizard-register-btn")?.addEventListener("click", async () => {
          await this.handleWizardAuth("register");
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
              await dataService.savePreference("cloudSyncProvider", "pocketbase");
              this.currentStep = WIZARD_STEPS.CLOUD_AUTH;
            } else {
              this.currentStep = WIZARD_STEPS.COMPLETE;
            }
            this.renderCurrentStep();
          });
        break;

      case WIZARD_STEPS.CLOUD_AUTH:
        // Enter key on auth step doesn't do anything special
        // User needs to click Sign In or Register buttons
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

      case WIZARD_STEPS.CLOUD_AUTH:
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
