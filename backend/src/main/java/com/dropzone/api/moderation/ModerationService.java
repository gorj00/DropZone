package com.dropzone.api.moderation;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.common.Dtos.AdminCommentDto;
import com.dropzone.api.common.Dtos.AdminPostDto;
import com.dropzone.api.common.Dtos.AdminReportDto;
import com.dropzone.api.common.Dtos.AdminUserDto;
import com.dropzone.api.common.Dtos.ReportEntryDto;
import com.dropzone.api.common.Dtos.ReportedItemDto;
import com.dropzone.api.common.Dtos.TransformationView;
import com.dropzone.api.common.Dtos.UserSummary;
import com.dropzone.api.common.Requests;
import com.dropzone.api.domain.Comment;
import com.dropzone.api.domain.CommentRepository;
import com.dropzone.api.domain.FeedItem;
import com.dropzone.api.domain.FeedItemRepository;
import com.dropzone.api.domain.PostVisibility;
import com.dropzone.api.domain.Proof;
import com.dropzone.api.domain.ProofRepository;
import com.dropzone.api.domain.Report;
import com.dropzone.api.domain.ReportRepository;
import com.dropzone.api.domain.ReportTarget;
import com.dropzone.api.domain.Transformation;
import com.dropzone.api.domain.TransformationRepository;
import com.dropzone.api.domain.User;
import com.dropzone.api.domain.UserRepository;
import com.dropzone.api.feed.FeedAccess;
import com.dropzone.api.feed.FeedAccess.Viewer;
import com.dropzone.api.feed.FeedService;
import com.dropzone.api.push.PushService;
import com.dropzone.api.push.PushType;
import com.dropzone.api.storage.UploadCleanup;
import com.dropzone.api.user.UserService;
import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ModerationService {

	public static final int AUTO_HIDE_REPORTS = 3;
	public static final int AUTO_SUSPEND_STRIKES = 4;
	static final Set<String> NUDITY_REASONS = Set.of("nudity", "nudity or sexual content");
	static final String RESET_NAME = "DropZone user";
	private static final int MAX_PREVIEW = 120;

	private final ReportRepository reports;
	private final FeedItemRepository feed;
	private final CommentRepository comments;
	private final TransformationRepository transformations;
	private final ProofRepository proofs;
	private final UserRepository userRepository;
	private final UserService users;
	private final FeedAccess access;
	private final FeedService feedService;
	private final AdminAlerts alerts;
	private final PushService push;
	private final UploadCleanup uploads;
	private final Clock clock;
	private final Duration minReporterAge;

	public ModerationService(ReportRepository reports, FeedItemRepository feed, CommentRepository comments,
			TransformationRepository transformations, ProofRepository proofs, UserRepository userRepository, UserService users,
			FeedAccess access, FeedService feedService, AdminAlerts alerts, PushService push, UploadCleanup uploads,
			Clock clock, @Value("${dropzone.moderation.min-reporter-age:3d}") Duration minReporterAge) {
		this.reports = reports;
		this.feed = feed;
		this.comments = comments;
		this.transformations = transformations;
		this.proofs = proofs;
		this.userRepository = userRepository;
		this.users = users;
		this.access = access;
		this.feedService = feedService;
		this.alerts = alerts;
		this.push = push;
		this.uploads = uploads;
		this.clock = clock;
		this.minReporterAge = minReporterAge;
	}

	@Transactional
	public void report(UUID userId, Requests.CreateReport req) {
		User me = users.get(userId);
		if (reports.existsByReporterIdAndTargetTypeAndTargetId(userId, req.targetType(), req.targetId())) {
			return;
		}
		switch (req.targetType()) {
			case POST -> {
				FeedItem item = feed.findById(req.targetId()).orElseThrow(() -> ApiException.notFound("Post not found"));
				if (item.userId.equals(userId)) {
					throw ApiException.validation("You can't report your own post");
				}
				if (!access.canSee(access.viewer(me), item)) {
					throw ApiException.notFound("Post not found");
				}
				if (save(userId, req)) {
					if (!item.reviewed && !item.hidden && nudity(req.reason()) && hasPhoto(item) && countsForAutoHide(me)) {
						item.hidden = true;
						alert(me, ReportTarget.POST, item.id, item.id, null, "Hidden after a nudity report: " + preview(item));
					}
					else {
						alertOnFirst(me, ReportTarget.POST, item.id, item.id, null, preview(item));
						if (!item.reviewed && !item.hidden && counted(ReportTarget.POST, item.id) >= AUTO_HIDE_REPORTS) {
							item.hidden = true;
							alert(me, ReportTarget.POST, item.id, item.id, null,
									"Auto-hidden after " + AUTO_HIDE_REPORTS + " reports: " + preview(item));
						}
					}
				}
			}
			case COMMENT -> {
				Comment comment = comments.findById(req.targetId()).orElseThrow(() -> ApiException.notFound("Comment not found"));
				if (comment.userId.equals(userId)) {
					throw ApiException.validation("You can't report your own comment");
				}
				if (!canSee(me, comment)) {
					throw ApiException.notFound("Comment not found");
				}
				if (save(userId, req)) {
					alertOnFirst(me, ReportTarget.COMMENT, comment.id, comment.feedItemId, comment.id, shorten(comment.body));
					if (!comment.reviewed && !comment.hidden && counted(ReportTarget.COMMENT, comment.id) >= AUTO_HIDE_REPORTS) {
						comment.hidden = true;
						alert(me, ReportTarget.COMMENT, comment.id, comment.feedItemId, comment.id,
								"Auto-hidden after " + AUTO_HIDE_REPORTS + " reports: " + shorten(comment.body));
					}
				}
			}
			case USER -> {
				User target = userRepository.findById(req.targetId()).orElseThrow(() -> ApiException.notFound("User not found"));
				if (target.id.equals(userId)) {
					throw ApiException.validation("You can't report yourself");
				}
				if (save(userId, req)) {
					alertOnFirst(me, ReportTarget.USER, target.id, null, null, preview(target));
				}
			}
		}
	}

	private boolean canSee(User me, Comment comment) {
		Viewer viewer = access.viewer(me);
		if ((comment.hidden && !comment.userId.equals(me.id)) || viewer.hiddenUsers().contains(comment.userId)) {
			return false;
		}
		return feed.findById(comment.feedItemId).filter(item -> access.canSee(viewer, item)).isPresent();
	}

	private long counted(ReportTarget type, UUID targetId) {
		return reports.countFromAccountsJoinedBefore(type, targetId, clock.instant().minus(minReporterAge));
	}

	private boolean countsForAutoHide(User reporter) {
		return !reporter.createdAt.isAfter(clock.instant().minus(minReporterAge));
	}

	static boolean nudity(String reason) {
		return reason != null && NUDITY_REASONS.contains(reason.trim().toLowerCase());
	}

	private static boolean hasPhoto(FeedItem item) {
		return item.photoUrl != null || item.transformationId != null;
	}

	private boolean save(UUID userId, Requests.CreateReport req) {
		if (reports.existsByReporterIdAndTargetTypeAndTargetId(userId, req.targetType(), req.targetId())) {
			return false;
		}
		Report report = new Report();
		report.id = UUID.randomUUID();
		report.reporterId = userId;
		report.targetType = req.targetType();
		report.targetId = req.targetId();
		report.reason = req.reason() == null || req.reason().isBlank() ? null : req.reason().trim();
		report.createdAt = clock.instant();
		reports.saveAndFlush(report);
		return true;
	}

	private void alertOnFirst(User reporter, ReportTarget type, UUID targetId, UUID feedItemId, UUID commentId, String preview) {
		if (reports.countByTargetTypeAndTargetId(type, targetId) == 1) {
			alert(reporter, type, targetId, feedItemId, commentId, "New report: " + preview);
		}
	}

	private void alert(User reporter, ReportTarget type, UUID targetId, UUID feedItemId, UUID commentId, String text) {
		alerts.send(reporter.id, type, targetId, feedItemId, commentId, text);
	}

	@Transactional(readOnly = true)
	public List<ReportedItemDto> list(UUID userId) {
		users.requireAdmin(users.get(userId));
		Map<String, List<Report>> grouped = new LinkedHashMap<>();
		for (Report report : reports.findAllByOrderByCreatedAtDesc()) {
			grouped.computeIfAbsent(report.targetType + ":" + report.targetId, k -> new ArrayList<>()).add(report);
		}
		List<ReportedItemDto> result = new ArrayList<>();
		for (List<Report> group : grouped.values()) {
			Report first = group.getFirst();
			List<String> reasons = group.stream().map(r -> r.reason).filter(r -> r != null && !r.isBlank()).toList();
			switch (first.targetType) {
				case POST -> feed.findById(first.targetId).ifPresent(item -> result.add(new ReportedItemDto(ReportTarget.POST, item.id,
						group.size(), item.hidden, reasons, first.createdAt, author(item.userId), preview(item), item.photoUrl, item.id)));
				case COMMENT -> comments.findById(first.targetId).ifPresent(c -> result.add(new ReportedItemDto(ReportTarget.COMMENT, c.id,
						group.size(), c.hidden, reasons, first.createdAt, author(c.userId), c.body, null, c.feedItemId)));
				case USER -> userRepository.findById(first.targetId).ifPresent(u -> result.add(new ReportedItemDto(ReportTarget.USER, u.id,
						group.size(), u.isSuspended(), reasons, first.createdAt, UserService.summary(u), preview(u), u.avatarUrl, null)));
			}
		}
		return result;
	}

	@Transactional(readOnly = true)
	public AdminReportDto detail(UUID userId, ReportTarget type, UUID targetId) {
		users.requireAdmin(users.get(userId));
		List<Report> list = reports.findByTargetTypeAndTargetIdOrderByCreatedAtDesc(type, targetId);
		List<ReportEntryDto> entries = entries(list);
		return switch (type) {
			case POST -> {
				FeedItem item = feed.findById(targetId).orElseThrow(() -> ApiException.notFound("Post not found"));
				yield new AdminReportDto(type, targetId, list.size(), item.hidden, entries, post(item), null, null);
			}
			case COMMENT -> {
				Comment comment = comments.findById(targetId).orElseThrow(() -> ApiException.notFound("Comment not found"));
				AdminPostDto post = feed.findById(comment.feedItemId).map(this::post).orElse(null);
				AdminCommentDto view = new AdminCommentDto(comment.id, author(comment.userId), comment.body, comment.createdAt, comment.hidden);
				yield new AdminReportDto(type, targetId, list.size(), comment.hidden, entries, post, view, null);
			}
			case USER -> {
				User user = userRepository.findById(targetId).orElseThrow(() -> ApiException.notFound("User not found"));
				yield new AdminReportDto(type, targetId, list.size(), user.isSuspended(), entries, null, null, adminUser(user));
			}
		};
	}

	@Transactional
	public void restore(UUID userId, ReportTarget type, UUID targetId) {
		users.requireAdmin(users.get(userId));
		if (type == ReportTarget.POST) {
			FeedItem item = feed.findById(targetId).orElseThrow(() -> ApiException.notFound("Post not found"));
			item.hidden = false;
			item.reviewed = true;
		}
		else if (type == ReportTarget.COMMENT) {
			Comment comment = comments.findById(targetId).orElseThrow(() -> ApiException.notFound("Comment not found"));
			comment.hidden = false;
			comment.reviewed = true;
		}
		reports.deleteByTargetTypeAndTargetId(type, targetId);
	}

	@Transactional
	public void remove(UUID userId, ReportTarget type, UUID targetId) {
		users.requireAdmin(users.get(userId));
		switch (type) {
			case POST -> {
				FeedItem item = feed.findById(targetId).orElseThrow(() -> ApiException.notFound("Post not found"));
				List<String> photos = new ArrayList<>();
				photos.add(item.photoUrl);
				if (item.transformationId != null) {
					transformations.findById(item.transformationId).ifPresent(t -> {
						t.visibility = PostVisibility.PRIVATE;
						t.removedByModerator = true;
						photos.add(t.beforeUrl);
						photos.add(t.afterUrl);
					});
				}
				if (item.proofId != null) {
					proofs.findForUpdate(item.proofId).ifPresent(proof -> {
						photos.add(proof.photoUrl);
						proof.removedByModerator = true;
						feedService.reject(proof, true);
						proof.isPublic = false;
					});
				}
				reports.deleteCommentReportsOfPost(item.id);
				feed.delete(item);
				uploads.purge(photos.stream().filter(Objects::nonNull).toList());
				strike(item.userId);
			}
			case COMMENT -> {
				Comment comment = comments.findById(targetId).orElseThrow(() -> ApiException.notFound("Comment not found"));
				reports.deleteReplyReportsOf(comment.id);
				comments.delete(comment);
				strike(comment.userId);
			}
			case USER -> {
				reset(userRepository.findById(targetId).orElseThrow(() -> ApiException.notFound("User not found")));
				strike(targetId);
			}
		}
		reports.deleteByTargetTypeAndTargetId(type, targetId);
	}

	private void strike(UUID userId) {
		userRepository.addStrike(userId);
		if (userRepository.suspendAtStrikes(userId, AUTO_SUSPEND_STRIKES, clock.instant()) > 0) {
			userRepository.findById(userId).ifPresent(user -> push.notify(user, PushType.ACCOUNT_SUSPENDED,
					"Your DropZone account is suspended", "Moderators removed your posts or comments several times for breaking the rules.",
					Map.of()));
		}
	}

	@Transactional(readOnly = true)
	public AdminUserDto user(UUID userId, UUID targetId) {
		users.requireAdmin(users.get(userId));
		return adminUser(userRepository.findById(targetId).orElseThrow(() -> ApiException.notFound("User not found")));
	}

	@Transactional
	public AdminUserDto resetProfile(UUID userId, UUID targetId) {
		users.requireAdmin(users.get(userId));
		User target = userRepository.findById(targetId).orElseThrow(() -> ApiException.notFound("User not found"));
		reset(target);
		return adminUser(target);
	}

	@Transactional
	public AdminUserDto suspend(UUID userId, UUID targetId, boolean suspended) {
		users.requireAdmin(users.get(userId));
		User target = userRepository.findById(targetId).orElseThrow(() -> ApiException.notFound("User not found"));
		if (target.id.equals(userId)) {
			throw ApiException.validation("You can't suspend yourself");
		}
		if (suspended && target.suspendedAt == null) {
			target.suspendedAt = clock.instant();
		}
		if (!suspended) {
			target.suspendedAt = null;
		}
		return adminUser(target);
	}

	private void reset(User target) {
		String avatar = target.avatarUrl;
		target.displayName = RESET_NAME;
		target.handle = users.generatedHandle();
		target.bio = null;
		target.avatarUrl = null;
		if (avatar != null) {
			uploads.purge(List.of(avatar));
		}
	}

	@Transactional(readOnly = true)
	public List<ReportEntryDto> reportsAbout(UUID userId) {
		return entries(reports.findAboutUser(userId));
	}

	private AdminUserDto adminUser(User user) {
		return new AdminUserDto(UserService.summary(user), user.email, user.createdAt, user.isSuspended(), user.suspendedAt,
				user.moderationStrikes, entries(reports.findAboutUser(user.id)));
	}

	private List<ReportEntryDto> entries(List<Report> list) {
		Map<UUID, User> reporters = userRepository.findByIdIn(list.stream().map(r -> r.reporterId).filter(Objects::nonNull).collect(Collectors.toSet())).stream()
				.collect(Collectors.toMap(u -> u.id, Function.identity()));
		return list.stream().map(r -> new ReportEntryDto(r.targetType, r.targetId,
				reporters.containsKey(r.reporterId) ? UserService.summary(reporters.get(r.reporterId)) : null, r.reason, r.createdAt)).toList();
	}

	private AdminPostDto post(FeedItem item) {
		Transformation t = item.transformationId == null ? null : transformations.findById(item.transformationId).orElse(null);
		Proof proof = item.proofId == null ? null : proofs.findById(item.proofId).orElse(null);
		List<String> photos = Stream.of(item.photoUrl, t == null ? null : t.beforeUrl, t == null ? null : t.afterUrl,
				proof == null ? null : proof.photoUrl).filter(Objects::nonNull).distinct().toList();
		TransformationView view = t == null ? null
				: new TransformationView(t.layout, t.beforeUrl, t.afterUrl, t.beforeCaption, t.afterCaption);
		return new AdminPostDto(item.id, item.type, author(item.userId), item.createdAt, item.title, item.subtitle, item.photoUrl, photos, view,
				item.hidden, item.isPublic, item.proofId, proof == null ? null : proof.status,
				proof == null ? List.of() : List.copyOf(proof.mlLabels), proof == null ? null : proof.mlText);
	}

	private UserSummary author(UUID id) {
		return userRepository.findById(id).map(UserService::summary).orElse(null);
	}

	private static String preview(FeedItem item) {
		return item.subtitle == null ? item.title : item.title + " · " + item.subtitle;
	}

	private static String preview(User user) {
		String text = user.displayName + " (@" + user.handle + ")";
		return user.bio == null ? text : text + " · " + user.bio;
	}

	private static String shorten(String text) {
		return text.length() <= MAX_PREVIEW ? text : text.substring(0, MAX_PREVIEW - 1) + "…";
	}
}
