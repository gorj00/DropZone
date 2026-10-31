package com.dropzone.api.social;

import com.dropzone.api.auth.CurrentUser;
import com.dropzone.api.common.Dtos.FeedItemDto;
import com.dropzone.api.common.Dtos.UserProfileDto;
import com.dropzone.api.common.Paged;
import com.dropzone.api.feed.FeedService;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/users")
public class UserProfileController {

	private final SocialService social;
	private final FeedService feed;

	public UserProfileController(SocialService social, FeedService feed) {
		this.social = social;
		this.feed = feed;
	}

	@GetMapping("/{id}/profile")
	UserProfileDto profile(@CurrentUser UUID userId, @PathVariable UUID id) {
		return social.profile(userId, id);
	}

	@GetMapping("/{id}/feed")
	ResponseEntity<List<FeedItemDto>> feed(@CurrentUser UUID userId, @PathVariable UUID id, @RequestParam(required = false) String cursor,
			@RequestParam(required = false) Integer limit) {
		return Paged.response(feed.userFeed(userId, id, cursor, limit));
	}
}
