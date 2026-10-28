package com.dropzone.api.feed;

import com.dropzone.api.auth.CurrentUser;
import com.dropzone.api.common.Dtos.CommentDto;
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
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class CommentController {

	private final CommentService comments;

	public CommentController(CommentService comments) {
		this.comments = comments;
	}

	@GetMapping("/feed/{id}/comments")
	List<CommentDto> list(@CurrentUser UUID userId, @PathVariable UUID id) {
		return comments.list(userId, id);
	}

	@PostMapping("/feed/{id}/comments")
	CommentDto add(@CurrentUser UUID userId, @PathVariable UUID id, @Valid @RequestBody Requests.CreateComment req) {
		return comments.add(userId, id, req.body());
	}

	@PostMapping("/comments/{id}/like")
	CommentDto like(@CurrentUser UUID userId, @PathVariable UUID id) {
		return comments.like(userId, id);
	}

	@DeleteMapping("/comments/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void delete(@CurrentUser UUID userId, @PathVariable UUID id) {
		comments.delete(userId, id);
	}
}
