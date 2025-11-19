<script lang="ts">
	import { syncActions } from '$lib/stores/sync';

	interface Props {
		onclose: () => void;
	}

	let { onclose }: Props = $props();

	let currentStep = $state(0);
	let syncUrl = $state('');
	let workerUrl = $state('');
	let setupType = $state<'create' | 'join' | 'skip' | null>(null);
	let isLoading = $state(false);
	let errorMessage = $state('');

	const totalSteps = 5;

	async function handleSyncSetup() {
		if (setupType === 'skip') {
			nextStep();
			return;
		}

		isLoading = true;
		errorMessage = '';

		try {
			if (setupType === 'create') {
				const url = await syncActions.createNewSyncDoc(workerUrl || undefined);
				syncUrl = url;
				nextStep();
			} else if (setupType === 'join') {
				await syncActions.joinSyncDoc(syncUrl);
				nextStep();
			}
		} catch (error) {
			errorMessage = `Setup failed: ${error}`;
		} finally {
			isLoading = false;
		}
	}

	function nextStep() {
		if (currentStep < totalSteps - 1) {
			currentStep++;
		}
	}

	function prevStep() {
		if (currentStep > 0) {
			currentStep--;
		}
	}

	function skipToEnd() {
		currentStep = totalSteps - 1;
	}

	function copySyncUrl() {
		navigator.clipboard.writeText(syncUrl);
	}
</script>

<div class="wizard-backdrop" onclick={onclose}>
	<div class="wizard-modal" onclick={(e) => e.stopPropagation()}>
		<!-- Progress Indicator -->
		<div class="wizard-progress">
			<div class="progress-bar">
				<div class="progress-fill" style="width: {((currentStep + 1) / totalSteps) * 100}%"></div>
			</div>
			<div class="progress-text">Step {currentStep + 1} of {totalSteps}</div>
		</div>

		<!-- Step Content -->
		<div class="wizard-content">
			{#if currentStep === 0}
				<!-- Welcome -->
				<div class="wizard-step">
					<h2 class="step-title">Welcome to MIND Diet Tracker!</h2>
					<div class="step-body">
						<p class="intro-text">
							The MIND diet combines the Mediterranean and DASH diets to support brain health and
							reduce the risk of cognitive decline.
						</p>
						<div class="feature-list">
							<div class="feature-item">
								<span class="feature-icon">📊</span>
								<div class="feature-text">
									<strong>Track Daily Intake</strong>
									<p>Log servings of 15 food groups each day</p>
								</div>
							</div>
							<div class="feature-item">
								<span class="feature-icon">📈</span>
								<div class="feature-text">
									<strong>Weekly Summaries</strong>
									<p>See your progress toward weekly goals</p>
								</div>
							</div>
							<div class="feature-item">
								<span class="feature-icon">📱</span>
								<div class="feature-text">
									<strong>Works Offline</strong>
									<p>All data stored locally on your device</p>
								</div>
							</div>
							<div class="feature-item">
								<span class="feature-icon">🔒</span>
								<div class="feature-text">
									<strong>Optional Cloud Sync</strong>
									<p>Sync across devices with end-to-end encryption</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			{:else if currentStep === 1}
				<!-- MIND Diet Basics -->
				<div class="wizard-step">
					<h2 class="step-title">MIND Diet Basics</h2>
					<div class="step-body">
						<p class="intro-text">
							The MIND diet includes 10 brain-healthy food groups to eat more of, and 5 groups to
							limit.
						</p>
						<div class="food-groups-overview">
							<div class="food-group-section">
								<h3 class="section-heading">Brain-Healthy Foods (Eat More)</h3>
								<ul class="food-list">
									<li>🌾 Whole Grains (≥3 servings/day)</li>
									<li>🥬 Green Leafy Vegetables (≥6 servings/week)</li>
									<li>🥗 Other Vegetables (≥1 serving/day)</li>
									<li>🫐 Berries (≥2 servings/week)</li>
									<li>🥜 Nuts (≥5 servings/week)</li>
									<li>🫘 Beans (≥3 servings/week)</li>
									<li>🐟 Fish (≥1 serving/week)</li>
									<li>🍗 Poultry (≥2 servings/week)</li>
									<li>🫒 Olive Oil (primary oil)</li>
									<li>🍷 Wine (optional, ≤1 glass/day)</li>
								</ul>
							</div>
							<div class="food-group-section">
								<h3 class="section-heading">Foods to Limit</h3>
								<ul class="food-list">
									<li>🧈 Butter & Margarine (&lt;1 tbsp/day)</li>
									<li>🧀 Cheese (&lt;1 serving/week)</li>
									<li>🥩 Red Meat (&lt;4 servings/week)</li>
									<li>🍟 Fried/Fast Food (&lt;1 serving/week)</li>
									<li>🍰 Pastries & Sweets (&lt;5 servings/week)</li>
								</ul>
							</div>
						</div>
					</div>
				</div>
			{:else if currentStep === 2}
				<!-- How to Use -->
				<div class="wizard-step">
					<h2 class="step-title">How to Use This App</h2>
					<div class="step-body">
						<div class="instruction-list">
							<div class="instruction-item">
								<div class="instruction-number">1</div>
								<div class="instruction-content">
									<h4>Daily Tracking</h4>
									<p>
										Use the Daily view to log your food intake each day. Click the + and - buttons
										to adjust servings. Your progress updates automatically.
									</p>
								</div>
							</div>
							<div class="instruction-item">
								<div class="instruction-number">2</div>
								<div class="instruction-content">
									<h4>Weekly Summary</h4>
									<p>
										Check the Weekly view to see your progress toward weekly goals. Each food group
										shows your total for the week and whether you've met your target.
									</p>
								</div>
							</div>
							<div class="instruction-item">
								<div class="instruction-number">3</div>
								<div class="instruction-content">
									<h4>History</h4>
									<p>
										Browse past weeks in the History view to track your long-term adherence to the
										MIND diet.
									</p>
								</div>
							</div>
							<div class="instruction-item">
								<div class="instruction-number">4</div>
								<div class="instruction-content">
									<h4>Settings</h4>
									<p>
										Customize your experience with theme options, week start day preferences, and
										optional cloud sync.
									</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			{:else if currentStep === 3}
				<!-- Optional Sync Setup -->
				<div class="wizard-step">
					<h2 class="step-title">Cloud Sync (Optional)</h2>
					<div class="step-body">
						{#if !setupType}
							<p class="intro-text">
								Would you like to set up cloud sync? This allows you to access your data across
								multiple devices with end-to-end encryption.
							</p>
							<div class="sync-options">
								<button class="sync-option-btn" onclick={() => (setupType = 'create')}>
									<span class="option-icon">➕</span>
									<div class="option-text">
										<strong>Create New Sync</strong>
										<p>Start fresh and get a shareable URL</p>
									</div>
								</button>
								<button class="sync-option-btn" onclick={() => (setupType = 'join')}>
									<span class="option-icon">🔗</span>
									<div class="option-text">
										<strong>Join Existing Sync</strong>
										<p>Enter a sync URL from another device</p>
									</div>
								</button>
								<button class="sync-option-btn" onclick={() => (setupType = 'skip')}>
									<span class="option-icon">⏭️</span>
									<div class="option-text">
										<strong>Skip for Now</strong>
										<p>You can set this up later in Settings</p>
									</div>
								</button>
							</div>
						{:else if setupType === 'create'}
							<div class="sync-setup-form">
								<p class="form-description">
									Enter your Cloudflare Worker URL (or leave blank to use default):
								</p>
								<input
									type="text"
									class="text-input"
									placeholder="https://your-worker.workers.dev (optional)"
									bind:value={workerUrl}
								/>
								{#if errorMessage}
									<p class="error-message">{errorMessage}</p>
								{/if}
								<div class="form-actions">
									<button class="btn-secondary" onclick={() => (setupType = null)}>Back</button>
									<button class="btn-primary" onclick={handleSyncSetup} disabled={isLoading}>
										{isLoading ? 'Creating...' : 'Create Sync'}
									</button>
								</div>
							</div>
						{:else if setupType === 'join'}
							<div class="sync-setup-form">
								<p class="form-description">Paste the sync URL from your other device:</p>
								<textarea
									class="text-input textarea"
									placeholder="https://your-worker.workers.dev/sync/..."
									bind:value={syncUrl}
									rows="3"
								></textarea>
								{#if errorMessage}
									<p class="error-message">{errorMessage}</p>
								{/if}
								<div class="form-actions">
									<button class="btn-secondary" onclick={() => (setupType = null)}>Back</button>
									<button
										class="btn-primary"
										onclick={handleSyncSetup}
										disabled={isLoading || !syncUrl.trim()}
									>
										{isLoading ? 'Joining...' : 'Join Sync'}
									</button>
								</div>
							</div>
						{:else if setupType === 'skip'}
							<div class="sync-skipped">
								<p class="skip-message">
									No problem! You can set up cloud sync anytime from the Settings page.
								</p>
								<button class="btn-primary" onclick={nextStep}>Continue</button>
							</div>
						{/if}
					</div>
				</div>
			{:else if currentStep === 4}
				<!-- Completion -->
				<div class="wizard-step">
					<h2 class="step-title">You're All Set! 🎉</h2>
					<div class="step-body">
						{#if syncUrl && setupType === 'create'}
							<div class="sync-url-section">
								<p class="success-message">
									Sync created successfully! Here's your shareable URL:
								</p>
								<div class="url-display">
									<input type="text" class="url-input" readonly value={syncUrl} />
									<button class="copy-btn" onclick={copySyncUrl}>Copy</button>
								</div>
								<p class="warning-message">
									Save this URL securely - it contains your encryption key!
								</p>
							</div>
						{/if}
						<p class="completion-text">
							You're ready to start tracking your MIND diet adherence. Remember:
						</p>
						<ul class="tips-list">
							<li>Log your food intake daily for best results</li>
							<li>Check your weekly summary to stay on track</li>
							<li>The MIND diet is a lifestyle, not a strict rule book</li>
							<li>Consistency matters more than perfection</li>
						</ul>
						<button class="btn-primary btn-large" onclick={onclose}>Start Tracking</button>
					</div>
				</div>
			{/if}
		</div>

		<!-- Navigation Buttons -->
		{#if currentStep !== 4}
			<div class="wizard-footer">
				{#if currentStep > 0}
					<button class="btn-secondary" onclick={prevStep}>Back</button>
				{:else}
					<button class="btn-secondary" onclick={onclose}>Skip Setup</button>
				{/if}
				{#if currentStep < 3}
					<button class="btn-primary" onclick={nextStep}>Next</button>
				{:else if currentStep === 3 && !setupType}
					<!-- No next button, user must choose an option -->
				{:else if currentStep === 3 && setupType === 'skip'}
					<!-- Skip button shown in step content -->
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.wizard-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: var(--spacing-md);
	}

	.wizard-modal {
		background: var(--color-bg);
		border-radius: var(--radius-lg);
		max-width: 600px;
		width: 100%;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		box-shadow: var(--shadow-lg);
		overflow: hidden;
	}

	.wizard-progress {
		padding: var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
		background: var(--color-bg-secondary);
	}

	.progress-bar {
		height: 4px;
		background: var(--color-border);
		border-radius: var(--radius-full);
		overflow: hidden;
		margin-bottom: var(--spacing-sm);
	}

	.progress-fill {
		height: 100%;
		background: var(--color-success);
		transition: width var(--transition-base);
	}

	.progress-text {
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		text-align: center;
	}

	.wizard-content {
		flex: 1;
		overflow-y: auto;
		padding: var(--spacing-xl);
	}

	.wizard-step {
		min-height: 300px;
	}

	.step-title {
		font-size: 1.75rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0 0 var(--spacing-lg) 0;
		text-align: center;
	}

	.step-body {
		color: var(--color-text);
	}

	.intro-text {
		font-size: 1rem;
		line-height: 1.6;
		color: var(--color-text-secondary);
		margin: 0 0 var(--spacing-lg) 0;
	}

	/* Feature List */
	.feature-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.feature-item {
		display: flex;
		gap: var(--spacing-md);
		align-items: flex-start;
	}

	.feature-icon {
		font-size: 2rem;
		flex-shrink: 0;
	}

	.feature-text strong {
		display: block;
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: var(--spacing-xs);
	}

	.feature-text p {
		margin: 0;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
	}

	/* Food Groups Overview */
	.food-groups-overview {
		display: grid;
		gap: var(--spacing-lg);
	}

	.food-group-section {
		background: var(--color-bg-secondary);
		padding: var(--spacing-md);
		border-radius: var(--radius-md);
	}

	.section-heading {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 var(--spacing-md) 0;
	}

	.food-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--spacing-sm);
	}

	.food-list li {
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		padding: var(--spacing-xs) 0;
	}

	/* Instructions */
	.instruction-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.instruction-item {
		display: flex;
		gap: var(--spacing-md);
		align-items: flex-start;
	}

	.instruction-number {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--color-success);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		flex-shrink: 0;
	}

	.instruction-content h4 {
		margin: 0 0 var(--spacing-xs) 0;
		font-weight: 600;
		color: var(--color-text);
	}

	.instruction-content p {
		margin: 0;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	/* Sync Options */
	.sync-options {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
		margin-top: var(--spacing-lg);
	}

	.sync-option-btn {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		padding: var(--spacing-md);
		border: 2px solid var(--color-border);
		background: var(--color-bg);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: all var(--transition-fast);
		text-align: left;
	}

	.sync-option-btn:hover {
		border-color: var(--color-success);
		background: var(--color-bg-secondary);
	}

	.option-icon {
		font-size: 2rem;
		flex-shrink: 0;
	}

	.option-text strong {
		display: block;
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: var(--spacing-xs);
	}

	.option-text p {
		margin: 0;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
	}

	/* Sync Setup Form */
	.sync-setup-form {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.form-description {
		margin: 0;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
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
		border-color: var(--color-success);
	}

	.textarea {
		resize: vertical;
		font-family: monospace;
	}

	.form-actions {
		display: flex;
		gap: var(--spacing-sm);
		justify-content: flex-end;
	}

	.error-message {
		margin: 0;
		padding: var(--spacing-sm);
		background: rgba(239, 68, 68, 0.1);
		color: var(--color-danger);
		border-radius: var(--radius-md);
		font-size: 0.875rem;
	}

	.sync-skipped {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
		align-items: center;
		padding: var(--spacing-xl) 0;
	}

	.skip-message {
		margin: 0;
		text-align: center;
		color: var(--color-text-secondary);
	}

	/* Completion */
	.sync-url-section {
		background: var(--color-bg-secondary);
		padding: var(--spacing-md);
		border-radius: var(--radius-md);
		margin-bottom: var(--spacing-lg);
	}

	.success-message {
		margin: 0 0 var(--spacing-sm) 0;
		color: var(--color-success);
		font-weight: 600;
		font-size: 0.875rem;
	}

	.url-display {
		display: flex;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-sm);
	}

	.url-input {
		flex: 1;
		padding: var(--spacing-sm);
		border: 1px solid var(--color-border);
		background: var(--color-bg);
		color: var(--color-text);
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		font-family: monospace;
	}

	.copy-btn {
		padding: var(--spacing-sm) var(--spacing-md);
		border: 2px solid var(--color-success);
		background: var(--color-success);
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

	.completion-text {
		font-size: 1rem;
		color: var(--color-text-secondary);
		margin: 0 0 var(--spacing-md) 0;
	}

	.tips-list {
		list-style: none;
		padding: 0;
		margin: 0 0 var(--spacing-xl) 0;
	}

	.tips-list li {
		padding: var(--spacing-sm) 0;
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}

	.tips-list li::before {
		content: '✓';
		color: var(--color-success);
		font-weight: 700;
		margin-right: var(--spacing-sm);
	}

	/* Buttons */
	.btn-primary,
	.btn-secondary {
		padding: var(--spacing-sm) var(--spacing-lg);
		border-radius: var(--radius-md);
		font-weight: 600;
		cursor: pointer;
		transition: all var(--transition-fast);
		border: 2px solid;
		font-size: 0.875rem;
	}

	.btn-primary {
		background: var(--color-success);
		color: white;
		border-color: var(--color-success);
	}

	.btn-primary:hover:not(:disabled) {
		opacity: 0.9;
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-secondary {
		background: var(--color-bg);
		color: var(--color-text);
		border-color: var(--color-border);
	}

	.btn-secondary:hover {
		background: var(--color-bg-secondary);
	}

	.btn-large {
		padding: var(--spacing-md) var(--spacing-xl);
		font-size: 1rem;
		width: 100%;
	}

	.wizard-footer {
		padding: var(--spacing-md);
		border-top: 1px solid var(--color-border);
		display: flex;
		justify-content: space-between;
		gap: var(--spacing-sm);
		background: var(--color-bg-secondary);
	}

	@media (max-width: 640px) {
		.wizard-modal {
			max-width: 100%;
			max-height: 100vh;
			border-radius: 0;
		}

		.wizard-content {
			padding: var(--spacing-md);
		}

		.step-title {
			font-size: 1.5rem;
		}

		.feature-icon,
		.option-icon {
			font-size: 1.5rem;
		}

		.instruction-number {
			width: 28px;
			height: 28px;
			font-size: 0.875rem;
		}
	}
</style>
