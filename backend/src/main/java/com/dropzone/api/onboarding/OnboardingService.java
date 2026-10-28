package com.dropzone.api.onboarding;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.common.Dtos.OnboardingResponse;
import com.dropzone.api.common.Requests;
import com.dropzone.api.domain.Goal;
import com.dropzone.api.domain.UnlockMode;
import com.dropzone.api.domain.User;
import com.dropzone.api.goal.GoalService;
import com.dropzone.api.quest.QuestService;
import com.dropzone.api.user.UserService;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OnboardingService {

	private final UserService users;
	private final GoalService goals;
	private final QuestService quests;

	public OnboardingService(UserService users, GoalService goals, QuestService quests) {
		this.users = users;
		this.goals = goals;
		this.quests = quests;
	}

	@Transactional
	public OnboardingResponse onboard(UUID userId, Requests.Onboarding req) {
		User user = users.get(userId);
		if (user.onboarded) {
			throw ApiException.conflict("Onboarding is already done");
		}
		validate(req);
		users.startTrial(user);
		UnlockMode mode = req.unlockMode() == null ? UnlockMode.WHOLE_DAY : req.unlockMode();
		if (mode == UnlockMode.MINUTES) {
			users.requirePro(user, "Minutes unlock");
		}
		if (req.questCodes().isEmpty()) {
			throw ApiException.validation("Pick at least one quest");
		}
		quests.validateCodes(user, req.path(), req.questCodes());
		users.applyLockedApps(user, req.lockedApps());
		user.path = req.path();
		if (req.weightUnit() != null) {
			user.weightUnit = req.weightUnit();
		}
		if (req.lengthUnit() != null) {
			user.lengthUnit = req.lengthUnit();
		}
		user.unlockMode = mode;
		Goal goal = goals.create(user, req);
		quests.applyCatalogQuests(user, req.path(), req.questCodes(), req.questSettings());
		user.onboarded = true;
		return new OnboardingResponse(users.toDto(user), goals.toDto(goal));
	}

	private static void validate(Requests.Onboarding req) {
		GoalService.validate(req.path(), req.metric(), req.unit(), req.startValue(), req.goalValue());
	}
}
