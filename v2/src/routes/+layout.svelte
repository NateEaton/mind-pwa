<script lang="ts">
	import { onMount } from 'svelte';
	import { settings } from '$lib/stores/mindDiet';
	import { setupState, setupActions } from '$lib/stores/setup';
	import SetupWizard from '$lib/components/SetupWizard.svelte';
	import '../app.css';

	let { children } = $props();

	let showSetupWizard = $state(false);

	// Apply theme based on settings
	function applyTheme(theme: 'light' | 'dark' | 'auto') {
		if (typeof window === 'undefined') return;

		if (theme === 'auto') {
			const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
			document.documentElement.classList.toggle('dark', isDark);
		} else {
			document.documentElement.classList.toggle('dark', theme === 'dark');
		}
	}

	// Apply theme whenever settings change
	$effect(() => {
		applyTheme($settings.theme);
	});

	// Handle wizard close
	function handleWizardClose() {
		setupActions.completeSetup();
		showSetupWizard = false;
	}

	onMount(() => {
		// Listen for system theme changes
		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		const handler = () => {
			if ($settings.theme === 'auto') {
				applyTheme('auto');
			}
		};
		mediaQuery.addEventListener('change', handler);

		// Apply initial theme
		applyTheme($settings.theme);

		// Show setup wizard if not completed
		if (!$setupState.completed) {
			showSetupWizard = true;
		}

		return () => mediaQuery.removeEventListener('change', handler);
	});
</script>

<svelte:head>
	<title>MIND Diet Tracker</title>
	<meta name="description" content="Track your adherence to the MIND Diet" />
</svelte:head>

<div class="app">
	<nav class="nav">
		<div class="nav-container">
			<a href="/" class="nav-brand">MIND Diet Tracker</a>
			<div class="nav-links">
				<a href="/" class="nav-link">Daily</a>
				<a href="/weekly" class="nav-link">Weekly</a>
				<a href="/history" class="nav-link">History</a>
				<a href="/settings" class="nav-link">Settings</a>
			</div>
		</div>
	</nav>

	<main class="main">
		{@render children()}
	</main>
</div>

<!-- Setup Wizard -->
{#if showSetupWizard}
	<SetupWizard onclose={handleWizardClose} />
{/if}

<style>
	:global(:root) {
		/* Colors */
		--color-primary: #4a5568;
		--color-primary-hover: #2d3748;
		--color-success: #10b981;
		--color-warning: #f59e0b;
		--color-danger: #ef4444;
		--color-info: #3b82f6;

		--color-text: #1f2937;
		--color-text-secondary: #6b7280;
		--color-text-muted: #9ca3af;

		--color-bg: #ffffff;
		--color-bg-secondary: #f3f4f6;
		--color-bg-tertiary: #e5e7eb;

		--color-border: #e5e7eb;
		--color-border-hover: #d1d5db;

		/* Spacing */
		--spacing-xs: 0.25rem;
		--spacing-sm: 0.5rem;
		--spacing-md: 1rem;
		--spacing-lg: 1.5rem;
		--spacing-xl: 2rem;

		/* Border radius */
		--radius-sm: 0.25rem;
		--radius-md: 0.5rem;
		--radius-lg: 0.75rem;
		--radius-full: 9999px;

		/* Shadows */
		--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
		--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
		--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);

		/* Transitions */
		--transition-fast: 150ms ease;
		--transition-base: 200ms ease;
		--transition-slow: 300ms ease;
	}

	:global(.dark) {
		--color-text: #f9fafb;
		--color-text-secondary: #d1d5db;
		--color-text-muted: #9ca3af;

		--color-bg: #1f2937;
		--color-bg-secondary: #374151;
		--color-bg-tertiary: #4b5563;

		--color-border: #4b5563;
		--color-border-hover: #6b7280;
	}

	:global(*) {
		box-sizing: border-box;
		margin: 0;
		padding: 0;
	}

	:global(body) {
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
		background-color: var(--color-bg);
		color: var(--color-text);
		line-height: 1.5;
	}

	.app {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.nav {
		background-color: var(--color-primary);
		color: white;
		box-shadow: var(--shadow-md);
		position: sticky;
		top: 0;
		z-index: 100;
	}

	.nav-container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 var(--spacing-md);
		display: flex;
		justify-content: space-between;
		align-items: center;
		height: 60px;
	}

	.nav-brand {
		font-size: 1.25rem;
		font-weight: 700;
		color: white;
		text-decoration: none;
		transition: opacity var(--transition-fast);
	}

	.nav-brand:hover {
		opacity: 0.9;
	}

	.nav-links {
		display: flex;
		gap: var(--spacing-md);
	}

	.nav-link {
		color: rgba(255, 255, 255, 0.9);
		text-decoration: none;
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		transition: all var(--transition-fast);
		font-weight: 500;
	}

	.nav-link:hover {
		background-color: rgba(255, 255, 255, 0.1);
		color: white;
	}

	.main {
		flex: 1;
		width: 100%;
		max-width: 1200px;
		margin: 0 auto;
		padding: var(--spacing-xl) var(--spacing-md);
	}

	@media (max-width: 640px) {
		.nav-brand {
			font-size: 1rem;
		}

		.nav-links {
			gap: var(--spacing-sm);
		}

		.nav-link {
			padding: var(--spacing-sm);
			font-size: 0.875rem;
		}

		.main {
			padding: var(--spacing-md);
		}
	}
</style>
