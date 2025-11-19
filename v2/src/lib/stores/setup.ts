import { writable } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * Setup store - Tracks whether the setup wizard has been completed
 */

export interface SetupState {
	completed: boolean;
	completedAt: string | null;
}

/**
 * Load setup state from localStorage
 */
function loadSetupState(): SetupState {
	if (!browser) {
		return {
			completed: false,
			completedAt: null
		};
	}

	try {
		const stored = localStorage.getItem('mindDiet_setupState');
		if (stored) {
			return JSON.parse(stored);
		}
	} catch (error) {
		console.error('Failed to load setup state:', error);
	}

	return {
		completed: false,
		completedAt: null
	};
}

/**
 * Setup state store
 */
export const setupState = writable<SetupState>(loadSetupState());

/**
 * Save setup state to localStorage
 */
if (browser) {
	setupState.subscribe((state) => {
		try {
			localStorage.setItem('mindDiet_setupState', JSON.stringify(state));
		} catch (error) {
			console.error('Failed to save setup state:', error);
		}
	});
}

/**
 * Setup actions
 */
export const setupActions = {
	/**
	 * Mark setup as completed
	 */
	completeSetup() {
		setupState.set({
			completed: true,
			completedAt: new Date().toISOString()
		});
	},

	/**
	 * Reset setup state (for testing)
	 */
	resetSetup() {
		setupState.set({
			completed: false,
			completedAt: null
		});
	},

	/**
	 * Check if setup is completed
	 */
	isSetupCompleted(): boolean {
		let completed = false;
		setupState.subscribe((state) => {
			completed = state.completed;
		})();
		return completed;
	}
};
