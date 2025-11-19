import type { FoodGroup } from '$lib/types';

/**
 * MIND Diet Food Groups
 *
 * Based on the Mediterranean-DASH Intervention for Neurodegenerative Delay (MIND) diet
 * which emphasizes foods that support brain health.
 */
export const foodGroups: FoodGroup[] = [
	// Daily Positive
	{
		id: 'whole_grains',
		name: 'Whole Grains',
		frequency: 'day',
		target: 3,
		unit: 'servings',
		type: 'positive',
		description:
			'Serving examples: 1 slice whole-grain bread, ½ cup cooked whole grains (oats, quinoa, brown rice), ½ cup whole-grain cereal, 3 cups popped popcorn.'
	},
	{
		id: 'other_veg',
		name: 'Other Vegetables',
		frequency: 'day',
		target: 1,
		unit: 'serving',
		type: 'positive',
		description:
			'Serving examples: ½ cup cooked or 1 cup raw non-starchy vegetables (broccoli, peppers, carrots, tomatoes, zucchini, onions, etc.). Excludes potatoes.'
	},
	{
		id: 'olive_oil',
		name: 'Olive Oil',
		frequency: 'day',
		target: 1,
		unit: 'Tbsp (main oil)',
		type: 'positive',
		description:
			'Use extra virgin olive oil (EVOO) as your principal oil for cooking, dressings, etc. Aim for at least 1 Tbsp use daily.'
	},

	// Weekly Positive
	{
		id: 'leafy_greens',
		name: 'Green Leafy Vegetables',
		frequency: 'week',
		target: 6,
		unit: 'servings',
		type: 'positive',
		description:
			'Serving examples: 1 cup raw or ½ cup cooked leafy greens (spinach, kale, collards, romaine, arugula, etc.).'
	},
	{
		id: 'nuts',
		name: 'Nuts',
		frequency: 'week',
		target: 5,
		unit: 'servings',
		type: 'positive',
		description:
			'Serving examples: ¼ cup nuts or 2 Tbsp nut butter (almonds, walnuts, pecans preferred; avoid heavily salted/sugared nuts).'
	},
	{
		id: 'beans',
		name: 'Beans',
		frequency: 'week',
		target: 4,
		unit: 'servings',
		type: 'positive',
		description:
			'Serving examples: ½ cup cooked beans, lentils, or legumes (kidney, black, pinto beans, chickpeas, soybeans, etc.).'
	},
	{
		id: 'berries',
		name: 'Berries',
		frequency: 'week',
		target: 2,
		unit: 'servings',
		type: 'positive',
		description:
			'Serving examples: ½ cup fresh or frozen berries (blueberries strongly recommended, strawberries, raspberries, blackberries).'
	},
	{
		id: 'poultry',
		name: 'Poultry',
		frequency: 'week',
		target: 2,
		unit: 'servings',
		type: 'positive',
		description:
			'Serving examples: 3-4 oz cooked chicken or turkey (prefer skinless, not fried).'
	},
	{
		id: 'fish',
		name: 'Fish',
		frequency: 'week',
		target: 1,
		unit: 'serving',
		type: 'positive',
		description:
			'Serving examples: 3-4 oz cooked fish (prefer oily fish like salmon, mackerel, sardines; avoid fried fish).'
	},
	{
		id: 'wine',
		name: 'Wine',
		frequency: 'day',
		target: 1,
		unit: 'glass (max)',
		type: 'limit',
		isOptional: true,
		description:
			'Optional: Limit to no more than one standard glass (approx. 5 oz) per day. Preferrably red wine.'
	},

	// Weekly Limit
	{
		id: 'red_meat',
		name: 'Red Meats',
		frequency: 'week',
		target: 3,
		unit: 'servings (max)',
		type: 'limit',
		description:
			'Limit to less than 4 servings/week (target ≤3). Serving ~3-4 oz cooked. Includes beef, pork, lamb, and processed meats.'
	},
	{
		id: 'butter_margarine',
		name: 'Butter/Margarine',
		frequency: 'day',
		target: 1,
		unit: 'Tbsp (max)',
		type: 'limit',
		description:
			'Limit butter to less than 1 Tbsp per day. Avoid stick margarine entirely.'
	},
	{
		id: 'cheese',
		name: 'Cheese',
		frequency: 'week',
		target: 1,
		unit: 'serving (max)',
		type: 'limit',
		description:
			'Limit full-fat cheese to less than 1 serving/week (target ≤1). Serving ~1-1.5 oz.'
	},
	{
		id: 'pastries_sweets',
		name: 'Pastries & Sweets',
		frequency: 'week',
		target: 4,
		unit: 'servings (max)',
		type: 'limit',
		description:
			'Limit pastries and sweets to less than 5 servings/week (target ≤4). Includes cakes, cookies, candies, ice cream, sugary drinks etc.'
	},
	{
		id: 'fried_fast_food',
		name: 'Fried/Fast Food',
		frequency: 'week',
		target: 1,
		unit: 'serving (max)',
		type: 'limit',
		description:
			'Limit fried food (especially commercial) and fast food to less than 1 serving/week (target ≤1).'
	}
];

/**
 * Helper functions for food groups
 */
export const getFoodGroupById = (id: string): FoodGroup | undefined => {
	return foodGroups.find((fg) => fg.id === id);
};

export const getDailyFoodGroups = (): FoodGroup[] => {
	return foodGroups.filter((fg) => fg.frequency === 'day');
};

export const getWeeklyFoodGroups = (): FoodGroup[] => {
	return foodGroups.filter((fg) => fg.frequency === 'week');
};

export const getPositiveFoodGroups = (): FoodGroup[] => {
	return foodGroups.filter((fg) => fg.type === 'positive');
};

export const getLimitFoodGroups = (): FoodGroup[] => {
	return foodGroups.filter((fg) => fg.type === 'limit');
};
