package com.dropzone.api.logs;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.common.Dtos.DailyLogDetailDto;
import com.dropzone.api.common.Dtos.DailyLogDto;
import com.dropzone.api.common.Dtos.DayLogsDto;
import com.dropzone.api.common.Dtos.UserSummary;
import com.dropzone.api.domain.DailyResult;
import com.dropzone.api.domain.DailyResultRepository;
import com.dropzone.api.domain.FeedItem;
import com.dropzone.api.domain.FeedItemRepository;
import com.dropzone.api.domain.Proof;
import com.dropzone.api.domain.ProofRepository;
import com.dropzone.api.domain.ProofVerificationRepository;
import com.dropzone.api.domain.QuestCompletion;
import com.dropzone.api.domain.QuestCompletionRepository;
import com.dropzone.api.domain.QuestStatus;
import com.dropzone.api.domain.User;
import com.dropzone.api.domain.UserQuest;
import com.dropzone.api.domain.UserQuestRepository;
import com.dropzone.api.domain.UserRepository;
import com.dropzone.api.quest.QuestService;
import com.dropzone.api.user.UserService;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LogService {

	private final UserService users;
	private final QuestCompletionRepository completions;
	private final UserQuestRepository quests;
	private final ProofRepository proofs;
	private final ProofVerificationRepository verifications;
	private final FeedItemRepository feed;
	private final DailyResultRepository dailyResults;
	private final UserRepository userRepository;

	public LogService(UserService users, QuestCompletionRepository completions, UserQuestRepository quests, ProofRepository proofs,
			ProofVerificationRepository verifications, FeedItemRepository feed, DailyResultRepository dailyResults,
			UserRepository userRepository) {
		this.users = users;
		this.completions = completions;
		this.quests = quests;
		this.proofs = proofs;
		this.verifications = verifications;
		this.feed = feed;
		this.dailyResults = dailyResults;
		this.userRepository = userRepository;
	}

	@Transactional(readOnly = true)
	public DayLogsDto day(UUID userId, LocalDate date) {
		User user = users.get(userId);
		LocalDate day = date == null ? users.today(user) : date;
		List<QuestCompletion> list = completions.findByUserIdAndDay(userId, day).stream()
				.sorted(Comparator.comparing((QuestCompletion c) -> c.createdAt))
				.toList();
		Map<UUID, UserQuest> questById = quests.findAllById(list.stream().map(c -> c.userQuestId).collect(Collectors.toSet())).stream()
				.collect(Collectors.toMap(q -> q.id, Function.identity()));
		List<UUID> proofIds = list.stream().map(c -> c.proofId).filter(Objects::nonNull).toList();
		Map<UUID, Proof> proofById = proofs.findAllById(proofIds).stream().collect(Collectors.toMap(p -> p.id, Function.identity()));
		Map<UUID, UUID> feedByProof = proofIds.isEmpty() ? Map.of()
				: feed.findByProofIdIn(proofIds).stream()
						.sorted(Comparator.comparing((FeedItem f) -> f.createdAt))
						.collect(Collectors.toMap(f -> f.proofId, f -> f.id, (a, b) -> a));
		List<DailyLogDto> logs = list.stream()
				.filter(c -> questById.containsKey(c.userQuestId))
				.map(c -> toDto(c, questById.get(c.userQuestId), c.proofId == null ? null : proofById.get(c.proofId),
						c.proofId == null ? null : feedByProof.get(c.proofId)))
				.toList();
		DailyResult result = dailyResults.findById(new DailyResult.Key(userId, day)).orElse(null);
		int done = result != null ? result.doneCount : (int) logs.stream().filter(l -> l.status() == QuestStatus.DONE).count();
		int total = result != null ? result.totalCount : logs.size();
		return new DayLogsDto(day, done, total, logs);
	}

	@Transactional(readOnly = true)
	public DailyLogDetailDto detail(UUID userId, UUID completionId) {
		QuestCompletion completion = completions.findById(completionId)
				.filter(c -> c.userId.equals(userId))
				.orElseThrow(() -> ApiException.notFound("Log not found"));
		UserQuest quest = quests.findById(completion.userQuestId).orElseThrow(() -> ApiException.notFound("Log not found"));
		Proof proof = completion.proofId == null ? null : proofs.findById(completion.proofId).orElse(null);
		UUID feedItemId = proof == null ? null : feed.findFirstByProofIdOrderByCreatedAtAsc(proof.id).map(f -> f.id).orElse(null);
		List<UserSummary> verifiers = List.of();
		if (proof != null) {
			List<UUID> ids = verifications.findByProofIdOrderByCreatedAtAsc(proof.id).stream().map(v -> v.userId).toList();
			Map<UUID, User> byId = userRepository.findByIdIn(ids).stream().collect(Collectors.toMap(u -> u.id, Function.identity()));
			verifiers = ids.stream().map(byId::get).filter(Objects::nonNull).map(UserService::summary).toList();
		}
		return new DailyLogDetailDto(toDto(completion, quest, proof, feedItemId), proof == null ? List.of() : List.copyOf(proof.mlLabels),
				proof == null ? null : proof.mlText, proof == null ? null : proof.status, verifiers);
	}

	private static DailyLogDto toDto(QuestCompletion c, UserQuest quest, Proof proof, UUID feedItemId) {
		return new DailyLogDto(c.id, c.day, QuestService.toDto(quest), c.status, c.slot, quest.slots(), c.value, c.reps, c.summary,
				c.createdAt, proof == null ? null : proof.photoUrl, proof == null ? null : proof.id,
				proof == null ? 0 : proof.verifiedCount, proof == null ? 0 : proof.requiredVerifications, feedItemId);
	}
}
