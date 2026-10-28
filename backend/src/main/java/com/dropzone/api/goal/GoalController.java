package com.dropzone.api.goal;

import com.dropzone.api.auth.CurrentUser;
import com.dropzone.api.common.Dtos.CheckpointDto;
import com.dropzone.api.common.Dtos.CheckpointSocialDto;
import com.dropzone.api.common.Dtos.CountDto;
import com.dropzone.api.common.Dtos.GoalDto;
import com.dropzone.api.common.Dtos.GoalHistoryDto;
import com.dropzone.api.common.Dtos.MeasurementDto;
import com.dropzone.api.common.Dtos.PastGoalDto;
import com.dropzone.api.common.Requests;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class GoalController {

	private final GoalService goals;
	private final CheckpointSocialService checkpointSocial;

	public GoalController(GoalService goals, CheckpointSocialService checkpointSocial) {
		this.goals = goals;
		this.checkpointSocial = checkpointSocial;
	}

	@GetMapping("/goal")
	GoalDto goal(@CurrentUser UUID userId) {
		return goals.current(userId);
	}

	@PostMapping("/goal")
	GoalDto newGoal(@CurrentUser UUID userId, @Valid @RequestBody Requests.NewGoal req) {
		return goals.newGoal(userId, req);
	}

	@GetMapping("/goals/history")
	List<PastGoalDto> pastGoals(@CurrentUser UUID userId) {
		return goals.pastGoals(userId);
	}

	@PostMapping("/goal/apply-defaults")
	CountDto applyDefaults(@CurrentUser UUID userId) {
		return goals.applyDefaults(userId);
	}

	@PatchMapping("/goal")
	GoalDto updateGoal(@CurrentUser UUID userId, @Valid @RequestBody Requests.UpdateGoal req) {
		return goals.updateGoal(userId, req);
	}

	@GetMapping("/goal/history")
	GoalHistoryDto history(@CurrentUser UUID userId) {
		return goals.history(userId);
	}

	@PostMapping("/goal/progress")
	GoalDto progress(@CurrentUser UUID userId, @Valid @RequestBody Requests.GoalProgress req) {
		return goals.logProgress(userId, req);
	}

	@GetMapping("/measurements")
	List<MeasurementDto> measurements(@CurrentUser UUID userId) {
		return goals.measurements(userId);
	}

	@DeleteMapping("/measurements/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void deleteMeasurement(@CurrentUser UUID userId, @PathVariable UUID id) {
		goals.deleteMeasurement(userId, id);
	}

	@GetMapping("/checkpoints/{id}/social")
	CheckpointSocialDto social(@CurrentUser UUID userId, @PathVariable UUID id) {
		return checkpointSocial.get(userId, id);
	}

	@PatchMapping("/checkpoints/{id}")
	CheckpointDto update(@CurrentUser UUID userId, @PathVariable UUID id, @RequestBody Map<String, Object> body) {
		return goals.update(userId, id, body);
	}

	@PostMapping("/checkpoints/{id}/proof")
	CheckpointDto proof(@CurrentUser UUID userId, @PathVariable UUID id, @Valid @RequestBody Requests.CheckpointProof req) {
		return goals.submitProof(userId, id, req);
	}
}
