<script lang="ts">
	import { history } from '$lib/stores/mindDiet';
</script>

<svelte:head>
	<title>History - MIND Diet</title>
</svelte:head>

<div class="history-view">
	<header class="header">
		<h1 class="title">History</h1>
		<p class="subtitle">View your past weekly summaries</p>
	</header>

	{#if $history.length === 0}
		<div class="empty-state">
			<p>No history data yet. Start tracking to build your history!</p>
		</div>
	{:else}
		<div class="history-list">
			{#each $history as entry}
				<div class="history-card">
					<h3>Week of {entry.weekStartDate}</h3>
					<p class="modified">Last modified: {new Date(entry.lastModified).toLocaleDateString()}</p>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.history-view {
		max-width: 100%;
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

	.empty-state {
		text-align: center;
		padding: var(--spacing-xl);
		background: var(--color-bg-secondary);
		border-radius: var(--radius-lg);
		color: var(--color-text-secondary);
	}

	.history-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.history-card {
		background: var(--color-bg-secondary);
		border-radius: var(--radius-lg);
		padding: var(--spacing-md);
	}

	.history-card h3 {
		margin: 0 0 var(--spacing-xs) 0;
		color: var(--color-text);
	}

	.modified {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
		margin: 0;
	}
</style>
