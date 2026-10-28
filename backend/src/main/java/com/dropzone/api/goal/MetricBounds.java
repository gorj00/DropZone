package com.dropzone.api.goal;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.domain.LengthUnit;
import com.dropzone.api.domain.Metric;
import com.dropzone.api.domain.WeightUnit;
import java.util.Locale;

public final class MetricBounds {

	static final double KG_PER_LB = 0.45359237;
	static final double CM_PER_IN = 2.54;
	static final double HALF_DISPLAY_STEP = 0.05;

	private MetricBounds() {
	}

	public static String unit(Metric metric) {
		return metric == Metric.SIZE ? "cm" : "kg";
	}

	public static double min(Metric metric) {
		return switch (metric) {
			case WEIGHT -> 20;
			case STRENGTH -> 1;
			case SIZE -> 5;
		};
	}

	public static double max(Metric metric) {
		return switch (metric) {
			case WEIGHT -> 350;
			case STRENGTH -> 500;
			case SIZE -> 250;
		};
	}

	public static double minGap(Metric metric) {
		return metric == Metric.SIZE ? 0.5 : 0.2;
	}

	public static double tolerance(Metric metric, WeightUnit weightUnit, LengthUnit lengthUnit) {
		if (metric == Metric.SIZE) {
			return HALF_DISPLAY_STEP * (lengthUnit == LengthUnit.IN ? CM_PER_IN : 1);
		}
		return HALF_DISPLAY_STEP * (weightUnit == WeightUnit.LB ? KG_PER_LB : 1);
	}

	public static String format(Metric metric, double value) {
		return fmt(Math.round(value * 10.0) / 10.0) + " " + unit(metric);
	}

	public static void requireUnit(Metric metric, String unit) {
		if (unit == null || !unit.trim().equals(unit(metric))) {
			throw ApiException.validation(metric + " goals use " + unit(metric));
		}
	}

	public static void check(Metric metric, Double value, String field) {
		if (value == null) {
			return;
		}
		if (value < min(metric) || value > max(metric)) {
			throw ApiException.validation(String.format(Locale.ROOT, "%s must be between %s and %s %s", field, fmt(min(metric)),
					fmt(max(metric)), unit(metric)));
		}
	}

	private static String fmt(double value) {
		return value == Math.rint(value) ? String.valueOf((long) value) : String.valueOf(value);
	}
}
