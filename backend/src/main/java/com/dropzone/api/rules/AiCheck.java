package com.dropzone.api.rules;

import com.dropzone.api.domain.Metric;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public final class AiCheck {

	static final Set<String> MEAL = labels("Food", "Dish", "Cuisine", "Meal", "Vegetable", "Fruit", "Salad", "Recipe", "Breakfast", "Lunch",
			"Dinner", "Produce", "Baked goods", "Meat", "Fast food", "Ingredient", "Staple food", "Snack", "Seafood", "Sandwich", "Soup",
			"Pasta", "Rice", "Egg", "Bread", "Cheese", "Dessert", "Bento", "Pizza", "Sushi", "Noodle", "Poultry", "Fish", "Steak", "Leaf vegetable",
			"Superfood", "Brunch", "Cooking", "Comfort food");
	static final Set<String> GYM = labels("Gym", "Exercise", "Muscle", "Physical fitness", "Weight training", "Sports equipment",
			"Exercise equipment", "Exercise machine", "Strength training", "Bodybuilding", "Barbell", "Dumbbell", "Kettlebell", "Weights",
			"Fitness", "Treadmill", "Powerlifting", "Weightlifting");
	static final Set<String> BIKE = labels("Bicycle", "Cycling", "Bicycle wheel", "Bicycle helmet", "Mountain bike", "Road bicycle",
			"Bicycle frame", "Cyclist");
	static final Set<String> HIKE = labels("Hiking", "Mountain", "Trail", "Forest", "Hill", "Wilderness", "Outdoor recreation", "Walking",
			"Nature", "Mountainous landforms", "Backpacking", "Trekking", "Path", "Park");
	static final Set<String> SWIM = labels("Swimming", "Swimming pool", "Swimwear", "Water sport", "Swimmer", "Pool", "Lake", "Beach",
			"Sea", "Leisure centre");
	static final Set<String> SPORTS = labels("Sports", "Ball", "Team sport", "Football", "Soccer", "Basketball", "Tennis", "Volleyball",
			"Player", "Sports equipment", "Stadium", "Athlete", "Running", "Ball game", "Racket", "Field");
	static final Set<String> MOBILITY = labels("Yoga", "Stretching", "Pilates", "Yoga mat", "Exercise", "Physical fitness", "Mat",
			"Flexibility");
	static final Set<String> MOVIE = labels("Television", "Screen", "Movie", "Display device", "Cinema", "Popcorn", "Entertainment",
			"Television set", "Projector", "Film");
	static final Set<String> HANGOUT = labels("Friendship", "Fun", "Smile", "Party", "Event", "Team", "Crowd", "Selfie", "People",
			"Social group", "Gathering", "Leisure");
	static final Set<String> SCALE = labels("Weighing scale", "Scale", "Bathroom scale", "Measuring scales", "Measuring instrument", "Gauge");
	static final Set<String> TAPE = labels("Tape measure", "Measuring tape", "Measuring instrument", "Ruler", "Tape", "Abdomen", "Waist",
			"Thigh", "Arm", "Chest", "Muscle", "Belly");

	static final Map<String, Set<String>> QUESTS = Map.ofEntries(Map.entry("HEALTHY_MEAL", MEAL), Map.entry("PROTEIN_MEAL", MEAL),
			Map.entry("EXTRA_MEAL", MEAL), Map.entry("GYM", GYM), Map.entry("BIKE", BIKE), Map.entry("HIKE", HIKE), Map.entry("SWIM", SWIM),
			Map.entry("SPORTS", SPORTS), Map.entry("MOBILITY", MOBILITY), Map.entry("MOVIE_NIGHT", MOVIE), Map.entry("HANGOUT", HANGOUT),
			Map.entry("WEIGH_IN", SCALE));

	static final Map<Metric, Set<String>> MILESTONES = Map.of(Metric.WEIGHT, SCALE, Metric.STRENGTH, GYM, Metric.SIZE, TAPE);

	static final double MIN_SCALE_READING = 20;
	static final double MAX_SCALE_READING = 800;
	private static final String WEIGH_IN = "WEIGH_IN";
	private static final Pattern NUMBER = Pattern.compile("(?<![\\d.,])(\\d{2,3}(?:[.,]\\d{1,2})?)(?![\\d.,]*\\d)");

	private AiCheck() {
	}

	public static boolean quest(String code, List<String> labels, String text) {
		if (code == null) {
			return false;
		}
		if (WEIGH_IN.equals(code) && readsAWeight(text)) {
			return true;
		}
		return matches(QUESTS.get(code), labels);
	}

	public static boolean milestone(Metric metric, List<String> labels, String text) {
		if (metric == Metric.WEIGHT && readsAWeight(text)) {
			return true;
		}
		return matches(MILESTONES.get(metric), labels);
	}

	static boolean readsAWeight(String text) {
		if (text == null || text.isBlank()) {
			return false;
		}
		Matcher matcher = NUMBER.matcher(text);
		while (matcher.find()) {
			double value = Double.parseDouble(matcher.group(1).replace(',', '.'));
			if (value >= MIN_SCALE_READING && value <= MAX_SCALE_READING) {
				return true;
			}
		}
		return false;
	}

	private static boolean matches(Set<String> expected, List<String> labels) {
		if (expected == null || labels == null) {
			return false;
		}
		return labels.stream().filter(l -> l != null).map(AiCheck::normalize).anyMatch(expected::contains);
	}

	private static String normalize(String label) {
		return label.trim().toLowerCase(Locale.ROOT);
	}

	private static Set<String> labels(String... labels) {
		return Stream.of(labels).map(AiCheck::normalize).collect(Collectors.toUnmodifiableSet());
	}
}
