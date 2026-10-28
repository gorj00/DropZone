package com.dropzone.api.leaderboard;

import com.dropzone.api.auth.CurrentUser;
import com.dropzone.api.common.Dtos.LeaderboardDto;
import com.dropzone.api.domain.Period;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class LeaderboardController {

	private final LeaderboardService leaderboard;

	public LeaderboardController(LeaderboardService leaderboard) {
		this.leaderboard = leaderboard;
	}

	@GetMapping("/api/v1/leaderboard")
	LeaderboardDto leaderboard(@CurrentUser UUID userId, @RequestParam(defaultValue = "WEEK") Period period) {
		return leaderboard.leaderboard(userId, period);
	}
}
