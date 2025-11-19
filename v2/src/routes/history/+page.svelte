<script lang="ts">
	import { dailyCounts, settings, mindDietActions } from '$lib/stores/mindDiet';
	import { foodGroups } from '$lib/data/foodGroups';
	import {
		getWeekStartDate,
		getWeekEndDate,
		formatDate,
		formatDateToYYYYMMDD,
		getWeekDates
	} from '$lib/utils/dateUtils';
	import { calculateWeeklyTotals, getStatusColor, getWeeklyTarget } from '$lib/services/TrackingEngine';

	let viewingWeekStart = $state(getWeekStartDate(new Date(), $settings.weekStartDay) || formatDateToYYYYMMDD(new Date()));
	let showEditModal = $state(false);
	let editingDate = $state(new Date());

	let weekEndFormatted = $derived(() => {
		const endDate = getWeekEndDate(viewingWeekStart);
		return endDate ? formatDate(new Date(endDate + 'T00:00:00'), {
			includeWeekday: false,
			includeYear: false,
			shortForm: false
		}) : '';
	});

	let weeklyTotals = $derived(
		calculateWeeklyTotals($dailyCounts, viewingWeekStart, foodGroups)
	);

	let weekDates = $derived(() =>
		getWeekDates(new Date(viewingWeekStart + 'T00:00:00'), $settings.weekStartDay)
	);

	let editingDayCounts = $derived(() => {
		const dateStr = formatDateToYYYYMMDD(editingDate);
		return $dailyCounts[dateStr] || {};
	});

	function previousWeek() {
		const current = new Date(viewingWeekStart + 'T00:00:00');
		current.setDate(current.getDate() - 7);
		const newWeekStart = getWeekStartDate(current, $settings.weekStartDay);
		if (newWeekStart) {
			viewingWeekStart = newWeekStart;
		}
	}

	function nextWeek() {
		const current = new Date(viewingWeekStart + 'T00:00:00');
		current.setDate(current.getDate() + 7);
		const newWeekStart = getWeekStartDate(current, $settings.weekStartDay);
		if (newWeekStart) {
			viewingWeekStart = newWeekStart;
		}
	}

	function handleDateInput(event: Event) {
		const input = event.target as HTMLInputElement;
		const date = new Date(input.value + 'T00:00:00');
		const newWeekStart = getWeekStartDate(date, $settings.weekStartDay);
		if (newWeekStart) {
			viewingWeekStart = newWeekStart;
		}
	}

	function openEditModal() {
		editingDate = new Date(viewingWeekStart + 'T00:00:00');
		showEditModal = true;
	}

	function closeEditModal() {
		showEditModal = false;
	}

	function handleEditDaySelect(date: Date) {
		editingDate = date;
	}

	function incrementEditCount(foodGroupId: string) {
		const dateStr = formatDateToYYYYMMDD(editingDate);
		mindDietActions.incrementCount(dateStr, foodGroupId);
	}

	function decrementEditCount(foodGroupId: string) {
		const dateStr = formatDateToYYYYMMDD(editingDate);
		mindDietActions.decrementCount(dateStr, foodGroupId);
	}

	// Day selector for edit modal
	let editWeekDays = $derived(() => {
		const dates = getWeekDates(new Date(viewingWeekStart + 'T00:00:00'), $settings.weekStartDay);
		return dates.map(dateStr => {
			const date = new Date(dateStr);
			const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'narrow' });
			const isSelected = formatDateToYYYYMMDD(editingDate) === dateStr;
			return { date, dayOfWeek, isSelected };
		});
	});
</script>

<svelte:head>
	<title>History - MIND Diet</title>
</svelte:head>

<div class="history-view">
	<header class="header">
		<h2 class="title">Weekly History</h2>
		<div class="history-nav">
			<div class="date-controls">
				<button class="icon-btn" onclick={previousWeek} aria-label="Previous Week">
					<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
						<path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
					</svg>
				</button>
				<input
					type="date"
					class="date-picker"
					value={viewingWeekStart}
					onchange={handleDateInput}
					title="Go to week containing this date"
				/>
				<button class="icon-btn" onclick={nextWeek} aria-label="Next Week">
					<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
						<path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
					</svg>
				</button>
			</div>
			<button class="edit-btn" onclick={openEditModal} aria-label="Edit this week">
				<i class="mdi mdi-pencil-outline"></i>
				<span>Edit</span>
			</button>
		</div>
	</header>

	<div class="food-groups-list">
		{#each foodGroups as foodGroup}
			{@const count = weeklyTotals[foodGroup.id] || 0}
			{@const target = getWeeklyTarget(foodGroup)}
			{@const statusColor = getStatusColor(count, foodGroup, 7)}

			<div class="summary-row">
				<div class="status-bar" style="background-color: {statusColor}"></div>
				<div class="row-content">
					<div class="row-info">
						<h3 class="food-name">{foodGroup.name}</h3>
					</div>
					<div class="row-stats">
						<span class="count" style="color: {statusColor}">{count}/{target}</span>
					</div>
				</div>
			</div>
		{/each}
	</div>
</div>

<!-- Edit Modal -->
{#if showEditModal}
	<div class="modal-backdrop" onclick={closeEditModal} role="button" tabindex="-1">
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog">
			<div class="modal-header">
				<div>
					<h3 class="modal-title">Week of {viewingWeekStart}</h3>
					<p class="modal-date">{formatDate(editingDate)}</p>
				</div>
				<button class="modal-close" onclick={closeEditModal} aria-label="Close">×</button>
			</div>

			<div class="modal-day-selector">
				{#each editWeekDays() as day}
					<button
						class="day-btn"
						class:active={day.isSelected}
						onclick={() => handleEditDaySelect(day.date)}
					>
						{day.dayOfWeek}
					</button>
				{/each}
			</div>

			<div class="modal-body">
				{#each foodGroups as foodGroup}
					{@const count = editingDayCounts()[foodGroup.id] || 0}
					<div class="edit-item">
						<span class="edit-name">{foodGroup.name}</span>
						<div class="edit-controls">
							<button
								class="edit-btn-sm decrement"
								onclick={() => decrementEditCount(foodGroup.id)}
								disabled={count === 0}
							>
								−
							</button>
							<span class="edit-count">{count}</span>
							<button
								class="edit-btn-sm increment"
								onclick={() => incrementEditCount(foodGroup.id)}
							>
								+
							</button>
						</div>
					</div>
				{/each}
			</div>

			<div class="modal-footer">
				<button class="btn-secondary" onclick={closeEditModal}>Close</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.history-view {
		max-width: 100%;
	}

	.header {
		margin-bottom: var(--spacing-lg);
	}

	.title {
		font-size: var(--font-lg);
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 var(--spacing-md) 0;
		text-align: center;
	}

	.history-nav {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--spacing-md);
		flex-wrap: wrap;
	}

	.date-controls {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.icon-btn {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		border: 1px solid var(--color-border);
		background: var(--color-bg-secondary);
		color: var(--color-text);
		cursor: pointer;
		transition: all var(--transition-fast);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.icon-btn:hover {
		background: var(--color-primary);
		color: white;
		border-color: var(--color-primary);
	}

	.date-picker {
		padding: var(--spacing-sm) var(--spacing-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--font-sm);
		color: var(--color-text);
		background: var(--color-bg-secondary);
	}

	.edit-btn {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-sm) var(--spacing-md);
		border: 1px solid var(--color-border);
		background: var(--color-bg-secondary);
		color: var(--color-text);
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: all var(--transition-fast);
		font-weight: 500;
	}

	.edit-btn:hover {
		background: var(--color-primary);
		color: white;
		border-color: var(--color-primary);
	}

	.food-groups-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.summary-row {
		display: flex;
		background: var(--color-bg-secondary);
		border-radius: var(--radius-sm);
		overflow: hidden;
	}

	.status-bar {
		width: 8px;
		flex-shrink: 0;
	}

	.row-content {
		flex: 1;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--spacing-md);
	}

	.food-name {
		font-size: var(--font-md);
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.count {
		font-size: var(--font-lg);
		font-weight: 700;
	}

	/* Modal Styles */
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.55);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: var(--spacing-md);
	}

	.modal {
		background: var(--color-bg-secondary);
		border-radius: var(--radius-md);
		max-width: 600px;
		width: 100%;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		box-shadow: var(--shadow-lg);
	}

	.modal-header {
		background: var(--color-primary);
		color: white;
		padding: var(--spacing-md);
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		border-radius: var(--radius-md) var(--radius-md) 0 0;
	}

	.modal-title {
		font-size: var(--font-lg);
		font-weight: 600;
		margin: 0;
	}

	.modal-date {
		font-size: var(--font-sm);
		margin: var(--spacing-xs) 0 0 0;
		opacity: 0.9;
	}

	.modal-close {
		background: none;
		border: none;
		color: white;
		font-size: 2rem;
		line-height: 1;
		cursor: pointer;
		padding: 0;
		width: 32px;
		height: 32px;
	}

	.modal-day-selector {
		background: var(--color-bg-tertiary);
		padding: var(--spacing-sm);
		display: flex;
		justify-content: space-around;
		gap: var(--spacing-xs);
	}

	.day-btn {
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
	}

	.day-btn:hover {
		background: rgba(0, 0, 0, 0.1);
	}

	.day-btn.active {
		background: var(--color-primary);
		color: white;
	}

	.modal-body {
		flex: 1;
		overflow-y: auto;
		padding: var(--spacing-md);
	}

	.edit-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--spacing-sm) 0;
		border-bottom: 1px solid var(--color-border);
	}

	.edit-item:last-child {
		border-bottom: none;
	}

	.edit-name {
		font-size: var(--font-sm);
		font-weight: 500;
		color: var(--color-text);
	}

	.edit-controls {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
	}

	.edit-btn-sm {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: none;
		font-size: 1.2rem;
		font-weight: bold;
		cursor: pointer;
		transition: all var(--transition-fast);
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
	}

	.edit-btn-sm.decrement {
		background: var(--color-accent);
	}

	.edit-btn-sm.decrement:hover:not(:disabled) {
		background: var(--color-warning-dark);
	}

	.edit-btn-sm.increment {
		background: var(--color-primary);
	}

	.edit-btn-sm.increment:hover {
		background: var(--color-primary-dark);
	}

	.edit-btn-sm:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.edit-count {
		font-size: var(--font-md);
		font-weight: 600;
		min-width: 30px;
		text-align: center;
	}

	.modal-footer {
		padding: var(--spacing-md);
		border-top: 1px solid var(--color-border);
		display: flex;
		justify-content: flex-end;
	}

	.btn-secondary {
		padding: var(--spacing-sm) var(--spacing-lg);
		border: 1px solid var(--color-border);
		background: var(--color-bg);
		color: var(--color-text);
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-weight: 500;
		transition: all var(--transition-fast);
	}

	.btn-secondary:hover {
		background: var(--color-bg-tertiary);
	}

	@media (max-width: 480px) {
		.history-nav {
			flex-direction: column;
			align-items: stretch;
		}

		.date-controls {
			justify-content: center;
		}

		.edit-btn {
			justify-content: center;
		}
	}
</style>
