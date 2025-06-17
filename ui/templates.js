/*
 * MIND Diet Tracker PWA - UI Templates
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

/**
 * UI Templates - HTML templates for rendering UI components
 */

export const templates = {
  // Food group item template (used in tracker view)
  foodGroupItem: `
    <div class="food-group-item" data-id="{{id}}">
      <div class="info">
        <button class="info-btn" data-groupid="{{id}}">i</button>
        <div class="text-container">
          <div class="name-row">
            <span class="name">{{name}}</span>
          </div>
          <span class="target">{{target}}</span>
        </div>
      </div>
      <div class="controls">
        <span class="weekly-badge" style="display: none;"><span class="wk-val">{{weeklyTotal}}</span></span>
        <button class="decrement-btn" aria-label="Decrement count">-</button>
        <input type="number" class="count-input" value="{{count}}" min="0" step="1" aria-label="Current count" data-groupid="{{id}}">
        <button class="increment-btn" aria-label="Increment count">+</button>
      </div>
    </div>
  `,

  // Day selector button template
  daySelectorButton: `
    <button class="day-selector-btn {{#if active}}active{{/if}}" data-date="{{date}}" aria-label="{{ariaLabel}}">
      {{letter}}
    </button>
  `,

  // Current week summary card template
  currentWeekCard: `
    <div class="food-card {{statusClass}}">
      <div class="status-indicator"></div>
      <div class="card-content">
        <div class="card-food-name">{{name}}</div>
        <div class="metric-container">
          <div class="metric-label">SERVINGS</div>
          <div class="metric-value">{{currentTotal}}</div>
        </div>
        <div class="metric-container">
          <div class="metric-label">TARGET</div>
          <div class="metric-value">{{target}}</div>
        </div>
      </div>
    </div>
  `,

  // History card template
  historyCard: `
    <div class="food-card {{statusClass}}">
      <div class="status-indicator"></div>
      <div class="card-content">
        <div class="card-food-name">{{name}}</div>
        <div class="metric-container">
          <div class="metric-label">SERVINGS</div>
          <div class="metric-value">{{total}}</div>
        </div>
        <div class="metric-container">
          <div class="metric-label">TARGET</div>
          <div class="metric-value">{{target}}</div>
        </div>
      </div>
    </div>
  `,

  // Edit totals modal item template
  editTotalsItem: `
    <div class="edit-totals-item" data-id="{{id}}">
      <span class="edit-item-name">{{name}}</span>
      <div class="edit-item-controls">
        <button class="edit-decrement-btn" aria-label="Decrement total" data-group-id="{{id}}">-</button>
        <span class="edit-current-total">{{count}}</span>
        <button class="edit-increment-btn" aria-label="Increment total" data-group-id="{{id}}">+</button>
      </div>
    </div>
  `,

  // Generic modal template
  genericModal: `
    <div class="modal-content">
      <div class="modal-header">
        <h2 class="modal-title">{{title}}</h2>
        <button class="modal-close-btn">&times;</button>
      </div>
      <div class="modal-body">{{content}}</div>
      {{#if buttons}}
      <div class="modal-actions">
        {{#each buttons}}
        <button class="{{class}}" id="{{id}}">{{label}}</button>
        {{/each}}
      </div>
      {{/if}}
    </div>
  `,

  // Edit totals modal template
  editTotalsModal: `
    <div class="modal-content">
      <div class="modal-header">
        <h2 class="modal-title">{{title}}</h2>
        <button class="modal-close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <div class="modal-selected-day-display">{{selectedDay}}</div>
        <div class="modal-day-selector-bar">{{daySelector}}</div>
        <div class="edit-totals-list">{{foodItems}}</div>
      </div>
      <div class="modal-actions">
        <button class="secondary-btn" id="edit-totals-cancel-btn">Cancel</button>
        <button class="primary-btn" id="edit-totals-save-btn">{{saveButtonText}}</button>
      </div>
    </div>
  `,

  // Toast notification template
  toast: `
    <div class="toast toast-{{type}}">
      <div class="toast-spinner {{#if showSpinner}}active{{/if}}"></div>
      <div class="toast-text">{{message}}</div>
    </div>
  `,

  // Summary cards container
  summaryCardsContainer: `
    <div class="summary-cards">
      {{cards}}
    </div>
  `,
};

/**
 * Simple template engine for rendering templates with data
 * @param {string} template - The template string
 * @param {Object} data - The data to inject into the template
 * @returns {string} - The rendered HTML
 */
export function renderTemplate(template, data) {
  let result = template;

  // Handle simple variable substitution {{variable}}
  result = result.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] !== undefined ? data[key] : "";
  });

  // Handle conditional blocks {{#if condition}}...{{/if}}
  result = result.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (match, condition, content) => {
      return data[condition] ? content : "";
    }
  );

  // Handle loops {{#each array}}...{{/each}}
  result = result.replace(
    /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (match, arrayKey, content) => {
      const array = data[arrayKey] || [];
      return array
        .map((item) => {
          return content.replace(/\{\{(\w+)\}\}/g, (match, key) => {
            return item[key] !== undefined ? item[key] : "";
          });
        })
        .join("");
    }
  );

  return result;
}
