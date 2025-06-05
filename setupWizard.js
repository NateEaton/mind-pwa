// Setup Wizard Module
import dataService from "./dataService.js";
import stateManager from "./stateManager.js";
import { createLogger } from "./logger.js";

const logger = createLogger("setupWizard");

// Wizard step definitions
const WIZARD_STEPS = {
  WELCOME: "welcome",
  FIRST_DAY: "first_day",
  CLOUD_SYNC: "cloud_sync",
  COMPLETE: "complete",
};

class SetupWizard {
  constructor() {
    this.currentStep = WIZARD_STEPS.WELCOME;
    this.selections = {
      firstDayOfWeek: "Sunday", // Default value
      enableCloudSync: false, // Default to false
    };
    this.modalElement = null;
    this.contentElement = null;
    this.initialized = false;
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
    this.currentStep = WIZARD_STEPS.WELCOME;
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
      case WIZARD_STEPS.COMPLETE:
        content = this.renderCompleteStep();
        break;
    }

    this.contentElement.innerHTML = content;
    this.attachStepEventListeners();
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
            <li>Never lose your tracking history</li>
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
        <div class="wizard-progress">Step 3 of 3</div>
        <div class="wizard-buttons">
          <button id="cloud-sync-back-btn" class="secondary-btn">Back</button>
          <button id="cloud-sync-next-btn" class="primary-btn">Continue</button>
        </div>
      </div>
    `;
  }

  renderCompleteStep() {
    const syncMessage = this.selections.enableCloudSync
      ? "Cloud sync is enabled and ready to set up."
      : "You can enable cloud sync anytime from the settings menu.";

    return `
      <div class="wizard-header">
        <h2>Setup Complete!</h2>
      </div>
      <div class="wizard-content">
        <div class="wizard-step">
          <p>Your preferences have been saved. You're ready to start tracking your MIND diet journey.</p>
          <p class="sync-status">${syncMessage}</p>
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
          ?.addEventListener("click", () => {
            const selectedDay = document.querySelector(
              'input[name="firstDay"]:checked'
            )?.value;
            if (selectedDay) {
              this.selections.firstDayOfWeek = selectedDay;
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
            await this.savePreferences();
            this.currentStep = WIZARD_STEPS.COMPLETE;
            this.renderCurrentStep();
          });

        document
          .querySelectorAll('input[name="cloudSync"]')
          .forEach((radio) => {
            radio.addEventListener("change", (e) => {
              this.selections.enableCloudSync = e.target.value === "true";
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

  async savePreferences() {
    try {
      // Save first day of week preference
      await dataService.savePreference(
        "weekStartDay",
        this.selections.firstDayOfWeek
      );

      // Save cloud sync preference
      await dataService.savePreference(
        "cloudSyncEnabled",
        this.selections.enableCloudSync
      );

      // Mark setup as completed
      await dataService.savePreference("initialSetupCompleted", true);

      logger.info("Setup preferences saved successfully");
      return true;
    } catch (error) {
      logger.error("Error saving setup preferences:", error);
      return false;
    }
  }

  async finish() {
    this.hide();
    // Dispatch an event that setup is complete
    window.dispatchEvent(
      new CustomEvent("setupWizardComplete", {
        detail: {
          selections: this.selections,
        },
      })
    );
  }
}

export default new SetupWizard();
