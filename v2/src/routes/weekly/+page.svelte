<script lang="ts">
	import {
		currentWeekStartDate,
		currentWeekCounts,
		currentDate,
		mindDietActions
	} from '$lib/stores/mindDiet';
	import { foodGroups } from '$lib/data/foodGroups';
	import { getStatusColor, getProgressPercentage, getWeeklyTarget } from '$lib/services/TrackingEngine';
	import { formatDate, getWeekEndDate } from '$lib/utils/dateUtils';

	let weekStartFormatted = $derived(
		formatDate(new Date($currentWeekStartDate + 'T00:00:00'), {
			includeWeekday: false,
			includeYear: false,
			shortForm: false
		})
	);

	let weekEndFormatted = $derived(() => {
		const endDate = getWeekEndDate($currentWeekStartDate);
		if (endDate) {
			return formatDate(new Date(endDate + 'T00:00:00'), {
				includeWeekday: false,
				includeYear: false,
				shortForm: false
			});
		}
		return '';
	});
</script>

<svelte:head>
	<title>Weekly Summary - MIND Diet</title>
</svelte:head>

<div class="weekly-view">
	<header class="header">
		<h1 class="title">Weekly Summary</h1>
		<p class="subtitle">
			{weekStartFormatted} - {weekEndFormatted()}
		</p>
	</header>

	<div class="week-nav">
		<button class="week-nav-btn" onclick={() => mindDietActions.previousWeek()}>
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
			Previous Week
		</button>
		<button class="week-nav-btn" onclick={() => mindDietActions.goToToday()}>
			Current Week
		</button>
		<button class="week-nav-btn" onclick={() => mindDietActions.nextWeek()}>
			Next Week
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
	</div>

	<div class="food-groups-list">
		{#each foodGroups as foodGroup}
			{@const count = $currentWeekCounts[foodGroup.id] || 0}
			{@const target = getWeeklyTarget(foodGroup)}
			{@const percentage = getProgressPercentage(count, foodGroup, 7)}
			{@const statusColor = getStatusColor(count, foodGroup, 7)}

			<div class="food-group-row">
				<div class="row-header">
					<div class="food-group-info">
						<h3 class="food-group-name">{foodGroup.name}</h3>
						<p class="food-group-target">
							{#if foodGroup.type === 'positive'}
								Target: {target} {foodGroup.unit}
							{:else}
								Limit: ≤{target} {foodGroup.unit}
							{/if}
						</p>
					</div>
					<div class="count-display" style="color: {statusColor}">
						<span class="count-value">{count}</span>
						<span class="count-target">/ {target}</span>
					</div>
				</div>

				<div class="progress-container">
					<div class="progress-bar">
						<div
							class="progress-fill"
							style="width: {percentage}%; background-color: {statusColor};"
						></div>
					</div>
					<span class="progress-text">{percentage}%</span>
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.weekly-view {
		max-width: 100%;
	}

	.header {
		margin-bottom: var(--spacing-lg);
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

	.week-nav {
		display: flex;
		justify-content: center;
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-xl);
	}

	.week-nav-btn {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-sm) var(--spacing-md);
		border: 2px solid var(--color-border);
		background: var(--color-bg);
		color: var(--color-text);
		border-radius: var(--radius-md);
		cursor: pointer;
		font-weight: 500;
		transition: all var(--transition-fast);
	}

	.week-nav-btn:hover {
		background: var(--color-primary);
		color: white;
		border-color: var(--color-primary);
	}

	.food-groups-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.food-group-row {
		background: var(--color-bg-secondary);
		border-radius: var(--radius-lg);
		padding: var(--spacing-md);
		transition: all var(--transition-base);
	}

	.food-group-row:hover {
		transform: translateY(-2px);
		box-shadow: var(--shadow-md);
	}

	.row-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: var(--spacing-md);
	}

	.food-group-info {
		flex: 1;
	}

	.food-group-name {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 var(--spacing-xs) 0;
	}

	.food-group-target {
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		margin: 0;
	}

	.count-display {
		text-align: right;
	}

	.count-value {
		font-size: 2rem;
		font-weight: 700;
		line-height: 1;
	}

	.count-target {
		font-size: 1rem;
		color: var(--color-text-secondary);
	}

	.progress-container {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
	}

	.progress-bar {
		flex: 1;
		height: 24px;
		background: var(--color-bg-tertiary);
		border-radius: var(--radius-full);
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		transition: width var(--transition-slow);
		border-radius: var(--radius-full);
	}

	.progress-text {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		min-width: 45px;
		text-align: right;
	}

	@media (max-width: 768px) {
		.title {
			font-size: 1.5rem;
		}

		.subtitle {
			font-size: 1rem;
		}

		.week-nav {
			flex-direction: column;
		}

		.week-nav-btn {
			justify-content: center;
		}

		.count-value {
			font-size: 1.5rem;
		}
	}
</style>
