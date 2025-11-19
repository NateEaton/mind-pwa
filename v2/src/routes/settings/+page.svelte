<script lang="ts">
	import { settings, mindDietActions } from '$lib/stores/mindDiet';
	import { syncState, syncReady, syncActions } from '$lib/stores/sync';
	import { setupActions } from '$lib/stores/setup';

	let workerUrlInput = $state($syncState.workerUrl || '');
	let syncUrlInput = $state('');
	let showSyncUrl = $state(false);
	let generatedSyncUrl = $state('');

	function changeTheme(theme: 'light' | 'dark' | 'auto') {
		mindDietActions.updateSettings({ theme });
	}

	function changeWeekStart(weekStartDay: 'Sunday' | 'Monday') {
		mindDietActions.updateSettings({ weekStartDay });
	}

	async function createSync() {
		try {
			const url = workerUrlInput.trim() || undefined;
			const syncUrl = await syncActions.createNewSyncDoc(url);
			generatedSyncUrl = syncUrl;
			showSyncUrl = true;
		} catch (error) {
			alert(`Failed to create sync: ${error}`);
		}
	}

	async function joinSync() {
		if (!syncUrlInput.trim()) {
			alert('Please enter a sync URL');
			return;
		}
		try {
			await syncActions.joinSyncDoc(syncUrlInput.trim());
			alert('Successfully joined sync!');
			syncUrlInput = '';
		} catch (error) {
			alert(`Failed to join sync: ${error}`);
		}
	}

	async function manualSync() {
		try {
			await syncActions.performSync();
		} catch (error) {
			alert(`Sync failed: ${error}`);
		}
	}

	function toggleAutoSync() {
		if ($syncState.autoSyncEnabled) {
			syncActions.disableAutoSync();
		} else {
			syncActions.enableAutoSync(5); // 5 minutes
		}
	}

	function disconnectSync() {
		if (confirm('Disconnect from sync? Your local data will be kept but sync will be disabled.')) {
			syncActions.disconnect();
			showSyncUrl = false;
			generatedSyncUrl = '';
			workerUrlInput = '';
		}
	}

	function copySyncUrl() {
		navigator.clipboard.writeText(generatedSyncUrl);
		alert('Sync URL copied to clipboard!');
	}

	function showSetupWizard() {
		setupActions.resetSetup();
		// Reload page to trigger wizard
		window.location.reload();
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
				<button class="action-btn" onclick={showSetupWizard}>
					Show Setup Wizard
				</button>
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

		<section class="setting-section">
			<h2 class="section-title">Cloud Sync</h2>

			{#if !$syncReady}
				<!-- Not configured - show setup options -->
				<div class="sync-setup">
					<p class="setting-description">Sync your data across devices with end-to-end encryption.</p>

					<div class="sync-option">
						<h3 class="option-title">Create New Sync</h3>
						<input
							type="text"
							class="text-input"
							placeholder="Worker URL (optional)"
							bind:value={workerUrlInput}
						/>
						<button class="action-btn" onclick={createSync}>Create Sync</button>
					</div>

					{#if showSyncUrl}
						<div class="sync-url-display">
							<p class="success-message">Sync created! Share this URL to sync with other devices:</p>
							<div class="url-container">
								<input type="text" class="url-input" readonly value={generatedSyncUrl} />
								<button class="copy-btn" onclick={copySyncUrl}>Copy</button>
							</div>
							<p class="warning-message">Keep this URL secure - it contains your encryption key!</p>
						</div>
					{/if}

					<div class="sync-divider">OR</div>

					<div class="sync-option">
						<h3 class="option-title">Join Existing Sync</h3>
						<input
							type="text"
							class="text-input"
							placeholder="Paste sync URL here"
							bind:value={syncUrlInput}
						/>
						<button class="action-btn" onclick={joinSync}>Join Sync</button>
					</div>
				</div>
			{:else}
				<!-- Configured - show sync controls -->
				<div class="sync-controls">
					<div class="sync-status">
						<div class="status-row">
							<span class="status-label">Status:</span>
							<span class="status-value {$syncState.status}">{$syncState.status}</span>
						</div>
						{#if $syncState.lastSyncTime}
							<div class="status-row">
								<span class="status-label">Last Sync:</span>
								<span class="status-value">{new Date($syncState.lastSyncTime).toLocaleString()}</span>
							</div>
						{/if}
						{#if $syncState.error}
							<div class="status-row">
								<span class="status-label">Error:</span>
								<span class="status-value error">{$syncState.error}</span>
							</div>
						{/if}
					</div>

					<div class="setting-actions">
						<button class="action-btn" onclick={manualSync} disabled={$syncState.status === 'syncing'}>
							{$syncState.status === 'syncing' ? 'Syncing...' : 'Sync Now'}
						</button>
						<button
							class="action-btn"
							class:active={$syncState.autoSyncEnabled}
							onclick={toggleAutoSync}
						>
							Auto-Sync: {$syncState.autoSyncEnabled ? 'ON' : 'OFF'}
						</button>
						<button class="action-btn danger" onclick={disconnectSync}>
							Disconnect Sync
						</button>
					</div>
				</div>
			{/if}
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

	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Sync Settings */
	.setting-description {
		margin: 0 0 var(--spacing-md) 0;
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}

	.sync-setup {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.sync-option {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.option-title {
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.text-input {
		padding: var(--spacing-sm) var(--spacing-md);
		border: 2px solid var(--color-border);
		background: var(--color-bg);
		color: var(--color-text);
		border-radius: var(--radius-md);
		font-size: 0.875rem;
		font-family: monospace;
	}

	.text-input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.sync-divider {
		text-align: center;
		color: var(--color-text-secondary);
		font-weight: 500;
		position: relative;
		margin: var(--spacing-md) 0;
	}

	.sync-divider::before,
	.sync-divider::after {
		content: '';
		position: absolute;
		top: 50%;
		width: 40%;
		height: 1px;
		background: var(--color-border);
	}

	.sync-divider::before {
		left: 0;
	}

	.sync-divider::after {
		right: 0;
	}

	.sync-url-display {
		padding: var(--spacing-md);
		background: var(--color-bg);
		border: 2px solid var(--color-success);
		border-radius: var(--radius-md);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.success-message {
		margin: 0;
		color: var(--color-success);
		font-weight: 600;
		font-size: 0.875rem;
	}

	.url-container {
		display: flex;
		gap: var(--spacing-sm);
	}

	.url-input {
		flex: 1;
		padding: var(--spacing-sm);
		border: 1px solid var(--color-border);
		background: var(--color-bg-secondary);
		color: var(--color-text);
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		font-family: monospace;
	}

	.copy-btn {
		padding: var(--spacing-sm) var(--spacing-md);
		border: 2px solid var(--color-primary);
		background: var(--color-primary);
		color: white;
		border-radius: var(--radius-md);
		cursor: pointer;
		font-weight: 600;
		transition: all var(--transition-fast);
	}

	.copy-btn:hover {
		opacity: 0.9;
	}

	.warning-message {
		margin: 0;
		color: var(--color-warning);
		font-size: 0.75rem;
		font-weight: 500;
	}

	.sync-controls {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.sync-status {
		padding: var(--spacing-md);
		background: var(--color-bg);
		border-radius: var(--radius-md);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.status-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.status-label {
		font-weight: 600;
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}

	.status-value {
		font-weight: 500;
		color: var(--color-text);
		font-size: 0.875rem;
	}

	.status-value.idle {
		color: var(--color-text-secondary);
	}

	.status-value.syncing {
		color: var(--color-primary);
	}

	.status-value.success {
		color: var(--color-success);
	}

	.status-value.error {
		color: var(--color-danger);
	}
</style>
