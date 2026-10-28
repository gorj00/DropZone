package com.dropzone.api.social;

import com.dropzone.api.auth.CurrentUser;
import com.dropzone.api.common.Dtos.FriendRequestDto;
import com.dropzone.api.common.Dtos.InviteDto;
import com.dropzone.api.common.Dtos.InviteResultDto;
import com.dropzone.api.common.Dtos.RequestsDto;
import com.dropzone.api.common.Dtos.UserSummary;
import com.dropzone.api.common.Requests;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/social")
public class SocialController {

	private final SocialService social;

	public SocialController(SocialService social) {
		this.social = social;
	}

	@GetMapping("/friends")
	List<UserSummary> friends(@CurrentUser UUID userId) {
		return social.friends(userId);
	}

	@GetMapping("/search")
	List<UserSummary> search(@CurrentUser UUID userId, @RequestParam(defaultValue = "") String q) {
		return social.search(userId, q);
	}

	@PostMapping("/search")
	List<UserSummary> search(@CurrentUser UUID userId, @RequestBody Requests.Search req) {
		return social.search(userId, req.q());
	}

	@GetMapping("/requests")
	RequestsDto requests(@CurrentUser UUID userId) {
		return social.requests(userId);
	}

	@PostMapping("/requests")
	FriendRequestDto send(@CurrentUser UUID userId, @Valid @RequestBody Requests.CreateFriendRequest req) {
		return social.sendRequest(userId, req.userId());
	}

	@PostMapping("/requests/{id}/accept")
	UserSummary accept(@CurrentUser UUID userId, @PathVariable UUID id) {
		return social.accept(userId, id);
	}

	@DeleteMapping("/requests/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void deleteRequest(@CurrentUser UUID userId, @PathVariable UUID id) {
		social.deleteRequest(userId, id);
	}

	@DeleteMapping("/friends/{friendId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void removeFriend(@CurrentUser UUID userId, @PathVariable UUID friendId) {
		social.removeFriend(userId, friendId);
	}

	@GetMapping("/invite")
	InviteDto invite(@CurrentUser UUID userId) {
		return social.invite(userId);
	}

	@PostMapping("/invite/{code}/accept")
	InviteResultDto acceptInvite(@CurrentUser UUID userId, @PathVariable String code) {
		return social.acceptInvite(userId, code);
	}
}
