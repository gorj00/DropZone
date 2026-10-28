package com.dropzone.api.feed;

import com.dropzone.api.auth.CurrentUser;
import com.dropzone.api.common.Dtos.CountDto;
import com.dropzone.api.common.Dtos.FeedItemDto;
import com.dropzone.api.common.Dtos.ProofViewDto;
import com.dropzone.api.common.Paged;
import com.dropzone.api.common.Requests;
import com.dropzone.api.domain.FeedScope;
import jakarta.validation.Valid;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class FeedController {

	private final FeedService feed;

	public FeedController(FeedService feed) {
		this.feed = feed;
	}

	@GetMapping("/feed")
	ResponseEntity<List<FeedItemDto>> list(@CurrentUser UUID userId, @RequestParam(defaultValue = "FRIENDS") FeedScope scope,
			@RequestParam(required = false) Instant before, @RequestParam(required = false) String cursor,
			@RequestParam(required = false) Integer limit) {
		return Paged.response(feed.list(userId, scope, before, cursor, limit));
	}

	@GetMapping("/feed/{id}")
	FeedItemDto item(@CurrentUser UUID userId, @PathVariable UUID id) {
		return feed.item(userId, id);
	}

	@PatchMapping("/feed/{id}")
	FeedItemDto update(@CurrentUser UUID userId, @PathVariable UUID id, @Valid @RequestBody Requests.UpdatePost req) {
		return feed.setPublic(userId, id, req.isPublic());
	}

	@DeleteMapping("/feed/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void delete(@CurrentUser UUID userId, @PathVariable UUID id) {
		feed.delete(userId, id);
	}

	@GetMapping("/feed/pending-count")
	CountDto pendingCount(@CurrentUser UUID userId) {
		return feed.pendingCount(userId);
	}

	@GetMapping("/proofs/{id}")
	ProofViewDto proof(@CurrentUser UUID userId, @PathVariable UUID id) {
		return feed.proof(userId, id);
	}

	@PostMapping("/proofs/{id}/withdraw")
	ProofViewDto withdraw(@CurrentUser UUID userId, @PathVariable UUID id) {
		return feed.withdraw(userId, id);
	}

	@PostMapping("/proofs/{id}/use-ai")
	ProofViewDto useAi(@CurrentUser UUID userId, @PathVariable UUID id) {
		return feed.useAi(userId, id);
	}

	@PostMapping("/proofs/{id}/verify")
	FeedItemDto verify(@CurrentUser UUID userId, @PathVariable UUID id) {
		return feed.verify(userId, id);
	}

	@PostMapping("/feed/{id}/hype")
	FeedItemDto hype(@CurrentUser UUID userId, @PathVariable UUID id) {
		return feed.hype(userId, id);
	}
}
