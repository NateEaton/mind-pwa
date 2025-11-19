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
	<header class="header">
		<div class="header-top">
			<h1>MIND Diet Tracker</h1>
		</div>
		<div class="tab-bar-container">
			<nav class="tab-bar">
				<a href="/" class="tab-item">
					<i class="mdi mdi-calendar-today"></i>
					<span class="tab-label">Daily</span>
				</a>
				<a href="/weekly" class="tab-item">
					<i class="mdi mdi-chart-bar"></i>
					<span class="tab-label">Weekly</span>
				</a>
				<a href="/history" class="tab-item">
					<i class="mdi mdi-archive-clock-outline"></i>
					<span class="tab-label">History</span>
				</a>
				<a href="/settings" class="tab-item">
					<i class="mdi mdi-cog-outline"></i>
					<span class="tab-label">Settings</span>
				</a>
			</nav>
		</div>
	</header>

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
		/* Colors - V1 Green Theme */
		--color-primary: #4CAF50;
		--color-primary-dark: #388E3C;
		--color-secondary: #8BC34A;
		--color-secondary-dark: #689F38;
		--color-accent: #FFC107;
		--color-success: #4CAF50;
		--color-warning: #FF9800;
		--color-warning-dark: #F57C00;
		--color-danger: #dc3545;
		--color-info: #3b82f6;

		--color-text: #333;
		--color-text-secondary: #666;
		--color-text-muted: #999;

		--color-bg: #f4f4f4;
		--color-bg-secondary: #ffffff;
		--color-bg-tertiary: #f9f9f9;

		--color-border: #ddd;
		--color-border-hover: #ccc;

		/* Status colors */
		--color-met-goal: #d4edda;
		--color-met-goal-border: #c3e6cb;
		--color-missed-goal: #f8d7da;
		--color-missed-goal-border: #f5c6cb;
		--color-near-limit: #fff3cd;
		--color-near-limit-border: #ffeeba;

		/* Spacing - V1 Scale */
		--spacing-xs: 0.3rem;
		--spacing-sm: 0.5rem;
		--spacing-md: 0.8rem;
		--spacing-lg: 1rem;
		--spacing-xl: 1.5rem;

		/* Font sizes */
		--font-xs: 0.8rem;
		--font-sm: 0.9rem;
		--font-md: 1rem;
		--font-lg: 1.2rem;
		--font-xl: 1.4rem;
		--font-xxl: 2rem;

		/* Border radius */
		--radius-sm: 4px;
		--radius-md: 8px;
		--radius-lg: 12px;
		--radius-full: 9999px;

		/* Shadows */
		--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
		--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
		--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);

		/* Transitions */
		--transition-fast: 150ms ease;
		--transition-base: 200ms ease;
		--transition-slow: 300ms ease;

		/* Header height */
		--header-height: 88px;
	}

	:global(.dark) {
		--color-primary: #66BB6A;
		--color-primary-dark: #4CAF50;
		--color-secondary: #9CCC65;
		--color-secondary-dark: #7CB342;
		--color-warning: #FFB74D;
		--color-warning-dark: #FF9800;
		--color-danger: #ef5350;

		--color-text: #e0e0e0;
		--color-text-secondary: #b0b0b0;
		--color-text-muted: #888;

		--color-bg: #1a1a1a;
		--color-bg-secondary: #2d2d2d;
		--color-bg-tertiary: #333;

		--color-border: #444;
		--color-border-hover: #555;

		--color-met-goal: #1b5e20;
		--color-missed-goal: #b71c1c;
		--color-near-limit: #e65100;
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

	.header {
		background-color: var(--color-primary);
		color: white;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
		position: sticky;
		top: 0;
		z-index: 100;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.header-top {
		display: flex;
		justify-content: center;
		align-items: center;
		width: 100%;
		padding: var(--spacing-md);
	}

	.header h1 {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 600;
		color: white;
		text-align: center;
	}

	.tab-bar-container {
		width: 100%;
		background-color: var(--color-secondary);
		border-top: 1px solid rgba(255, 255, 255, 0.2);
	}

	.tab-bar {
		display: flex;
		justify-content: space-around;
		max-width: 800px;
		margin: 0 auto;
		padding: 0;
	}

	.tab-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		color: white;
		opacity: 0.8;
		padding: var(--spacing-xs);
		flex: 1;
		cursor: pointer;
		transition: all 0.2s ease;
		text-decoration: none;
		min-height: 44px;
	}

	.tab-item:hover {
		opacity: 1;
		background-color: var(--color-secondary-dark);
	}

	.tab-item :global(.mdi) {
		font-size: 1.3em;
		margin-bottom: 2px;
		display: block;
		color: var(--color-accent);
	}

	.tab-label {
		font-size: var(--font-sm);
		line-height: 1;
	}

	.main {
		flex: 1;
		width: 100%;
		max-width: 800px;
		margin: 0 auto;
		padding: var(--spacing-lg);
		height: calc(100vh - var(--header-height));
		overflow-y: auto;
	}

	@media (max-width: 600px) {
		.header h1 {
			font-size: 1.3rem;
		}

		.tab-item :global(.mdi) {
			font-size: 1.4em;
		}
	}

	@media (max-width: 480px) {
		.main {
			padding: var(--spacing-md);
		}

		.tab-label {
			font-size: 0.75rem;
		}
	}
</style>
