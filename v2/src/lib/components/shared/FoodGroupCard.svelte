<script lang="ts">
	import type { FoodGroup } from '$lib/types';
	import { getStatusColor, isDailyTargetMet, isWeeklyTargetMet } from '$lib/services/TrackingEngine';
	import { mindDietActions } from '$lib/stores/mindDiet';

	interface Props {
		foodGroup: FoodGroup;
		count: number;
		date: string;
		daysIntoWeek?: number;
	}

	let { foodGroup, count, date, daysIntoWeek = 7 }: Props = $props();

	let statusColor = $derived(getStatusColor(count, foodGroup, daysIntoWeek));
	let targetMet = $derived(
		(foodGroup.frequency === 'day' && isDailyTargetMet(count, foodGroup)) ||
			(foodGroup.frequency === 'week' && isWeeklyTargetMet(count, foodGroup))
	);

	function increment() {
		mindDietActions.incrementCount(date, foodGroup.id);
	}

	function decrement() {
		mindDietActions.decrementCount(date, foodGroup.id);
	}
</script>

<div class="food-group-card" style="border-left: 4px solid {foodGroup.type === 'positive' ? 'var(--color-success)' : 'var(--color-warning)'}">
	<div class="header">
		<div class="title-section">
			<h3 class="title">{foodGroup.name}</h3>
			{#if foodGroup.isOptional}
				<span class="optional-badge">Optional</span>
			{/if}
		</div>
		<div class="target">
			{#if foodGroup.type === 'positive'}
				Target: {foodGroup.target} {foodGroup.unit}/{foodGroup.frequency}
			{:else}
				Limit: ≤{foodGroup.target} {foodGroup.unit}/{foodGroup.frequency}
			{/if}
		</div>
	</div>

	<div class="controls">
		<button
			class="btn-control btn-decrement"
			onclick={decrement}
			disabled={count === 0}
			aria-label="Decrease count"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<line x1="5" y1="12" x2="19" y2="12"></line>
			</svg>
		</button>

		<div class="count" style="color: {statusColor}">
			<span class="count-value">{count}</span>
			{#if targetMet}
				<span class="check-icon">✓</span>
			{/if}
		</div>

		<button class="btn-control btn-increment" onclick={increment} aria-label="Increase count">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<line x1="12" y1="5" x2="12" y2="19"></line>
				<line x1="5" y1="12" x2="19" y2="12"></line>
			</svg>
		</button>
	</div>

	<div class="description">
		{foodGroup.description}
	</div>
</div>

<style>
	.food-group-card {
		background: var(--color-bg-secondary);
		border-radius: var(--radius-lg);
		padding: var(--spacing-md);
		transition: all var(--transition-base);
	}

	.food-group-card:hover {
		transform: translateY(-2px);
		box-shadow: var(--shadow-lg);
	}

	.header {
		margin-bottom: var(--spacing-md);
	}

	.title-section {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-xs);
	}

	.title {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.optional-badge {
		font-size: 0.75rem;
		padding: 2px 6px;
		background: var(--color-info);
		color: white;
		border-radius: var(--radius-sm);
		font-weight: 500;
	}

	.target {
		font-size: 0.875rem;
		color: var(--color-text-secondary);
	}

	.controls {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-lg);
		margin-bottom: var(--spacing-md);
		padding: var(--spacing-md) 0;
	}

	.btn-control {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		border-radius: var(--radius-full);
		border: 2px solid var(--color-border);
		background: var(--color-bg);
		color: var(--color-text);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.btn-control:hover:not(:disabled) {
		background: var(--color-primary);
		color: white;
		border-color: var(--color-primary);
		transform: scale(1.05);
	}

	.btn-control:active:not(:disabled) {
		transform: scale(0.95);
	}

	.btn-control:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.count {
		min-width: 80px;
		text-align: center;
		position: relative;
	}

	.count-value {
		font-size: 2.5rem;
		font-weight: 700;
		line-height: 1;
	}

	.check-icon {
		position: absolute;
		top: -8px;
		right: -8px;
		font-size: 1.5rem;
		color: var(--color-success);
	}

	.description {
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
		padding-top: var(--spacing-sm);
		border-top: 1px solid var(--color-border);
	}

	@media (max-width: 640px) {
		.title {
			font-size: 1rem;
		}

		.btn-control {
			width: 44px;
			height: 44px;
		}

		.count-value {
			font-size: 2rem;
		}
	}
</style>
