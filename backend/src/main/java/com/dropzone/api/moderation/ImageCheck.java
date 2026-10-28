package com.dropzone.api.moderation;

import com.dropzone.api.domain.FeedItem;
import com.dropzone.api.domain.Report;
import com.dropzone.api.domain.ReportRepository;
import com.dropzone.api.domain.ReportTarget;
import com.dropzone.api.domain.TransformationRepository;
import com.dropzone.api.moderation.SafeSearch.Verdict;
import com.dropzone.api.storage.ImageSanitizer;
import com.dropzone.api.storage.PhotoUrls;
import com.dropzone.api.storage.StorageService;
import java.time.Clock;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class ImageCheck {

	static final int MAX_BYTES = 4 * 1024 * 1024;
	static final int SHRINK_TO = 1600;
	public static final String REASON = "Image check";
	private static final Logger log = LoggerFactory.getLogger(ImageCheck.class);

	private final SafeSearch safeSearch;
	private final StorageService storage;
	private final PhotoUrls urls;
	private final TransformationRepository transformations;
	private final ReportRepository reports;
	private final AdminAlerts alerts;
	private final Clock clock;
	private final boolean enabled;

	public ImageCheck(SafeSearch safeSearch, StorageService storage, PhotoUrls urls, TransformationRepository transformations,
			ReportRepository reports, AdminAlerts alerts, Clock clock, @Value("${dropzone.moderation.image-check:true}") boolean enabled) {
		this.safeSearch = safeSearch;
		this.storage = storage;
		this.urls = urls;
		this.transformations = transformations;
		this.reports = reports;
		this.alerts = alerts;
		this.clock = clock;
		this.enabled = enabled;
	}

	public void screen(FeedItem item) {
		if (!enabled || !item.isPublic || item.hidden || item.reviewed) {
			return;
		}
		for (String objectName : objectNames(item)) {
			Verdict verdict;
			try {
				byte[] image = storage.read(objectName);
				verdict = safeSearch.check(image.length > MAX_BYTES ? ImageSanitizer.shrink(image, SHRINK_TO) : image);
			}
			catch (RuntimeException e) {
				log.warn("Image check failed for {}, publishing it unchecked: {}", objectName, e.getMessage());
				continue;
			}
			if (verdict.flagged()) {
				hide(item, verdict);
				return;
			}
		}
	}

	private Set<String> objectNames(FeedItem item) {
		List<String> photos = new ArrayList<>();
		photos.add(item.photoUrl);
		if (item.transformationId != null) {
			transformations.findById(item.transformationId).ifPresent(t -> {
				photos.add(t.beforeUrl);
				photos.add(t.afterUrl);
			});
		}
		Set<String> names = new LinkedHashSet<>();
		photos.stream().filter(Objects::nonNull).map(urls::objectName).filter(Objects::nonNull).forEach(names::add);
		return names;
	}

	private void hide(FeedItem item, Verdict verdict) {
		item.hidden = true;
		Report report = new Report();
		report.id = UUID.randomUUID();
		report.targetType = ReportTarget.POST;
		report.targetId = item.id;
		report.reason = REASON + ": adult " + verdict.adult() + ", racy " + verdict.racy();
		report.createdAt = clock.instant();
		reports.save(report);
		String preview = item.subtitle == null ? item.title : item.title + " · " + item.subtitle;
		alerts.send(null, ReportTarget.POST, item.id, item.id, null, "Hidden by the image check: " + preview);
	}
}
