package com.dropzone.api.storage;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class PhotoSigner {

	public static final Duration LIFETIME = Duration.ofHours(12);
	static final Duration SIGNED_FOR = LIFETIME.plusHours(1);
	static final int MAX_CACHED = 20_000;
	static final Duration WARN_EVERY = Duration.ofMinutes(5);
	static final Duration PAUSE_AFTER_FAILURE = Duration.ofMinutes(1);
	private static final Logger log = LoggerFactory.getLogger(PhotoSigner.class);

	private final StorageService storage;
	private final PhotoUrls urls;
	private final Clock clock;
	private final Map<String, Signed> cache = new ConcurrentHashMap<>();
	private final AtomicReference<Instant> lastWarning = new AtomicReference<>();
	private final AtomicInteger failures = new AtomicInteger();
	private volatile Instant pausedUntil = Instant.MIN;

	public PhotoSigner(StorageService storage, PhotoUrls urls, Clock clock) {
		this.storage = storage;
		this.urls = urls;
		this.clock = clock;
	}

	public String sign(String url) {
		String objectName = urls.objectName(url);
		if (objectName == null) {
			return url;
		}
		Instant now = clock.instant();
		Instant hour = now.truncatedTo(ChronoUnit.HOURS);
		Signed cached = cache.get(objectName);
		if (cached != null && cached.hour().equals(hour)) {
			return cached.url();
		}
		if (now.isBefore(pausedUntil)) {
			return storage.publicUrl(objectName);
		}
		String signed;
		try {
			signed = storage.signedUrl(objectName, hour, SIGNED_FOR);
		}
		catch (RuntimeException e) {
			failed(now, e);
			return storage.publicUrl(objectName);
		}
		if (signed == null) {
			return url;
		}
		if (cache.size() >= MAX_CACHED) {
			cache.values().removeIf(s -> !s.hour().equals(hour));
			if (cache.size() >= MAX_CACHED) {
				cache.clear();
			}
		}
		cache.put(objectName, new Signed(hour, signed));
		return signed;
	}

	private void failed(Instant now, RuntimeException e) {
		pausedUntil = now.plus(PAUSE_AFTER_FAILURE);
		int count = failures.incrementAndGet();
		Instant last = lastWarning.get();
		if ((last == null || !now.isBefore(last.plus(WARN_EVERY))) && lastWarning.compareAndSet(last, now)) {
			failures.addAndGet(-count);
			log.warn("Photo signing failed {} time(s), serving plain links: {}", count, e.getMessage());
		}
	}

	private record Signed(Instant hour, String url) {
	}
}
