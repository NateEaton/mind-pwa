<script lang="ts">
	import { settings } from '$lib/stores/mindDiet';
	import { getWeekDates } from '$lib/utils/dateUtils';
	import { formatDate } from '$lib/utils/dateUtils';

	interface Props {
		selectedDate: Date;
		onSelectDate: (date: Date) => void;
	}

	let { selectedDate, onSelectDate }: Props = $props();

	// Get the 7 days of the current week
	let weekDays = $derived(() => {
		const dates = getWeekDates(selectedDate, $settings.weekStartDay);
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		return dates.map(dateStr => {
			const date = new Date(dateStr);
			const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'narrow' });
			const isToday = date.getTime() === today.getTime();
			const isSelected = date.getTime() === selectedDate.getTime();

			return {
				date,
				dayOfWeek,
				isToday,
				isSelected
			};
		});
	});
</script>

<div class="day-selector-bar">
	{#each weekDays() as day}
		<button
			class="day-button"
			class:active={day.isSelected}
			class:today={day.isToday}
			onclick={() => onSelectDate(day.date)}
			aria-label={formatDate(day.date)}
		>
			{day.dayOfWeek}
		</button>
	{/each}
</div>

<style>
	.day-selector-bar {
		background: #e9e9e9;
		border-radius: 16px;
		padding: var(--spacing-xs);
		display: flex;
		justify-content: space-around;
		gap: var(--spacing-xs);
		margin-bottom: var(--spacing-lg);
	}

	.day-button {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		border: none;
		background: transparent;
		color: var(--color-text);
		font-size: var(--font-sm);
		font-weight: 600;
		cursor: pointer;
		transition: all var(--transition-fast);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.day-button:hover {
		background: #d0d0d0;
	}

	.day-button.active {
		background: var(--color-primary);
		color: white;
	}

	.day-button.today:not(.active) {
		border: 2px solid var(--color-primary);
	}

	@media (max-width: 360px) {
		.day-button {
			width: 28px;
			height: 28px;
			font-size: 0.75rem;
		}
	}
</style>
