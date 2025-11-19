<script lang="ts">
	import { currentDate, currentDateString, currentDayCounts, mindDietActions } from '$lib/stores/mindDiet';
	import { foodGroups } from '$lib/data/foodGroups';
	import DateNavigator from '$lib/components/shared/DateNavigator.svelte';
	import FoodGroupCard from '$lib/components/shared/FoodGroupCard.svelte';
</script>

<svelte:head>
	<title>Daily Tracker - MIND Diet</title>
</svelte:head>

<div class="daily-view">
	<header class="header">
		<h1 class="title">Daily Tracker</h1>
		<p class="subtitle">Track your MIND Diet food groups for the day</p>
	</header>

	<DateNavigator
		date={$currentDate}
		onprevious={() => mindDietActions.previousDay()}
		onnext={() => mindDietActions.nextDay()}
		ontoday={() => mindDietActions.goToToday()}
	/>

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
		margin-bottom: var(--spacing-lg);
		text-align: center;
	}

	.title {
		font-size: var(--font-xl);
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 var(--spacing-xs) 0;
	}

	.subtitle {
		font-size: var(--font-md);
		color: var(--color-text-secondary);
		margin: 0;
	}

	.food-groups-list {
		background: var(--color-bg-secondary);
		border-radius: var(--radius-md);
		padding: 0 var(--spacing-md);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	@media (max-width: 480px) {
		.header {
			margin-bottom: var(--spacing-md);
		}

		.title {
			font-size: var(--font-lg);
		}

		.subtitle {
			font-size: var(--font-sm);
		}
	}
</style>
