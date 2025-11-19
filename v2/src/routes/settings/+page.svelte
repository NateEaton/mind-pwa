<script lang="ts">
	import { settings, mindDietActions } from '$lib/stores/mindDiet';

	function changeTheme(theme: 'light' | 'dark' | 'auto') {
		mindDietActions.updateSettings({ theme });
	}

	function changeWeekStart(weekStartDay: 'Sunday' | 'Monday') {
		mindDietActions.updateSettings({ weekStartDay });
	}
</script>

<svelte:head>
	<title>Settings - MIND Diet</title>
</svelte:head>

<div class="settings-view">
	<header class="header">
		<h1 class="title">Settings</h1>
		<p class="subtitle">Customize your MIND Diet Tracker</p>
	</header>

	<div class="settings-sections">
		<section class="setting-section">
			<h2 class="section-title">Theme</h2>
			<div class="setting-options">
				<button
					class="option-btn"
					class:active={$settings.theme === 'light'}
					onclick={() => changeTheme('light')}
				>
					Light
				</button>
				<button
					class="option-btn"
					class:active={$settings.theme === 'dark'}
					onclick={() => changeTheme('dark')}
				>
					Dark
				</button>
				<button
					class="option-btn"
					class:active={$settings.theme === 'auto'}
					onclick={() => changeTheme('auto')}
				>
					Auto
				</button>
			</div>
		</section>

		<section class="setting-section">
			<h2 class="section-title">Week Start Day</h2>
			<div class="setting-options">
				<button
					class="option-btn"
					class:active={$settings.weekStartDay === 'Sunday'}
					onclick={() => changeWeekStart('Sunday')}
				>
					Sunday
				</button>
				<button
					class="option-btn"
					class:active={$settings.weekStartDay === 'Monday'}
					onclick={() => changeWeekStart('Monday')}
				>
					Monday
				</button>
			</div>
		</section>

		<section class="setting-section">
			<h2 class="section-title">Data Management</h2>
			<div class="setting-actions">
				<button class="action-btn" onclick={() => {
					const data = mindDietActions.exportData();
					const blob = new Blob([data], { type: 'application/json' });
					const url = URL.createObjectURL(blob);
					const a = document.createElement('a');
					a.href = url;
					a.download = `mind-diet-export-${new Date().toISOString().split('T')[0]}.json`;
					a.click();
					URL.revokeObjectURL(url);
				}}>
					Export Data
				</button>
				<button class="action-btn danger" onclick={() => mindDietActions.clearAllData()}>
					Clear All Data
				</button>
			</div>
		</section>
	</div>
</div>

<style>
	.settings-view {
		max-width: 800px;
		margin: 0 auto;
	}

	.header {
		margin-bottom: var(--spacing-xl);
		text-align: center;
	}

	.title {
		font-size: 2rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0 0 var(--spacing-sm) 0;
	}

	.subtitle {
		font-size: 1.125rem;
		color: var(--color-text-secondary);
		margin: 0;
	}

	.settings-sections {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xl);
	}

	.setting-section {
		background: var(--color-bg-secondary);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
	}

	.section-title {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 var(--spacing-md) 0;
	}

	.setting-options {
		display: flex;
		gap: var(--spacing-sm);
	}

	.option-btn {
		flex: 1;
		padding: var(--spacing-sm) var(--spacing-md);
		border: 2px solid var(--color-border);
		background: var(--color-bg);
		color: var(--color-text);
		border-radius: var(--radius-md);
		cursor: pointer;
		font-weight: 500;
		transition: all var(--transition-fast);
	}

	.option-btn:hover {
		border-color: var(--color-primary);
	}

	.option-btn.active {
		background: var(--color-primary);
		color: white;
		border-color: var(--color-primary);
	}

	.setting-actions {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.action-btn {
		padding: var(--spacing-sm) var(--spacing-md);
		border: 2px solid var(--color-primary);
		background: var(--color-bg);
		color: var(--color-primary);
		border-radius: var(--radius-md);
		cursor: pointer;
		font-weight: 600;
		transition: all var(--transition-fast);
	}

	.action-btn:hover {
		background: var(--color-primary);
		color: white;
	}

	.action-btn.danger {
		border-color: var(--color-danger);
		color: var(--color-danger);
	}

	.action-btn.danger:hover {
		background: var(--color-danger);
		color: white;
	}
</style>
