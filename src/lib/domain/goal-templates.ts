// Goal templates every new agency starts with (services.md §2 provisionAgency;
// wording from the MVP, mvp/src/app-core.js TEMPLATES).
export const DEFAULT_GOAL_TEMPLATES: Record<string, readonly string[]> = {
	'Daily living': [
		'Set the table',
		'Make a simple meal',
		'Do a load of laundry',
		'Brush teeth on own',
		'Make the bed'
	],
	Community: [
		'Pay for an item at a store',
		'Ride the bus with support',
		'Order food at a restaurant'
	],
	Health: [
		'Name each medication before taking it',
		'Take a daily walk',
		'Drink water with each meal'
	],
	Social: ['Greet housemates by name', 'Call a family member weekly']
};
