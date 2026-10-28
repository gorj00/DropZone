package com.dropzone.api.common;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;

public final class Tally {

	private final Map<String, Integer> counts = new LinkedHashMap<>();

	public Tally add(String key, int amount) {
		counts.merge(key, amount, Integer::sum);
		return this;
	}

	public Tally add(Tally other) {
		other.counts.forEach(this::add);
		return this;
	}

	public int get(String key) {
		return counts.getOrDefault(key, 0);
	}

	public Map<String, Integer> counts() {
		return Collections.unmodifiableMap(counts);
	}

	public String line() {
		return counts.entrySet().stream().map(e -> e.getKey() + "=" + e.getValue()).collect(Collectors.joining(" "));
	}
}
