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
import cloudSync from "./cloudSync.js";
import GoogleDriveProvider from "./cloudProviders/googleDriveProvider.js";
import DropboxProvider from "./cloudProviders/dropboxProvider.js";

const logger = createLogger("setupWizard");

// Wizard step definitions
const WIZARD_STEPS = {
  WELCOME: "welcome",
  FIRST_DAY: "first_day",
  CLOUD_SYNC: "cloud_sync",
  CLOUD_PROVIDER: "cloud_provider",
  COMPLETE: "complete",
};

class SetupWizard {
  constructor() {
    this.currentStep = WIZARD_STEPS.WELCOME;
    this.selections = {
      firstDayOfWeek: "Sunday", // Default value
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

    this.initialized = true;
  }

  async start() {
    await this.initialize();

    // Check for OAuth return state
    if (localStorage.getItem("pendingWizardContinuation")) {
      localStorage.removeItem("pendingWizardContinuation");
      this.currentStep = WIZARD_STEPS.COMPLETE;

      // Restore selections if needed
      const savedState = localStorage.getItem("setupWizardState");
      if (savedState) {
        const state = JSON.parse(savedState);
        this.selections = state.selections;
        localStorage.removeItem("setupWizardState");
      }
    } else {
      this.currentStep = WIZARD_STEPS.WELCOME;
    }

    await this.renderCurrentStep();
    this.show();
  }

  show() {
    if (this.modalElement) {
      this.modalElement.classList.add("modal-open");
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
      case WIZARD_STEPS.CLOUD_SYNC:
        content = this.renderCloudSyncStep();
        break;
      case WIZARD_STEPS.CLOUD_PROVIDER:
        content = this.renderCloudProviderStep();
        break;
      case WIZARD_STEPS.COMPLETE:
        content = await this.renderCompleteStep();
        break;
    }

    if (content) {
      this.contentElement.innerHTML = content;
      await this.attachStepEventListeners();
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
        <div class="wizard-progress">Step 1 of 3</div>
        <div class="wizard-buttons">
          <div></div>
          <button id="welcome-next-btn" class="primary-btn">Get Started</button>
        </div>
      </div>
    `;
  }

  renderFirstDayStep() {
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
        <div class="wizard-progress">Step 2 of 3</div>
        <div class="wizard-buttons">
          <button id="first-day-back-btn" class="secondary-btn">Back</button>
          <button id="first-day-next-btn" class="primary-btn">Continue</button>
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
      <div class="wizard-header">
        <h2>Choose Cloud Provider</h2>
      </div>
      <div class="wizard-content">
        <div class="wizard-step">
          <p>Select the cloud provider you'd like to connect to:</p>
          <div class="wizard-form">
            <div class="radio-group">
              <label>
                <input type="radio" name="cloudProvider" value="gdrive"
                  ${
                    this.selections.cloudSyncProvider === "gdrive"
                      ? "checked"
                      : ""
                  }>
                <span>Google Drive</span>
              </label>
              <label>
                <input type="radio" name="cloudProvider" value="dropbox"
                  ${
                    this.selections.cloudSyncProvider === "dropbox"
                      ? "checked"
                      : ""
                  }>
                <span>Dropbox</span>
              </label>
            </div>
          </div>
          <div class="wizard-note">
            <p><strong>Note:</strong> If you've used this app on another device and synced data to the cloud, your existing data will be downloaded to this device on first sync.</p>
          </div>
        </div>
      </div>
      <div class="wizard-footer">
        <div class="wizard-progress">Step 4 of 4</div>
        <div class="wizard-buttons">
          <button id="cloud-provider-back-btn" class="secondary-btn">Back</button>
          <button id="cloud-provider-connect-btn" class="primary-btn">Connect</button>
        </div>
      </div>
    `;
  }

  async renderCompleteStep() {
    let syncMessage = "";

    if (this.selections.enableCloudSync) {
      if (this.selections.cloudSyncProvider) {
        // Check connection status
        try {
          const isConnected = await this.verifyCloudConnection();
          syncMessage = isConnected
            ? `Successfully connected to ${
                this.selections.cloudSyncProvider === "gdrive"
                  ? "Google Drive"
                  : "Dropbox"
              }!`
            : `Failed to connect to ${
                this.selections.cloudSyncProvider === "gdrive"
                  ? "Google Drive"
                  : "Dropbox"
              }. You can try again later from Settings.`;
        } catch (error) {
          logger.error("Error verifying cloud connection:", error);
          syncMessage =
            "There was an error verifying the cloud connection. You can try again from Settings.";
        }
      } else {
        syncMessage =
          "Cloud sync setup was not completed. You can finish setting it up from Settings.";
      }
    } else {
      syncMessage = "You can enable cloud sync anytime from the settings menu.";
    }

    return `
      <div class="wizard-header">
        <h2>Setup Complete!</h2>
      </div>
      <div class="wizard-content">
        <div class="wizard-step">
          <p>Your preferences have been saved. You're ready to start tracking your MIND diet journey.</p>
          <div class="sync-status ${
            this.selections.enableCloudSync
              ? syncMessage.includes("Successfully")
                ? "success"
                : "warning"
              : ""
          }">
            <p>${syncMessage}</p>
          </div>
        </div>
      </div>
      <div class="wizard-footer">
        <div class="wizard-buttons">
          <div></div>
          <button id="complete-finish-btn" class="primary-btn">Start Using App</button>
        </div>
      </div>
    `;
  }

  async verifyCloudConnection() {
    if (!this.selections.cloudSyncProvider) return false;

    try {
      if (this.selections.cloudSyncProvider === "dropbox") {
        // For Dropbox, create a new provider instance and check auth
        const dropboxProvider = new DropboxProvider();
        await dropboxProvider.initialize();
        return await dropboxProvider.checkAuth();
      } else if (this.selections.cloudSyncProvider === "gdrive") {
        // For Google Drive, create a new provider instance and check auth
        const googleProvider = new GoogleDriveProvider();
        await googleProvider.initialize();
        return await googleProvider.checkAuth();
      }
      return false;
    } catch (error) {
      logger.error("Error verifying cloud connection:", error);
      return false;
    }
  }

  attachStepEventListeners() {
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
        // Back button
        document
          .getElementById("first-day-back-btn")
          ?.addEventListener("click", () => {
            this.currentStep = WIZARD_STEPS.WELCOME;
            this.renderCurrentStep();
          });

        // Next button
        document
          .getElementById("first-day-next-btn")
          ?.addEventListener("click", async () => {
            const selectedDay = document.querySelector(
              'input[name="firstDay"]:checked'
            )?.value;
            if (selectedDay) {
              this.selections.firstDayOfWeek = selectedDay;
              await dataService.savePreference("weekStartDay", selectedDay);
              this.currentStep = WIZARD_STEPS.CLOUD_SYNC;
              this.renderCurrentStep();
            }
          });

        // Radio button change
        document.querySelectorAll('input[name="firstDay"]').forEach((radio) => {
          radio.addEventListener("change", (e) => {
            this.selections.firstDayOfWeek = e.target.value;
          });
        });
        break;

      case WIZARD_STEPS.CLOUD_SYNC:
        document
          .getElementById("cloud-sync-back-btn")
          ?.addEventListener("click", () => {
            this.currentStep = WIZARD_STEPS.FIRST_DAY;
            this.renderCurrentStep();
          });

        document
          .getElementById("cloud-sync-next-btn")
          ?.addEventListener("click", async () => {
            const enableSync =
              document.querySelector('input[name="cloudSync"]:checked')
                ?.value === "true";

            this.selections.enableCloudSync = enableSync;
            await dataService.savePreference("cloudSyncEnabled", enableSync);

            if (enableSync) {
              this.currentStep = WIZARD_STEPS.CLOUD_PROVIDER;
            } else {
              this.currentStep = WIZARD_STEPS.COMPLETE;
            }
            this.renderCurrentStep();
          });

        // Radio button change
        document
          .querySelectorAll('input[name="cloudSync"]')
          .forEach((radio) => {
            radio.addEventListener("change", (e) => {
              this.selections.enableCloudSync = e.target.value === "true";
              this.renderCurrentStep(); // Re-render to update step count
            });
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
              await this.initiateOAuthFlow(provider);
            }
          });

        // Radio button change
        document
          .querySelectorAll('input[name="cloudProvider"]')
          .forEach((radio) => {
            radio.addEventListener("change", (e) => {
              this.selections.cloudSyncProvider = e.target.value;
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
    const stateParam = btoa(JSON.stringify(state));

    try {
      if (provider === "dropbox") {
        // Store minimal wizard state
        localStorage.setItem(
          "setupWizardState",
          JSON.stringify({
            isActive: true,
            selections: this.selections,
          })
        );

        // Handle Dropbox OAuth redirect using existing provider
        const dropboxProvider = new DropboxProvider();
        await dropboxProvider.initialize();
        await dropboxProvider.authenticate(stateParam);
      } else if (provider === "gdrive") {
        // Handle Google Drive OAuth popup
        const googleProvider = new GoogleDriveProvider();
        await googleProvider.initialize();
        const success = await googleProvider.authenticate();

        if (success) {
          this.currentStep = WIZARD_STEPS.COMPLETE;
          await this.renderCurrentStep();
        } else {
          throw new Error("Google Drive authentication failed");
        }
      }
    } catch (error) {
      logger.error("OAuth flow failed:", error);
      // Show error in UI
      this.currentStep = WIZARD_STEPS.COMPLETE;
      await this.renderCurrentStep();
    }
  }

  async finish() {
    try {
      // Mark setup as completed
      await dataService.savePreference("initialSetupCompleted", true);

      this.hide();

      // Dispatch event that setup is complete
      window.dispatchEvent(
        new CustomEvent("setupWizardComplete", {
          detail: {
            selections: this.selections,
          },
        })
      );

      logger.info("Setup wizard completed successfully");
    } catch (error) {
      logger.error("Error finishing setup wizard:", error);
    }
  }
}

export default new SetupWizard();
