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

	<div class="food-groups-grid">
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

	.food-groups-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: var(--spacing-lg);
	}

	@media (max-width: 768px) {
		.title {
			font-size: 1.5rem;
		}

		.subtitle {
			font-size: 1rem;
		}

		.food-groups-grid {
			grid-template-columns: 1fr;
			gap: var(--spacing-md);
		}
	}
</style>
