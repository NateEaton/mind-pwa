<script lang="ts">
	import { formatDate, isSameDay, getToday } from '$lib/utils/dateUtils';

	interface Props {
		date: Date;
		onprevious: () => void;
		onnext: () => void;
		ontoday: () => void;
	}

	let { date, onprevious, onnext, ontoday }: Props = $props();

	let dateString = $derived(
		formatDate(date, {
			includeWeekday: true,
			includeYear: false,
			shortForm: false
		})
	);

	let isToday = $derived(isSameDay(date, getToday()));
</script>

<div class="date-navigator">
	<button class="nav-btn" onclick={onprevious} aria-label="Previous day">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<polyline points="15 18 9 12 15 6"></polyline>
		</svg>
	</button>

	<div class="date-display">
		<span class="date-text">{dateString}</span>
		{#if isToday}
			<span class="today-badge">Today</span>
		{/if}
	</div>

	<button class="nav-btn" onclick={onnext} aria-label="Next day">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<polyline points="9 18 15 12 9 6"></polyline>
		</svg>
	</button>

	{#if !isToday}
		<button class="today-btn" onclick={ontoday}> Go to Today </button>
	{/if}
</div>

<style>
	.date-navigator {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-md);
		padding: var(--spacing-md);
		background: var(--color-bg-secondary);
		border-radius: var(--radius-lg);
		margin-bottom: var(--spacing-lg);
	}

	.nav-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border: 2px solid var(--color-border);
		background: var(--color-bg);
		color: var(--color-text);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.nav-btn:hover {
		background: var(--color-primary);
		color: white;
		border-color: var(--color-primary);
	}

	.date-display {
		flex: 1;
		text-align: center;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
	}

	.date-text {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.today-badge {
		display: inline-block;
		padding: var(--spacing-xs) var(--spacing-sm);
		background: var(--color-success);
		color: white;
		font-size: 0.75rem;
		font-weight: 600;
		border-radius: var(--radius-sm);
	}

	.today-btn {
		padding: var(--spacing-sm) var(--spacing-md);
		border: 2px solid var(--color-primary);
		background: var(--color-bg);
		color: var(--color-primary);
		border-radius: var(--radius-md);
		cursor: pointer;
		font-weight: 600;
		transition: all var(--transition-fast);
	}

	.today-btn:hover {
		background: var(--color-primary);
		color: white;
	}

	@media (max-width: 640px) {
		.date-navigator {
			flex-wrap: wrap;
		}

		.date-display {
			flex-basis: 100%;
			order: -1;
			margin-bottom: var(--spacing-sm);
		}

		.date-text {
			font-size: 1rem;
		}
	}
</style>
