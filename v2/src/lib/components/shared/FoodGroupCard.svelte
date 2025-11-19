<script lang="ts">
	import type { FoodGroup } from '$lib/types';
	import { getStatusColor, isDailyTargetMet, isWeeklyTargetMet } from '$lib/services/TrackingEngine';
	import { mindDietActions, currentWeekCounts } from '$lib/stores/mindDiet';

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

	// Get weekly total for badge
	let weeklyTotal = $derived($currentWeekCounts[foodGroup.id] || 0);
	let weeklyStatusColor = $derived(getStatusColor(weeklyTotal, foodGroup, 7));

	let showInfo = $state(false);

	function increment() {
		mindDietActions.incrementCount(date, foodGroup.id);
	}

	function decrement() {
		mindDietActions.decrementCount(date, foodGroup.id);
	}

	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		const value = parseInt(target.value) || 0;
		mindDietActions.updateDailyCount(date, foodGroup.id, Math.max(0, value));
	}
</script>

<div class="food-group-item">
	<div class="info">
		<button class="info-btn" onclick={() => (showInfo = !showInfo)} aria-label="Show info">i</button>
		<div class="text-container">
			<div class="name-row">
				<span class="name">{foodGroup.name}</span>
				{#if foodGroup.isOptional}
					<span class="optional">(opt)</span>
				{/if}
			</div>
			<span class="target">
				{#if foodGroup.type === 'positive'}
					≥{foodGroup.target} {foodGroup.unit}/{foodGroup.frequency}
				{:else}
					&lt;{foodGroup.target} {foodGroup.unit}/{foodGroup.frequency}
				{/if}
			</span>
		</div>
	</div>

	<div class="controls">
		<span class="weekly-badge" style="background-color: {weeklyStatusColor}">
			{weeklyTotal}
		</span>
		<button
			class="decrement-btn"
			onclick={decrement}
			disabled={count === 0}
			aria-label="Decrement count"
		>
			−
		</button>
		<input
			type="number"
			class="count-input"
			value={count}
			min="0"
			oninput={handleInput}
			aria-label="Current count"
		/>
		<button class="increment-btn" onclick={increment} aria-label="Increment count">+</button>
	</div>
</div>

{#if showInfo}
	<div class="info-panel">
		{foodGroup.description}
	</div>
{/if}

<style>
	.food-group-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--spacing-md) 0;
		border-bottom: 1px solid var(--color-border);
		flex-wrap: nowrap;
		gap: var(--spacing-md);
	}

	.food-group-item:last-child {
		border-bottom: none;
	}

	.info {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		flex: 1;
		min-width: 0;
	}

	.info-btn {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		border: 1px solid var(--color-primary);
		background: transparent;
		color: var(--color-primary);
		font-size: 0.75rem;
		font-weight: bold;
		cursor: pointer;
		flex-shrink: 0;
		transition: all var(--transition-fast);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.info-btn:hover {
		background: var(--color-primary);
		color: white;
	}

	.text-container {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.name-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.name {
		font-weight: 600;
		color: var(--color-text);
		font-size: var(--font-md);
		line-height: 1.2;
	}

	.optional {
		font-size: var(--font-xs);
		color: var(--color-text-muted);
		font-weight: normal;
	}

	.target {
		font-size: var(--font-sm);
		color: var(--color-text-secondary);
		line-height: 1.2;
	}

	.controls {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		flex-shrink: 0;
	}

	.weekly-badge {
		min-width: 28px;
		height: 20px;
		padding: 2px 6px;
		border-radius: 10px;
		font-size: var(--font-xs);
		font-weight: 600;
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.decrement-btn,
	.increment-btn {
		width: 30px;
		height: 30px;
		border-radius: 50%;
		border: none;
		font-size: 1.2rem;
		font-weight: bold;
		cursor: pointer;
		transition: all var(--transition-fast);
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
	}

	.decrement-btn {
		background: var(--color-accent);
		color: white;
	}

	.decrement-btn:hover:not(:disabled) {
		background: #F57C00;
		transform: scale(1.05);
	}

	.decrement-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.increment-btn {
		background: var(--color-primary);
		color: white;
	}

	.increment-btn:hover {
		background: var(--color-primary-dark);
		transform: scale(1.05);
	}

	.decrement-btn:active:not(:disabled),
	.increment-btn:active {
		transform: scale(0.95);
	}

	.count-input {
		width: 40px;
		height: 30px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		text-align: center;
		font-size: var(--font-md);
		font-weight: 600;
		color: var(--color-text);
		background: var(--color-bg-secondary);
		-moz-appearance: textfield;
	}

	.count-input::-webkit-outer-spin-button,
	.count-input::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	.count-input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.info-panel {
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-bg-tertiary);
		border-left: 3px solid var(--color-primary);
		margin: var(--spacing-sm) 0;
		font-size: var(--font-sm);
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	@media (max-width: 480px) {
		.decrement-btn,
		.increment-btn {
			width: 28px;
			height: 28px;
		}

		.count-input {
			width: 35px;
		}

		.weekly-badge {
			font-size: 0.7rem;
			padding: 2px 4px;
		}

		.name {
			font-size: var(--font-sm);
		}

		.target {
			font-size: var(--font-xs);
		}
	}
</style>
