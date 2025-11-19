<script lang="ts">
	import { currentDate, currentDateString, currentDayCounts, currentWeekStartDate, mindDietActions } from '$lib/stores/mindDiet';
	import { foodGroups } from '$lib/data/foodGroups';
	import DaySelector from '$lib/components/shared/DaySelector.svelte';
	import FoodGroupCard from '$lib/components/shared/FoodGroupCard.svelte';
	import { formatDate } from '$lib/utils/dateUtils';

	function handleDateSelect(date: Date) {
		mindDietActions.goToDate(date);
	}
</script>

<svelte:head>
	<title>Daily Tracker - MIND Diet</title>
</svelte:head>

<div class="daily-view">
	<header class="header">
		<h2 class="week-range">
			{formatDate($currentDate)}
		</h2>
	</header>

	<DaySelector selectedDate={$currentDate} onSelectDate={handleDateSelect} />

	<div class="food-groups-list">
		{#each foodGroups as foodGroup}
			<FoodGroupCard
				{foodGroup}
				count={$currentDayCounts[foodGroup.id] || 0}
				date={$currentDateString}
			/>
		{/each}
	</div>
</div>

<style>
	.daily-view {
		max-width: 100%;
	}

	.header {
		margin-bottom: var(--spacing-md);
		text-align: center;
	}

	.week-range {
		font-size: var(--font-lg);
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.food-groups-list {
		background: var(--color-bg-secondary);
		border-radius: var(--radius-md);
		padding: 0 var(--spacing-md);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	@media (max-width: 480px) {
		.week-range {
			font-size: var(--font-md);
		}
	}
</style>
