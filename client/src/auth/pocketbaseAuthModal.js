/**
 * MIND Diet Tracker PWA
 * PocketBase Authentication Modal
 * Handles email/password authentication for PocketBase
 */

import logger from "../core/logger.js";

export class PocketbaseAuthModal {
  constructor(cloudSyncManager, onSuccess, onCancel) {
    this.cloudSyncManager = cloudSyncManager;
    this.onSuccess = onSuccess || (() => {});
    this.onCancel = onCancel || (() => {});
    this.isVisible = false;
  }

  /**
   * Show the authentication modal
   * @param {string} mode - 'signin' or 'register'
   */
  show(mode = "signin") {
    if (this.isVisible) return;

    this.isVisible = true;
    this.currentMode = mode;

    // Create modal HTML
    const modalHtml = this.createModalHtml();

    // Add to DOM
    document.body.insertAdjacentHTML("beforeend", modalHtml);

    // Setup event listeners
    this.setupEventListeners();

    // Show modal with animation
    const modal = document.getElementById("pocketbase-auth-modal");
    setTimeout(() => modal.classList.add("show"), 10);

    // Focus appropriate input
    const firstInput =
      mode === "signin"
        ? document.getElementById("pb-email")
        : document.getElementById("pb-reg-username");
    if (firstInput) firstInput.focus();

    logger.info(`PocketBase auth modal opened in ${mode} mode`);
  }

  /**
   * Hide the authentication modal
   */
  hide() {
    if (!this.isVisible) return;

    const modal = document.getElementById("pocketbase-auth-modal");
    if (modal) {
      modal.classList.remove("show");
      setTimeout(() => {
        modal.remove();
        this.isVisible = false;
      }, 300);
    }

    logger.info("PocketBase auth modal closed");
  }

  /**
   * Create modal HTML
   */
  createModalHtml() {
    return `
      <div id="pocketbase-auth-modal" class="modal-overlay">
        <div class="modal-content auth-modal">
          <div class="auth-modal-header">
            <h2>Connect to PocketBase</h2>
            <button class="close-btn" data-action="close">&times;</button>
          </div>
          
          <div class="auth-tabs">
            <button class="tab-btn ${
              this.currentMode === "signin" ? "active" : ""
            }" 
                    data-tab="signin">Sign In</button>
            <button class="tab-btn ${
              this.currentMode === "register" ? "active" : ""
            }" 
                    data-tab="register">Register</button>
          </div>

          <!-- Sign In Form -->
          <form class="auth-form ${
            this.currentMode === "signin" ? "" : "hidden"
          }" 
                id="pb-signin-form">
            <div class="form-group">
              <label for="pb-email">Email</label>
              <input type="email" id="pb-email" name="email" required autocomplete="username">
            </div>
            <div class="form-group">
              <label for="pb-password">Password</label>
              <input type="password" id="pb-password" name="password" required autocomplete="current-password">
            </div>
            <div class="form-actions">
              <button type="submit" class="auth-submit-btn" data-action="signin">
                <span class="btn-text">Sign In</span>
                <span class="btn-spinner hidden">⟳</span>
              </button>
            </div>
          </form>

          <!-- Register Form -->
          <form class="auth-form ${
            this.currentMode === "register" ? "" : "hidden"
          }" 
                id="pb-register-form">
            <div class="form-group">
              <label for="pb-reg-username">Username</label>
              <input type="text" id="pb-reg-username" name="username" required 
                     autocomplete="username" minlength="3" maxlength="50">
            </div>
            <div class="form-group">
              <label for="pb-reg-email">Email</label>
              <input type="email" id="pb-reg-email" name="email" required autocomplete="email">
            </div>
            <div class="form-group">
              <label for="pb-reg-password">Password</label>
              <input type="password" id="pb-reg-password" name="password" required 
                     autocomplete="new-password" minlength="6">
            </div>
            <div class="form-group">
              <label for="pb-reg-password-confirm">Confirm Password</label>
              <input type="password" id="pb-reg-password-confirm" name="passwordConfirm" 
                     required autocomplete="new-password" minlength="6">
            </div>
            <div class="form-actions">
              <button type="submit" class="auth-submit-btn" data-action="register">
                <span class="btn-text">Create Account</span>
                <span class="btn-spinner hidden">⟳</span>
              </button>
            </div>
          </form>

          <div class="auth-info">
            <p><strong>About PocketBase Sync:</strong></p>
            <ul>
              <li>Real-time synchronization across all your devices</li>
              <li>Automatic conflict resolution</li>
              <li>Offline support with sync when reconnected</li>
              <li>Your data is stored securely on your server</li>
            </ul>
          </div>

          <div class="auth-error hidden" id="pb-auth-error">
            <div class="error-message"></div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    const modal = document.getElementById("pocketbase-auth-modal");
    if (!modal) return;

    // Close button
    modal
      .querySelector('[data-action="close"]')
      ?.addEventListener("click", () => {
        this.hide();
        this.onCancel();
      });

    // Click outside to close
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        this.hide();
        this.onCancel();
      }
    });

    // Tab switching
    modal.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const tab = e.target.dataset.tab;
        this.switchTab(tab);
      });
    });

    // Form submissions
    const signinForm = document.getElementById("pb-signin-form");
    if (signinForm) {
      signinForm.addEventListener("submit", (e) => this.handleSignin(e));
    }

    const registerForm = document.getElementById("pb-register-form");
    if (registerForm) {
      registerForm.addEventListener("submit", (e) => this.handleRegister(e));
    }

    // Password confirmation validation
    const passwordConfirm = document.getElementById("pb-reg-password-confirm");
    const password = document.getElementById("pb-reg-password");
    if (passwordConfirm && password) {
      passwordConfirm.addEventListener("input", () => {
        if (passwordConfirm.value && passwordConfirm.value !== password.value) {
          passwordConfirm.setCustomValidity("Passwords do not match");
        } else {
          passwordConfirm.setCustomValidity("");
        }
      });
    }

    // Escape key to close
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isVisible) {
        this.hide();
        this.onCancel();
      }
    });
  }

  /**
   * Switch between signin and register tabs
   */
  switchTab(tab) {
    // Update tab buttons
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });

    // Show/hide forms
    const signinForm = document.getElementById("pb-signin-form");
    const registerForm = document.getElementById("pb-register-form");

    if (tab === "signin") {
      signinForm?.classList.remove("hidden");
      registerForm?.classList.add("hidden");
      document.getElementById("pb-email")?.focus();
    } else {
      signinForm?.classList.add("hidden");
      registerForm?.classList.remove("hidden");
      document.getElementById("pb-reg-username")?.focus();
    }

    this.currentMode = tab;
    this.clearError();
  }

  /**
   * Handle signin form submission
   */
  async handleSignin(e) {
    e.preventDefault();

    const email = document.getElementById("pb-email").value.trim();
    const password = document.getElementById("pb-password").value;

    if (!email || !password) {
      this.showError("Please fill in all fields");
      return;
    }

    this.setLoading(true, "signin");
    this.clearError();

    try {
      const success = await this.cloudSyncManager.authenticatePocketbase(
        email,
        password
      );
      if (success) {
        logger.info("PocketBase signin successful");
        this.hide();
        this.onSuccess({ type: "signin", email: email });
      }
    } catch (error) {
      logger.error("PocketBase signin error:", error);
      // The error object from PocketBase often has a more specific message.
      // Example: error.data.data.identity.message
      const errorMessage =
        error?.data?.data?.identity?.message ||
        error.message ||
        "Sign in failed. Please try again.";
      this.showError(errorMessage.replace("identity", "email")); // Nicer for users
    } finally {
      this.setLoading(false, "signin");
    }
  }

  /**
   * Handle register form submission
   */
  async handleRegister(e) {
    e.preventDefault();

    const username = document.getElementById("pb-reg-username").value.trim();
    const email = document.getElementById("pb-reg-email").value.trim();
    const password = document.getElementById("pb-reg-password").value;
    const passwordConfirm = document.getElementById(
      "pb-reg-password-confirm"
    ).value;

    if (!username || !email || !password) {
      this.showError("Please fill in all fields");
      return;
    }

    if (password !== passwordConfirm) {
      this.showError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      this.showError("Password must be at least 6 characters long");
      return;
    }

    this.setLoading(true, "register");
    this.clearError();

    try {
      const success = await this.cloudSyncManager.registerPocketbase(
        username,
        email,
        password
      );

      if (success) {
        logger.info("PocketBase registration successful");
        this.hide();
        this.onSuccess({
          type: "register",
          username: username,
          email: email,
        });
      }
    } catch (error) {
      logger.error("PocketBase registration error:", error);

      // PocketBase provides structured errors
      let errorMessage =
        error.message || "Registration failed. Please try again.";
      if (error?.data?.data) {
        const fieldErrors = Object.entries(error.data.data);
        if (fieldErrors.length > 0) {
          const [field, details] = fieldErrors[0];
          errorMessage = `${field.charAt(0).toUpperCase() + field.slice(1)}: ${
            details.message
          }`;
        }
      }
      this.showError(errorMessage);
    } finally {
      this.setLoading(false, "register");
    }
  }

  /**
   * Show error message
   */
  showError(message) {
    const errorDiv = document.getElementById("pb-auth-error");
    const errorMessage = errorDiv?.querySelector(".error-message");

    if (errorDiv && errorMessage) {
      errorMessage.textContent = message;
      errorDiv.classList.remove("hidden");
    }
  }

  /**
   * Clear error message
   */
  clearError() {
    const errorDiv = document.getElementById("pb-auth-error");
    if (errorDiv) {
      errorDiv.classList.add("hidden");
    }
  }

  /**
   * Set loading state for buttons
   */
  setLoading(loading, action) {
    const button = document.querySelector(`[data-action="${action}"]`);
    if (!button) return;

    const spinner = button.querySelector(".btn-spinner");
    const text = button.querySelector(".btn-text");

    if (loading) {
      button.disabled = true;
      spinner?.classList.remove("hidden");
      text?.classList.add("hidden");
    } else {
      button.disabled = false;
      spinner?.classList.add("hidden");
      text?.classList.remove("hidden");
    }
  }
}
